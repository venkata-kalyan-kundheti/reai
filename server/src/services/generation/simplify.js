import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { getLlmProvider } from '../llm/index.js';
import { buildSimplifyPrompt, buildSystemPrompt } from '../llm/prompts.js';
import { parseNdjsonStream } from '../llm/ndjsonParser.js';
import { prepareSegment } from './validateSegments.js';
import { followupId } from '../../utils/ids.js';

export async function simplifySegment({ generationId, segmentId }) {
  const gen = await Generation.findById(generationId);
  if (!gen) throw new Error('Generation not found');

  const segment = gen.segments.find((s) => s.segmentId === segmentId);
  if (!segment) throw new Error('Segment not found');

  const sourceChunks = await Chunk.find({
    documentId: gen.documentId,
    chunkId: { $in: segment.sources },
  }).lean();

  const chunkMap = new Map(sourceChunks.map((c) => [c.chunkId, c]));
  const validChunkIds = new Set(chunkMap.keys());
  const llm = getLlmProvider();
  const prompt = buildSimplifyPrompt(segment.text, sourceChunks);
  const rawStream = llm.generateStream({
    system: buildSystemPrompt('beginner', gen.goal),
    prompt,
  });

  const fId = followupId();
  const answerSegments = [];
  let order = 0;

  for await (const rawSeg of parseNdjsonStream(rawStream, validChunkIds)) {
    answerSegments.push(prepareSegment(rawSeg, order++, chunkMap));
  }

  const followup = {
    followupId: fId,
    kind: 'simplify',
    anchorSegmentId: segmentId,
    selectionText: null,
    selectionRect: null,
    question: `Simplify: "${segment.text.slice(0, 100)}..."`,
    answerSegments,
    createdAt: new Date(),
  };

  await Generation.updateOne(
    { _id: gen._id },
    { $push: { followups: followup } }
  );

  return followup;
}

