import mongoose from 'mongoose';
import { Generation } from '../models/Generation.js';
import { Document } from '../models/Document.js';
import { HttpError } from '../utils/httpError.js';
import { createGenerationSchema } from '../schemas/api.js';
import { runGeneration } from '../services/generation/generate.js';
import { runner } from '../services/generation/runner.js';
import { env } from '../config/env.js';

export async function createGeneration(req, res) {
  const body = createGenerationSchema.parse(req.body);
  const { documentId, level, goal, question } = body;

  if (!mongoose.isValidObjectId(documentId)) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  const doc = await Document.findOne({ _id: documentId, ownerGuestId: req.guestId });
  if (!doc) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  if (doc.status !== 'ready') {
    throw new HttpError(409, 'DOCUMENT_NOT_READY', 'Document is not ready yet');
  }

  const cleanQuestion = (question && typeof question === 'string') ? question.trim() : 'Explain this document';
  const cacheKey = `${level}:${goal}:${cleanQuestion}`;

  // Find any existing generation for this document and cacheKey
  const existing = await Generation.findOne({
    documentId: doc._id,
    cacheKey,
  });

  if (existing) {
    if (existing.status === 'done' && existing.provider === env.LLM_PROVIDER && existing.segments?.length > 0) {
      return res.status(200).json({ generation: existing, cached: true });
    }

    if ((existing.status === 'pending' || existing.status === 'streaming') && existing.provider === env.LLM_PROVIDER) {
      return res.status(202).json({ generation: existing, cached: false });
    }

    // Previous run was with a different provider (e.g. mock), failed, or empty.
    // Reset it in place so the unique index { documentId: 1, cacheKey: 1 } is never violated.
    existing.ownerGuestId = req.guestId;
    existing.level = level;
    existing.goal = goal;
    existing.question = cleanQuestion;
    existing.status = 'pending';
    existing.provider = env.LLM_PROVIDER;
    existing.model = env.LLM_MODEL;
    existing.segments = [];
    existing.followups = [];
    existing.errorCode = undefined;
    existing.errorMessage = undefined;
    existing.startedAt = new Date();
    existing.finishedAt = undefined;
    await existing.save();

    setImmediate(() => {
      runGeneration(existing._id);
    });

    return res.status(202).json({ generation: existing, cached: false });
  }

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

  setImmediate(() => {
    runGeneration(gen._id);
  });

  res.status(202).json({ generation: gen, cached: false });
}

export async function getGeneration(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const generation = await Generation.findOne({ _id: id, ownerGuestId: req.guestId }).lean();
  if (!generation) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  res.json({ generation });
}

export async function streamGeneration(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  const generation = await Generation.findOne({ _id: id, ownerGuestId: req.guestId });
  if (!generation) {
    throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  }

  // Disable timeouts so Gemini has full time to stream chunk-by-chunk
  req.socket?.setTimeout(0);
  res.setTimeout?.(0);
  req.socket?.setKeepAlive?.(true);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send periodic keep-alive comments so browser never drops connection
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  // If already done, emit full state immediately
  if (generation.status === 'done') {
    clearInterval(keepAlive);
    res.write(`event: meta\ndata: ${JSON.stringify({ generationId: String(generation._id), status: 'done', cached: true })}\n\n`);
    for (const seg of generation.segments) {
      res.write(`event: segment\ndata: ${JSON.stringify(seg)}\n\n`);
    }
    res.write(`event: done\ndata: ${JSON.stringify({ segmentCount: generation.segments.length, finishedAt: generation.finishedAt })}\n\n`);
    return res.end();
  }

  const unsubscribe = runner.subscribe(generation._id, (ev) => {
    res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
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

