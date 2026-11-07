import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { HttpError } from '../../utils/httpError.js';
import { getLlmProvider } from '../llm/index.js';
import { buildAskPrompt, buildSystemPrompt } from '../llm/prompts.js';
import { parseNdjsonStream } from '../llm/ndjsonParser.js';
import { PRIORITY } from '../llm/gemini/scheduler.js';
import { prepareSegment } from './validateSegments.js';
import { assembleContext, buildOutline, chunksInRegion } from './context.js';
import { followupId, followupSegmentId } from '../../utils/ids.js';

export const ALL_CHUNK_FIELDS = 'chunkId page order type text bbox';

/** Find a segment (main explanation OR a follow-up answer) by id. */
export function findSegment(gen, segmentId) {
  const main = gen.segments.find((s) => s.segmentId === segmentId);
  if (main) return main;
  for (const f of gen.followups || []) {
    const hit = f.answerSegments?.find((s) => s.segmentId === segmentId);
    if (hit) return hit;
  }
  return null;
}

/** Run one short, high-priority LLM call and collect its segments. */
export async function collectSegments({ system, prompt, chunkMap, validChunkIds, fId, signal, onNotice }) {
  const llm = getLlmProvider();
  const raw = llm.generateStream({
    system,
    prompt,
    signal,
    priority: PRIORITY.INTERACTIVE,
    maxOutputTokens: 2048,
    onNotice,
  });

  const segments = [];
  let order = 0;
  for await (const seg of parseNdjsonStream(raw, validChunkIds)) {
    segments.push(prepareSegment(seg, order++, chunkMap, { idFn: (n) => followupSegmentId(fId, n) }));
  }
  return segments;
}

export async function askQuestion({ generationId, question, selectionText, selectionRect, anchorSegmentId, signal }) {
  const gen = await Generation.findById(generationId);
  if (!gen) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  const allChunks = await Chunk.find({ documentId: gen.documentId }).sort({ order: 1 }).select(ALL_CHUNK_FIELDS).lean();
  const byId = new Map(allChunks.map((c) => [c.chunkId, c]));

  const selected = selectionRect ? chunksInRegion(allChunks, selectionRect.page, selectionRect.rect).slice(0, 12) : [];
  const anchorSeg = anchorSegmentId ? findSegment(gen, anchorSegmentId) : null;
  const anchorChunks = (anchorSeg?.sources || []).map((id) => byId.get(id)).filter(Boolean);

  const { chunks, selectedIds } = assembleContext(allChunks, {
    selected,
    anchor: selected.length ? [] : anchorChunks,
    query: `${question} ${selectionText || ''}`,
    neighbourRadius: selected.length ? 2 : 1,
  });

  const context = chunks.length ? chunks : allChunks.slice(0, 8); // last resort: the start of the document
  const chunkMap = new Map(context.map((c) => [c.chunkId, c]));
  const fId = followupId();

  const answerSegments = await collectSegments({
    system: buildSystemPrompt(gen.level, gen.goal, 'ask'),
    prompt: buildAskPrompt({
      question,
      selectionText,
      chunks: context,
      selectedIds,
      outline: buildOutline(allChunks, { maxEntries: 30, maxChars: 1500 }),
      anchorText: anchorSeg?.text,
    }),
    chunkMap,
    validChunkIds: new Set(chunkMap.keys()),
    fId,
    signal,
  });

  if (!answerSegments.length) throw new HttpError(502, 'EMPTY_RESPONSE', 'The AI returned an empty answer. Please try again.');

  const followup = {
    followupId: fId,
    kind: 'ask',
    anchorSegmentId: anchorSegmentId || null,
    selectionText: selectionText || null,
    selectionRect: selectionRect || null,
    question,
    answerSegments,
    createdAt: new Date(),
  };

  await Generation.updateOne({ _id: gen._id }, { $push: { followups: followup } });
  return followup;
}
