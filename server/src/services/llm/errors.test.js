import { describe, it, expect } from 'vitest';
import { classifyError, parseRetryAfterMs, backoffDelayMs, LlmError } from './errors.js';

const apiErr = (status, message) => Object.assign(new Error(message), { status });

describe('parseRetryAfterMs', () => {
  it('reads retryDelay from the JSON body', () => {
    expect(parseRetryAfterMs('{"details":[{"retryDelay":"34s"}]}')).toBe(34000);
    expect(parseRetryAfterMs('"retryDelay": "2.5s"')).toBe(2500);
  });
  it('reads "Please retry in Xs" text', () => {
    expect(parseRetryAfterMs('Please retry in 12.3s.')).toBe(12300);
  });
  it('returns null when absent', () => {
    expect(parseRetryAfterMs('nothing here')).toBeNull();
  });
});

describe('classifyError', () => {
  it('429 per-minute => RATE_LIMITED, retryable, uses retryDelay', () => {
    const e = classifyError(apiErr(429, '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"20s"}]}}'));
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(20000);
  });
  it('429 per-day => QUOTA_EXHAUSTED, not retryable', () => {
    const e = classifyError(apiErr(429, 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier'));
    expect(e.code).toBe('QUOTA_EXHAUSTED');
    expect(e.retryable).toBe(false);
  });
  it('503 => UPSTREAM_UNAVAILABLE retryable', () => {
    const e = classifyError(apiErr(503, 'The model is overloaded'));
    expect(e.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(e.retryable).toBe(true);
  });
  it('401/403 => AUTH_ERROR not retryable', () => {
    expect(classifyError(apiErr(403, 'PERMISSION_DENIED')).code).toBe('AUTH_ERROR');
    expect(classifyError(apiErr(400, 'API key not valid. Please pass a valid API key.')).code).toBe('AUTH_ERROR');
  });
  it('400 mentioning thinking => retryable with dropThinking', () => {
    const e = classifyError(apiErr(400, 'Budget 0 is invalid. This model only works in thinking mode.'));
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.dropThinking).toBe(true);
    expect(e.retryable).toBe(true);
  });
  it('plain 400 is not retryable', () => {
    expect(classifyError(apiErr(400, 'INVALID_ARGUMENT bad field')).retryable).toBe(false);
  });
  it('network failures are retryable', () => {
    const e = classifyError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
    expect(e.code).toBe('NETWORK');
    expect(e.retryable).toBe(true);
  });
  it('our own timer => TIMEOUT', () => {
    const e = classifyError(Object.assign(new Error('aborted'), { name: 'AbortError' }), { timedOut: true });
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
  });
  it('caller abort => CANCELLED', () => {
    const e = classifyError(Object.assign(new Error('aborted'), { name: 'AbortError' }), { callerAborted: true });
    expect(e.code).toBe('CANCELLED');
    expect(e.retryable).toBe(false);
  });
  it('passes LlmError through unchanged', () => {
    const original = new LlmError('X', 'y');
    expect(classifyError(original)).toBe(original);
  });
});

describe('backoffDelayMs', () => {
  it('honours Retry-After (plus small jitter)', () => {
    const d = backoffDelayMs(0, 10000);
    expect(d).toBeGreaterThanOrEqual(10000);
    expect(d).toBeLessThan(10800);
  });
  it('grows exponentially and is capped', () => {
    expect(backoffDelayMs(0)).toBeLessThanOrEqual(1500);
    expect(backoffDelayMs(10)).toBeLessThanOrEqual(30000);
  });
});
