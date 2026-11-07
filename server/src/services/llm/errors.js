/**
 * One error type for everything that can go wrong when talking to an LLM.
 * Callers only look at `code`, `retryable`, `retryAfterMs` and `partial` -
 * they never parse provider-specific messages.
 */
export class LlmError extends Error {
  constructor(code, message, opts = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = Boolean(opts.retryable);
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.status = opts.status ?? null; // upstream HTTP status if any
    this.partial = Boolean(opts.partial); // true => some text was already streamed before failing
    this.dropThinking = Boolean(opts.dropThinking);
    if (opts.cause) this.cause = opts.cause;
  }
}

/** User-facing wording per code (never leak raw provider text to the browser). */
export const USER_MESSAGES = {
  RATE_LIMITED: 'The AI service is busy right now. We will retry automatically.',
  QUOTA_EXHAUSTED: 'The daily AI quota is used up. Please try again later.',
  QUEUE_TIMEOUT: 'Too many requests are waiting for the AI service. Please try again in a moment.',
  TIMEOUT: 'The AI service took too long to respond.',
  UPSTREAM_UNAVAILABLE: 'The AI service is temporarily unavailable.',
  NETWORK: 'Could not reach the AI service. Check the connection and retry.',
  CONTENT_BLOCKED: 'The AI service declined to process this content.',
  AUTH_ERROR: 'The AI service is not configured correctly (API key problem).',
  MODEL_NOT_FOUND: 'The configured AI model was not found.',
  BAD_REQUEST: 'The AI service rejected the request.',
  EMPTY_RESPONSE: 'The AI service returned an empty answer.',
  CANCELLED: 'The request was cancelled.',
  UNKNOWN: 'Something went wrong while talking to the AI service.',
};

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** Pull "retryDelay": "34s" or "Please retry in 34.5s" out of a Gemini error body. */
export function parseRetryAfterMs(message = '') {
  const m1 = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(message);
  if (m1) return Math.ceil(parseFloat(m1[1]) * 1000);
  const m2 = /retry in\s+(\d+(?:\.\d+)?)\s*s/i.exec(message);
  if (m2) return Math.ceil(parseFloat(m2[1]) * 1000);
  return null;
}

/**
 * Turn anything thrown by the SDK / fetch / our own timers into an LlmError.
 * `ctx.timedOut` is set by the provider when ITS timer aborted the request.
 */
export function classifyError(err, ctx = {}) {
  if (err instanceof LlmError) return err;

  const message = String(err?.message || err || '');
  const status = Number(err?.status ?? err?.code ?? err?.response?.status) || null;
  const retryAfterMs = parseRetryAfterMs(message);

  if (ctx.timedOut) {
    return new LlmError('TIMEOUT', USER_MESSAGES.TIMEOUT, { retryable: true, cause: err });
  }
  if (ctx.callerAborted || (err?.name === 'AbortError' && !ctx.timedOut)) {
    return new LlmError('CANCELLED', USER_MESSAGES.CANCELLED, { retryable: false, cause: err });
  }

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
    // Per-day quotas never recover within a retry window: fail fast instead of hammering the API.
    if (/PerDay|per day|daily/i.test(message)) {
      return new LlmError('QUOTA_EXHAUSTED', USER_MESSAGES.QUOTA_EXHAUSTED, {
        retryable: false,
        status: 429,
        cause: err,
      });
    }
    return new LlmError('RATE_LIMITED', USER_MESSAGES.RATE_LIMITED, {
      retryable: true,
      retryAfterMs: retryAfterMs ?? 15000,
      status: 429,
      cause: err,
    });
  }

  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return new LlmError('AUTH_ERROR', USER_MESSAGES.AUTH_ERROR, { retryable: false, status, cause: err });
  }
  if (status === 404 || /models\/.+ is not found|NOT_FOUND/i.test(message)) {
    return new LlmError('MODEL_NOT_FOUND', USER_MESSAGES.MODEL_NOT_FOUND, { retryable: false, status, cause: err });
  }
  if (status === 400 || /INVALID_ARGUMENT/i.test(message)) {
    // Some models reject `thinkingBudget: 0`; the provider drops the setting and tries once more.
    const dropThinking = /thinking/i.test(message);
    return new LlmError('BAD_REQUEST', USER_MESSAGES.BAD_REQUEST, {
      retryable: dropThinking,
      dropThinking,
      status: 400,
      cause: err,
    });
  }
  if (status === 408 || status === 504 || /DEADLINE_EXCEEDED/i.test(message)) {
    return new LlmError('TIMEOUT', USER_MESSAGES.TIMEOUT, { retryable: true, status, cause: err });
  }
  if ((status && status >= 500) || /UNAVAILABLE|overloaded|INTERNAL/i.test(message)) {
    return new LlmError('UPSTREAM_UNAVAILABLE', USER_MESSAGES.UPSTREAM_UNAVAILABLE, {
      retryable: true,
      retryAfterMs,
      status: status || 503,
      cause: err,
    });
  }

  const nodeCode = err?.code || err?.cause?.code;
  if (NETWORK_CODES.has(nodeCode) || /fetch failed|network|socket hang up|terminated|other side closed/i.test(message)) {
    return new LlmError('NETWORK', USER_MESSAGES.NETWORK, { retryable: true, cause: err });
  }

  return new LlmError('UNKNOWN', USER_MESSAGES.UNKNOWN, { retryable: false, cause: err });
}

/** Exponential backoff with full jitter; honours the server's Retry-After when present. */
export function backoffDelayMs(attempt, retryAfterMs = null, { baseMs = 1500, maxMs = 30000 } = {}) {
  if (retryAfterMs) return retryAfterMs + Math.floor(Math.random() * 750);
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}
