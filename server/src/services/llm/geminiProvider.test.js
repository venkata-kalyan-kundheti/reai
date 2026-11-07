import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../../config/env.js';
import { _setAiForTests, generateStream } from './geminiProvider.js';
import { _resetSchedulersForTests } from './gemini/scheduler.js';

const apiErr = (status, message) => Object.assign(new Error(message), { status });

function chunk(text, extra = {}) {
  return { text, candidates: [{ finishReason: extra.finishReason }], usageMetadata: extra.usage ? { totalTokenCount: extra.usage } : undefined };
}

/** Build a fake SDK client from a list of per-call behaviours. */
function fakeAi(behaviours) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContentStream(req) {
        const b = behaviours[Math.min(calls.length, behaviours.length - 1)];
        calls.push(req);
        if (b.throw) throw b.throw;
        return (async function* () {
          if (b.hang) {
            await new Promise((_, reject) => {
              req.config.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            });
          }
          for (const part of b.parts || []) {
            if (part.throw) throw part.throw;
            yield part;
          }
        })();
      },
    },
  };
}

async function collect(gen) {
  let out = '';
  for await (const t of gen) out += t;
  return out;
}

const base = { system: 's', prompt: 'p' };
const saved = {};

beforeEach(() => {
  vi.useFakeTimers();
  _resetSchedulersForTests();
  for (const k of ['LLM_MODEL', 'LLM_FALLBACK_MODEL', 'LLM_MAX_RETRIES', 'LLM_FIRST_TOKEN_TIMEOUT_MS', 'LLM_IDLE_TIMEOUT_MS', 'LLM_REQUEST_TIMEOUT_MS']) saved[k] = env[k];
  env.LLM_MODEL = 'primary-flash';
  env.LLM_FALLBACK_MODEL = undefined;
  env.LLM_MAX_RETRIES = 3;
  env.LLM_FIRST_TOKEN_TIMEOUT_MS = 5000;
  env.LLM_IDLE_TIMEOUT_MS = 2000;
  env.LLM_REQUEST_TIMEOUT_MS = 20000;
});
afterEach(() => {
  vi.useRealTimers();
  Object.assign(env, saved);
});

describe('geminiProvider.generateStream', () => {
  it('streams text and reports finish reason + usage', async () => {
    const ai = fakeAi([{ parts: [chunk('Hello '), chunk('world', { finishReason: 'STOP', usage: 321 })] }]);
    _setAiForTests(ai);
    const meta = {};
    const out = await collect(generateStream({ ...base, meta }));
    expect(out).toBe('Hello world');
    expect(meta).toMatchObject({ finishReason: 'STOP', usage: 321, model: 'primary-flash', attempts: 1 });
    expect(ai.calls[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 }); // flash => thinking off
    expect(ai.calls[0].config.maxOutputTokens).toBe(env.LLM_MAX_OUTPUT_TOKENS);
  });

  it('retries a 429 (honouring retryDelay) and then succeeds', async () => {
    const ai = fakeAi([
      { throw: apiErr(429, '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"3s"}]}}') },
      { parts: [chunk('ok', { finishReason: 'STOP' })] },
    ]);
    _setAiForTests(ai);
    const notices = [];
    const p = collect(generateStream({ ...base, onNotice: (n) => notices.push(n) }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe('ok');
    expect(ai.calls).toHaveLength(2);
    expect(notices.some((n) => n.type === 'retrying' && n.code === 'RATE_LIMITED')).toBe(true);
  });

  it('switches to the fallback model when the primary is rate limited', async () => {
    env.LLM_FALLBACK_MODEL = 'fallback-lite';
    const ai = fakeAi([
      { throw: apiErr(429, 'retry in 30s') },
      { parts: [chunk('from fallback', { finishReason: 'STOP' })] },
    ]);
    _setAiForTests(ai);
    const meta = {};
    const p = collect(generateStream({ ...base, meta }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe('from fallback');
    expect(ai.calls.map((c) => c.model)).toEqual(['primary-flash', 'fallback-lite']);
    expect(meta.model).toBe('fallback-lite');
  });

  it('retries after a hung stream (first-token timeout)', async () => {
    const ai = fakeAi([{ hang: true }, { parts: [chunk('recovered', { finishReason: 'STOP' })] }]);
    _setAiForTests(ai);
    const p = collect(generateStream(base));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toBe('recovered');
    expect(ai.calls).toHaveLength(2);
  });

  it('fails fast (no retries) on a daily quota error', async () => {
    const ai = fakeAi([{ throw: apiErr(429, 'GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded') }]);
    _setAiForTests(ai);
    await expect(collect(generateStream(base))).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED', retryable: false });
    expect(ai.calls).toHaveLength(1);
    // the bucket is now blocked: the next call fails without touching the API
    await expect(collect(generateStream(base))).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(ai.calls).toHaveLength(1);
  });

  it('gives up after LLM_MAX_RETRIES on persistent 503s', async () => {
    env.LLM_MAX_RETRIES = 2;
    const ai = fakeAi([{ throw: apiErr(503, 'overloaded') }]);
    _setAiForTests(ai);
    const p = collect(generateStream(base));
    const assertion = expect(p).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(ai.calls).toHaveLength(3);
  });

  it('does not retry once text was streamed: throws a partial error instead', async () => {
    const ai = fakeAi([{ parts: [chunk('half an answ'), { throw: apiErr(503, 'connection dropped') }] }]);
    _setAiForTests(ai);
    const got = [];
    let error;
    try {
      for await (const t of generateStream(base)) got.push(t);
    } catch (e) {
      error = e;
    }
    expect(got.join('')).toBe('half an answ');
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', partial: true });
    expect(ai.calls).toHaveLength(1);
  });

  it('turns a blocked prompt into CONTENT_BLOCKED (no retry)', async () => {
    const ai = fakeAi([{ parts: [{ text: '', candidates: [{ finishReason: 'SAFETY' }] }] }]);
    _setAiForTests(ai);
    await expect(collect(generateStream(base))).rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
    expect(ai.calls).toHaveLength(1);
  });

  it('drops the thinking config and retries when the model rejects it', async () => {
    const ai = fakeAi([
      { throw: apiErr(400, 'Budget 0 is invalid. This model only works in thinking mode.') },
      { parts: [chunk('fine', { finishReason: 'STOP' })] },
    ]);
    _setAiForTests(ai);
    const p = collect(generateStream(base));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe('fine');
    expect(ai.calls[0].config.thinkingConfig).toBeDefined();
    expect(ai.calls[1].config.thinkingConfig).toBeUndefined();
  });

  it('reports MAX_TOKENS so callers can continue', async () => {
    const ai = fakeAi([{ parts: [chunk('long...', { finishReason: 'MAX_TOKENS' })] }]);
    _setAiForTests(ai);
    const meta = {};
    await collect(generateStream({ ...base, meta }));
    expect(meta.finishReason).toBe('MAX_TOKENS');
  });

  it('stops immediately when the caller aborts', async () => {
    const ai = fakeAi([{ hang: true }]);
    _setAiForTests(ai);
    const ac = new AbortController();
    const p = collect(generateStream({ ...base, signal: ac.signal }));
    const assertion = expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.advanceTimersByTimeAsync(100);
    ac.abort();
    await assertion;
    expect(ai.calls).toHaveLength(1);
  });
});
