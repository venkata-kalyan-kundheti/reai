import { HttpError } from './httpError.js';
import { classifyError, USER_MESSAGES } from '../services/llm/errors.js';

const STATUS_BY_CODE = {
  RATE_LIMITED: 429,
  QUOTA_EXHAUSTED: 429,
  QUEUE_TIMEOUT: 429,
  TIMEOUT: 504,
  UPSTREAM_UNAVAILABLE: 503,
  NETWORK: 503,
  CONTENT_BLOCKED: 422,
  EMPTY_RESPONSE: 502,
  AUTH_ERROR: 502,
  MODEL_NOT_FOUND: 502,
  BAD_REQUEST: 502,
  CANCELLED: 499,
};

/** Convert anything an LLM call can throw into an HttpError with a friendly message + Retry-After. */
export function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const e = classifyError(err);
  const status = STATUS_BY_CODE[e.code] || 502;
  const he = new HttpError(status, e.code, USER_MESSAGES[e.code] || USER_MESSAGES.UNKNOWN);
  if ([429, 503].includes(status)) he.retryAfterSec = Math.max(5, Math.ceil((e.retryAfterMs ?? 15000) / 1000));
  return he;
}
