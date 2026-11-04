import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { getLlmProvider } from '../llm/index.js';
import { buildAskPrompt, buildSystemPrompt } from '../llm/prompts.js';
import { parseNdjsonStream } from '../llm/ndjsonParser.js';
import { prepareSegment } from './validateSegments.js';
import { followupId } from '../../utils/ids.js';

export async function askQuestion({ generationId, question, selectionText, selectionRect, anchorSegmentId }) {
  const gen = await Generation.findById(generationId);
  if (!gen) throw new Error('Generation not found');

  let relevantChunks = [];
  if (selectionRect) {
    const { page, rect } = selectionRect;
    relevantChunks = await Chunk.find({
      documentId: gen.documentId,
      page,
      'bbox.x': { $lte: rect.x + rect.w },
      'bbox.w': { $gt: 0 },
    }).lean();

    relevantChunks = relevantChunks.filter((c) => {
      const b = c.bbox;
      return !(
        b.x > rect.x + rect.w ||
        b.x + b.w < rect.x ||
        b.y > rect.y + rect.h ||
        b.y + b.h < rect.y
      );
    });
  } else {
    // Fallback to all chunks or top 10 chunks
    relevantChunks = await Chunk.find({ documentId: gen.documentId }).limit(10).lean();
  }

  const chunkMap = new Map(relevantChunks.map((c) => [c.chunkId, c]));
  const validChunkIds = new Set(chunkMap.keys());
  const llm = getLlmProvider();
  const prompt = buildAskPrompt(question, relevantChunks, selectionText);
  const rawStream = llm.generateStream({
    system: buildSystemPrompt(gen.level, gen.goal),
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
    kind: 'ask',
    anchorSegmentId: anchorSegmentId || null,
    selectionText: selectionText || null,
    selectionRect: selectionRect || null,
    question,
    answerSegments,
    createdAt: new Date(),
  };

  await Generation.updateOne(
    { _id: gen._id },
    { $push: { followups: followup } }
  );

  return followup;
}

