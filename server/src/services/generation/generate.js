import { Generation } from '../../models/Generation.js';
import { Chunk } from '../../models/Chunk.js';
import { getLlmProvider } from '../llm/index.js';
import { buildSystemPrompt } from '../llm/prompts.js';
import { classifyError, USER_MESSAGES } from '../llm/errors.js';
import { sectionChunks, targetSegmentCount } from './sectioning.js';
import { buildOutline } from './context.js';
import { prepareSegment } from './validateSegments.js';
import { runSection } from './sectionRunner.js';
import { runner } from './runner.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/** Errors a user can fix by simply trying again later (everything else needs a config/content change). */
const NOT_RESUMABLE = new Set(['AUTH_ERROR', 'MODEL_NOT_FOUND', 'BAD_REQUEST', 'CONTENT_BLOCKED']);

/**
 * Register the job synchronously (so "is it running?" is always accurate) and start it
 * on the next tick, after the HTTP response has been sent.
 */
export function startGeneration(gen, { resume = false } = {}) {
  runner.reset(gen._id);
  runner.register(gen._id, { documentId: gen.documentId, guestId: gen.ownerGuestId });
  setImmediate(() => {
    runGeneration(gen._id, { resume }).catch((err) => logger.error({ err }, 'runGeneration crashed'));
  });
}

export async function runGeneration(generationId, { resume = false } = {}) {
  const id = String(generationId);
  const signal = runner.getSignal(id);

  try {
    const gen = await Generation.findById(generationId);
    if (!gen) return;

    const chunks = await Chunk.find({ documentId: gen.documentId })
      .sort({ order: 1 })
      .select('chunkId page order type text')
      .lean();
    if (!chunks.length) throw Object.assign(new Error('Document has no extractable text'), { code: 'NO_CHUNKS' });

    const chunkMap = new Map(chunks.map((c) => [c.chunkId, c]));
    const validChunkIds = new Set(chunkMap.keys());
    const sections = sectionChunks(chunks);
    const outline = buildOutline(chunks);
    const llm = getLlmProvider();
    const system = buildSystemPrompt(gen.level, gen.goal, 'explain');

    const startIndex = resume ? Math.min(gen.progress?.sectionIndex || 0, sections.length) : 0;
    const emitted = resume ? gen.segments.map((s) => s.toObject?.() ?? s) : [];
    let order = emitted.length;

    await Generation.updateOne(
      { _id: gen._id },
      {
        status: 'streaming',
        startedAt: gen.startedAt || new Date(),
        provider: env.LLM_PROVIDER,
        model: env.LLM_MODEL || 'default',
        errorCode: null,
        errorMessage: null,
        'progress.sectionCount': sections.length,
        ...(resume ? {} : { 'progress.sectionIndex': 0 }),
      }
    );

    runner.emitEvent(id, 'meta', {
      generationId: id,
      status: 'streaming',
      level: gen.level,
      goal: gen.goal,
      question: gen.question,
      resumed: resume,
      sectionCount: sections.length,
    });

    let usageCalls = 0;
    let usageTokens = 0;

    for (let i = startIndex; i < sections.length; i++) {
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });

      runner.emitEvent(id, 'progress', { sectionIndex: i, sectionCount: sections.length, state: 'writing' });

      const section = sections[i];
      const previousTail = emitted
        .slice(-3)
        .map((s) => s.text.slice(0, 140));
      const initialWritten = emitted.filter((s) => s.section === i);

      const result = await runSection({
        llm,
        system,
        chunks: section,
        sectionIndex: i,
        sectionCount: sections.length,
        outline,
        question: gen.question,
        previousTail: initialWritten.length ? [] : previousTail,
        targetSegments: targetSegmentCount(section.length),
        validChunkIds,
        signal,
        initialWritten,
        onNotice: (n) => runner.emitEvent(id, 'notice', n),
        onSegment: async (raw) => {
          const seg = prepareSegment(raw, order++, chunkMap, { section: i });
          emitted.push(seg);
          await Generation.updateOne({ _id: gen._id }, { $push: { segments: seg } });
          runner.emitEvent(id, 'segment', seg);
        },
      });

      usageCalls += result.calls;
      usageTokens += result.tokens;

      await Generation.updateOne(
        { _id: gen._id },
        { 'progress.sectionIndex': i + 1, $inc: { 'usage.calls': result.calls, 'usage.tokens': result.tokens } }
      );
      runner.emitEvent(id, 'progress', { sectionIndex: i + 1, sectionCount: sections.length, state: 'done' });
    }

    await Generation.updateOne({ _id: gen._id }, { status: 'done', finishedAt: new Date() });
    runner.emitEvent(id, 'done', { segmentCount: emitted.length, finishedAt: new Date(), calls: usageCalls, tokens: usageTokens });
  } catch (err) {
    const superseded = signal?.aborted && signal.reason === 'superseded';
    const e = classifyError(err);

    let code = e.code;
    let message = USER_MESSAGES[e.code] || e.message;
    let retryable = !NOT_RESUMABLE.has(e.code);

    if (err?.code === 'NO_CHUNKS') {
      code = 'NO_TEXT';
      message = 'This document has no readable text to explain.';
      retryable = false;
    } else if (signal?.aborted) {
      code = 'CANCELLED';
      message = superseded
        ? 'Paused because you switched to another view. Press Resume to continue.'
        : 'Generation was cancelled.';
      retryable = true;
    }

    const retryAfterSec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : undefined;
    logger.error({ err: e, code, generationId: id }, 'Generation stopped');

    await Generation.updateOne(
      { _id: generationId },
      { status: 'failed', errorCode: code, errorMessage: message, errorRetryable: retryable, retryAfterSec }
    ).catch(() => {});

    runner.emitEvent(id, 'error', { code, message, retryable, retryAfterSec });
  } finally {
    runner.unregister(id);
  }
}
