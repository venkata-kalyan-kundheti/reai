import { HttpError } from './httpError.js';

/**
 * Tiny in-memory sliding-window limiter keyed by (guest, bucket).
 * It only counts requests that will really consume LLM quota (cache hits are free),
 * so one visitor cannot drain the shared Gemini quota for everybody else.
 */
const hits = new Map(); // `${bucket}:${guestId}` -> number[]
const WINDOW_MS = 10 * 60 * 1000;

export function consumeGuestQuota(guestId, bucket, limit, now = Date.now()) {
  const key = `${bucket}:${guestId}`;
  const cutoff = now - WINDOW_MS;
  const list = (hits.get(key) || []).filter((t) => t > cutoff);
  if (list.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((list[0] + WINDOW_MS - now) / 1000));
    hits.set(key, list);
    const err = new HttpError(429, 'RATE_LIMITED', `You have used many AI requests recently. Please wait ${retryAfterSec}s and try again.`);
    err.retryAfterSec = retryAfterSec;
    throw err;
  }
  list.push(now);
  hits.set(key, list);
}

export function _resetGuestQuotaForTests() {
  hits.clear();
}
