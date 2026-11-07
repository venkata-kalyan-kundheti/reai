import mongoose from 'mongoose';
import { Generation } from '../models/Generation.js';
import { Document } from '../models/Document.js';
import { HttpError } from '../utils/httpError.js';
import { consumeGuestQuota } from '../utils/guestQuota.js';
import { createGenerationSchema } from '../schemas/api.js';
import { startGeneration } from '../services/generation/generate.js';
import { runner } from '../services/generation/runner.js';
import { env } from '../config/env.js';

const DEFAULT_QUESTION = 'Explain this document';

function sse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function createGeneration(req, res) {
  const { documentId, level, goal, question } = createGenerationSchema.parse(req.body);

  if (!mongoose.isValidObjectId(documentId)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }
  const doc = await Document.findOne({ _id: documentId, ownerGuestId: req.guestId });
  if (!doc) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  if (doc.status !== 'ready') throw new HttpError(409, 'DOCUMENT_NOT_READY', 'Document is not ready yet');

  const cleanQuestion = typeof question === 'string' && question.trim() ? question.trim() : DEFAULT_QUESTION;
  // Once diagram regions exist the model sees different input, so it is a different cache entry.
  const figureSuffix = doc.visionStatus === 'done' && doc.regionCount > 0 ? ':fig' : '';
  const cacheKey = `${level}:${goal}:${cleanQuestion}${figureSuffix}`;

  const existing = await Generation.findOne({ documentId: doc._id, cacheKey });

  if (existing) {
    const running = runner.isActive(existing._id);

    if (existing.status === 'done' && existing.provider === env.LLM_PROVIDER && existing.segments?.length > 0) {
      return res.status(200).json({ generation: existing, cached: true });
    }
    if ((existing.status === 'pending' || existing.status === 'streaming') && running) {
      return res.status(202).json({ generation: existing, cached: false });
    }

    // Failed, interrupted (server restart) or produced by another provider.
    // Resume when a previous run of the SAME provider already wrote part of the answer.
    const canResume =
      existing.provider === env.LLM_PROVIDER &&
      existing.errorRetryable !== false &&
      existing.segments.length > 0 &&
      existing.progress?.sectionCount > 0;

    consumeGuestQuota(req.guestId, 'generation', env.GENERATIONS_PER_10_MIN);
    runner.cancelOthers(doc._id, req.guestId, existing._id);

    if (canResume) {
      existing.status = 'pending';
      existing.errorCode = undefined;
      existing.errorMessage = undefined;
      await existing.save();
      startGeneration(existing, { resume: true });
      return res.status(202).json({ generation: existing, cached: false, resumed: true });
    }

    Object.assign(existing, {
      ownerGuestId: req.guestId,
      level,
      goal,
      question: cleanQuestion,
      status: 'pending',
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      segments: [],
      followups: [],
      errorCode: undefined,
      errorMessage: undefined,
      errorRetryable: true,
      retryAfterSec: undefined,
      progress: { sectionIndex: 0, sectionCount: 0 },
      usage: { calls: 0, tokens: 0 },
      startedAt: new Date(),
      finishedAt: undefined,
    });
    await existing.save();
    startGeneration(existing);
    return res.status(202).json({ generation: existing, cached: false });
  }

  consumeGuestQuota(req.guestId, 'generation', env.GENERATIONS_PER_10_MIN);

  const gen = await Generation.create({
    documentId: doc._id,
    ownerGuestId: req.guestId,
    level,
    goal,
    question: cleanQuestion,
    cacheKey,
    status: 'pending',
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
    segments: [],
    followups: [],
    startedAt: new Date(),
  });

  runner.cancelOthers(doc._id, req.guestId, gen._id);
  startGeneration(gen);
  res.status(202).json({ generation: gen, cached: false });
}

export async function getGeneration(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  const generation = await Generation.findOne({ _id: id, ownerGuestId: req.guestId }).lean();
  if (!generation) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  res.json({ generation });
}

export async function streamGeneration(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  const generation = await Generation.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!generation) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');

  // Long-lived response: no socket timeout, proxy buffering off.
  req.socket?.setTimeout(0);
  req.socket?.setKeepAlive?.(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const replayFromDb = () => {
    sse(res, 'meta', {
      generationId: String(generation._id),
      status: generation.status,
      level: generation.level,
      goal: generation.goal,
      question: generation.question,
      cached: generation.status === 'done',
      sectionCount: generation.progress?.sectionCount || 0,
    });
    for (const seg of generation.segments) sse(res, 'segment', seg.toObject?.() ?? seg);
  };

  if (generation.status === 'done') {
    replayFromDb();
    sse(res, 'done', { segmentCount: generation.segments.length, finishedAt: generation.finishedAt });
    return res.end();
  }

  const running = runner.isActive(generation._id);

  if (generation.status === 'failed' || !running) {
    // Failed, or "streaming" in the database but nothing is running (server restarted): never hang the browser.
    replayFromDb();
    sse(res, 'error', {
      code: generation.errorCode || 'INTERRUPTED',
      message: generation.errorMessage || 'Generation was interrupted. Press Resume to continue.',
      retryable: generation.errorRetryable !== false,
      retryAfterSec: generation.retryAfterSec,
    });
    return res.end();
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  const unsubscribe = runner.subscribe(generation._id, (ev) => {
    sse(res, ev.type, ev.data);
    if (ev.type === 'done' || ev.type === 'error') {
      clearInterval(keepAlive);
      res.end();
    }
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
}
