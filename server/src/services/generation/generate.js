import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { getLlmProvider } from '../llm/index.js';
import { buildSystemPrompt, buildUserPrompt } from '../llm/prompts.js';
import { parseNdjsonStream } from '../llm/ndjsonParser.js';
import { sectionChunks } from './sectioning.js';
import { prepareSegment } from './validateSegments.js';
import { runner } from './runner.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

export async function runGeneration(generationId) {
  try {
    const gen = await Generation.findById(generationId);
    if (!gen) return;

    await Generation.updateOne(
      { _id: gen._id },
      { status: 'streaming', startedAt: new Date(), provider: env.LLM_PROVIDER, model: env.LLM_MODEL || 'default' }
    );

    runner.emitEvent(gen._id, 'meta', {
      generationId: String(gen._id),
      status: 'streaming',
      level: gen.level,
      goal: gen.goal,
      question: gen.question,
    });

    const chunks = await Chunk.find({ documentId: gen.documentId }).sort({ order: 1 }).lean();
    const chunkMap = new Map(chunks.map((c) => [c.chunkId, c]));
    const validChunkIds = new Set(chunkMap.keys());

    const sections = sectionChunks(chunks);
    const llm = getLlmProvider();
    const systemPrompt = buildSystemPrompt(gen.level, gen.goal);

    let currentOrder = 0;
    const finalSegments = [];

    for (const section of sections) {
      const userPrompt = buildUserPrompt(section, gen.question);
      const rawStream = llm.generateStream({
        system: systemPrompt,
        prompt: userPrompt,
        model: env.LLM_MODEL,
      });

      const parsedSegments = parseNdjsonStream(rawStream, validChunkIds);
      for await (const rawSeg of parsedSegments) {
        const seg = prepareSegment(rawSeg, currentOrder++, chunkMap);
        finalSegments.push(seg);

        // Update in-memory runner
        runner.emitEvent(gen._id, 'segment', seg);

        // Push into document segments array in DB incrementally
        await Generation.updateOne(
          { _id: gen._id },
          { $push: { segments: seg } }
        );
      }
    }

    await Generation.updateOne(
      { _id: gen._id },
      { status: 'done', finishedAt: new Date() }
    );

    runner.emitEvent(gen._id, 'done', {
      segmentCount: finalSegments.length,
      finishedAt: new Date(),
    });
  } catch (err) {
    logger.error({ err, generationId: String(generationId) }, 'Generation failed');
    await Generation.updateOne(
      { _id: generationId },
      {
        status: 'failed',
        errorCode: 'GENERATION_FAILED',
        errorMessage: err.message || 'Failed to complete generation',
      }
    ).catch(() => {});

    runner.emitEvent(generationId, 'error', {
      code: 'GENERATION_FAILED',
      message: err.message || 'Failed to complete generation',
    });
  }
}

