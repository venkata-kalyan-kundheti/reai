import mongoose from 'mongoose';
import { Generation } from '../models/Generation.js';
import { HttpError } from '../utils/httpError.js';
import { toHttpError } from '../utils/llmHttp.js';
import { consumeGuestQuota } from '../utils/guestQuota.js';
import { askFollowupSchema, simplifyFollowupSchema } from '../schemas/api.js';
import { askQuestion } from '../services/generation/ask.js';
import { simplifySegment } from '../services/generation/simplify.js';
import { env } from '../config/env.js';

async function loadOwnedGeneration(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  const gen = await Generation.findOne({ _id: id, ownerGuestId: req.guestId }).select('_id status');
  if (!gen) throw new HttpError(404, 'GENERATION_NOT_FOUND', 'Generation not found');
  return gen;
}

const INTERACTIVE_DEADLINE_MS = 90_000;

/**
 * Abort the upstream LLM call if the browser goes away (saves quota) or if the whole
 * interactive request (queue wait + retries + generation) exceeds a hard deadline.
 */
function interactiveSignal(res) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('deadline'), INTERACTIVE_DEADLINE_MS);
  timer.unref?.();
  res.on('close', () => {
    clearTimeout(timer);
    if (!res.writableEnded) ac.abort('client-closed');
  });
  return ac;
}

function mapError(err, ac) {
  if (ac.signal.reason === 'deadline') {
    return new HttpError(504, 'TIMEOUT', 'The AI service took too long. Please try again.');
  }
  return toHttpError(err);
}

export async function handleAsk(req, res) {
  const gen = await loadOwnedGeneration(req);
  const body = askFollowupSchema.parse(req.body);
  consumeGuestQuota(req.guestId, 'ask', env.ASKS_PER_10_MIN);

  const ac = interactiveSignal(res);
  try {
    const followup = await askQuestion({
      generationId: gen._id,
      question: body.question,
      selectionText: body.selectionText,
      selectionRect: body.selectionRect,
      anchorSegmentId: body.anchorSegmentId,
      signal: ac.signal,
    });
    res.json({ followup });
  } catch (err) {
    throw mapError(err, ac);
  }
}

export async function handleSimplify(req, res) {
  const gen = await loadOwnedGeneration(req);
  const body = simplifyFollowupSchema.parse(req.body);
  consumeGuestQuota(req.guestId, 'ask', env.ASKS_PER_10_MIN);

  const ac = interactiveSignal(res);
  try {
    const followup = await simplifySegment({
      generationId: gen._id,
      segmentId: body.segmentId,
      signal: ac.signal,
    });
    res.json({ followup });
  } catch (err) {
    throw mapError(err, ac);
  }
}
