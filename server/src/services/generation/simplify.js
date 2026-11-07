import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { HttpError } from '../../utils/httpError.js';
import { buildSimplifyPrompt, buildSystemPrompt } from '../llm/prompts.js';
import { assembleContext } from './context.js';
import { ALL_CHUNK_FIELDS, collectSegments, findSegment } from './ask.js';
import { followupId } from '../../utils/ids.js';

export const MAX_SIMPLIFY_ATTEMPTS = 3;
const inflight = new Set(); // `${generationId}:${segmentId}` - ignore double clicks while one is running

export async function simplifySegment({ generationId, segmentId, signal }) {
  const gen = await Generation.findById(generationId);
  if (!gen) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  const segment = findSegment(gen, segmentId);
  if (!segment) throw new HttpError(404, 'SEGMENT_NOT_FOUND', 'Segment not found');

  const earlier = (gen.followups || []).filter((f) => f.kind === 'simplify' && f.anchorSegmentId === segmentId);
  if (earlier.length >= MAX_SIMPLIFY_ATTEMPTS) {
    throw new HttpError(409, 'SIMPLIFY_LIMIT', 'Already simplified a few times. Try asking a specific question about this part instead.');
  }

  const key = `${generationId}:${segmentId}`;
  if (inflight.has(key)) throw new HttpError(409, 'ALREADY_RUNNING', 'This part is already being re-explained.');
  inflight.add(key);

  try {
    const allChunks = await Chunk.find({ documentId: gen.documentId }).sort({ order: 1 }).select(ALL_CHUNK_FIELDS).lean();
    const byId = new Map(allChunks.map((c) => [c.chunkId, c]));
    const sourceChunks = (segment.sources || []).map((id) => byId.get(id)).filter(Boolean);

    const { chunks } = assembleContext(allChunks, {
      anchor: sourceChunks,
      query: segment.text,
      neighbourRadius: 1,
      maxChars: 6000,
      keywordLimit: sourceChunks.length ? 2 : 5,
    });

    const chunkMap = new Map(chunks.map((c) => [c.chunkId, c]));
    const fId = followupId();

    const answerSegments = await collectSegments({
      system: buildSystemPrompt('beginner', gen.goal, 'simplify'),
      prompt: buildSimplifyPrompt({
        segmentText: segment.text,
        chunks,
        attempt: earlier.length + 1,
        previousExplanations: earlier.flatMap((f) => f.answerSegments.map((s) => s.text)).slice(-4),
      }),
      chunkMap,
      validChunkIds: new Set(chunkMap.keys()),
      fId,
      signal,
    });

    if (!answerSegments.length) throw new HttpError(502, 'EMPTY_RESPONSE', 'The AI returned an empty answer. Please try again.');

    const followup = {
      followupId: fId,
      kind: 'simplify',
      anchorSegmentId: segmentId,
      selectionText: null,
      selectionRect: null,
      question: `Simpler: "${segment.text.slice(0, 80)}${segment.text.length > 80 ? '…' : ''}"`,
      answerSegments,
      createdAt: new Date(),
    };

    await Generation.updateOne({ _id: gen._id }, { $push: { followups: followup } });
    return followup;
  } finally {
    inflight.delete(key);
  }
}
