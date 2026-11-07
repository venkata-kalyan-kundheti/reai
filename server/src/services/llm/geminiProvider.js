import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { LlmError, USER_MESSAGES, classifyError, backoffDelayMs } from './errors.js';
import { getScheduler, PRIORITY } from './gemini/scheduler.js';
import { sleep } from '../../utils/sleep.js';

export { PRIORITY };

const BLOCKING_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);
const DEFAULT_MODEL = 'gemini-2.5-flash';

const clients = new Map(); // apiKey -> client (text and vision may use different keys)
let testClient = null;

export function getAi(apiKey = env.LLM_API_KEY) {
  if (testClient) return testClient;
  if (!clients.has(apiKey)) {
    clients.set(
      apiKey,
      new GoogleGenAI({
        apiKey,
        // We own retries (so they respect the scheduler). Disable the SDK's hidden ones.
        httpOptions: { retryOptions: { attempts: 1 } },
      })
    );
  }
  return clients.get(apiKey);
}

/** Test hook: inject a fake `{ models: { generateContentStream } }` client. */
export function _setAiForTests(fake) {
  testClient = fake;
}

export function estimateTokens(text = '') {
  // ~4 chars/token for English; use 3.5 so we over-estimate slightly (safer for TPM).
  return Math.ceil(String(text).length / 3.5);
}

export function schedulerFor(model) {
  return getScheduler(model, {
    rpm: env.LLM_RPM,
    tpm: env.LLM_TPM,
    maxConcurrent: env.LLM_MAX_CONCURRENT,
  });
}

export function thinkingConfigFor(model) {
  if (env.LLM_THINKING_BUDGET !== undefined && env.LLM_THINKING_BUDGET !== null) {
    return { thinkingBudget: env.LLM_THINKING_BUDGET };
  }
  // Explanations do not need hidden reasoning; turning it off is faster and uses far fewer tokens.
  if (/flash/i.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

function chooseModel(requested) {
  const primary = requested || env.LLM_MODEL || DEFAULT_MODEL;
  const fallback = env.LLM_FALLBACK_MODEL;
  if (fallback && fallback !== primary) {
    // If the primary bucket is paused (recent 429), go straight to the fallback's own quota.
    if (schedulerFor(primary).isCoolingDown(1500) && !schedulerFor(fallback).isCoolingDown(0)) {
      return { model: fallback, primary, fallback };
    }
  }
  return { model: primary, primary, fallback };
}

/**
 * Stream text from Gemini safely.
 *
 * Guarantees:
 *  - never exceeds the configured RPM / TPM / concurrency for the model (scheduler)
 *  - retries 429 / 5xx / timeouts / network errors with backoff (only BEFORE any text was yielded)
 *  - first-token, idle and hard timeouts so a hung stream can never block a job forever
 *  - falls over to LLM_FALLBACK_MODEL when the primary is rate limited or unavailable
 *  - reports `meta.finishReason` so the caller can continue a MAX_TOKENS cut-off
 *  - a failure AFTER text was yielded throws LlmError{ partial: true } (caller decides how to continue)
 *
 * @param {object}   p
 * @param {string}   p.system
 * @param {string}   p.prompt
 * @param {string=}  p.model
 * @param {AbortSignal=} p.signal      caller cancellation
 * @param {number=}  p.priority        PRIORITY.*
 * @param {number=}  p.estimatedTokens override the automatic estimate
 * @param {object=}  p.meta            filled with { model, finishReason, usage, attempts }
 * @param {Function=} p.onNotice       ({ type, ... }) for UI messages ("waiting", "retrying")
 */
export async function* generateStream({
  system,
  prompt,
  model,
  signal,
  priority = PRIORITY.GENERATION,
  estimatedTokens,
  meta = {},
  onNotice,
  queueTimeoutMs,
  maxOutputTokens,
  parts = [], // extra content parts, e.g. an inline image for the vision model
  extraTokens = 0, // rough token cost of those parts (counted against TPM)
  responseSchema, // when set, Gemini is forced to return JSON matching this schema
  apiKey,
}) {
  const ai = getAi(apiKey);
  const maxOut = maxOutputTokens || env.LLM_MAX_OUTPUT_TOKENS;
  const inTokens = estimateTokens(system) + estimateTokens(prompt) + extraTokens;
  const est = estimatedTokens ?? inTokens + Math.min(maxOut, Math.max(1500, Math.round(inTokens * 0.5)));
  const queueTimeout =
    queueTimeoutMs ?? (priority === PRIORITY.INTERACTIVE ? env.LLM_INTERACTIVE_QUEUE_TIMEOUT_MS : env.LLM_QUEUE_TIMEOUT_MS);

  let picked = chooseModel(model);
  let useThinking = true;
  const maxAttempts = env.LLM_MAX_RETRIES + 1;
  meta.attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    meta.attempts = attempt + 1;
    const sched = schedulerFor(picked.model);

    const eta = sched.estimateWaitMs();
    if (eta > 3000) onNotice?.({ type: 'waiting', waitMs: eta, model: picked.model });

    const lease = await sched.acquire({ priority, estimatedTokens: est, signal, queueTimeoutMs: queueTimeout });

    const ac = new AbortController();
    const onCallerAbort = () => ac.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    let timedOut = false;
    const fireTimeout = () => {
      timedOut = true;
      ac.abort();
    };
    let idleTimer = setTimeout(fireTimeout, env.LLM_FIRST_TOKEN_TIMEOUT_MS);
    const hardTimer = setTimeout(fireTimeout, env.LLM_REQUEST_TIMEOUT_MS);

    let yielded = false;
    let usage = null;
    let finishReason = null;
    let blockReason = null;
    let retryDelay = 0;

    try {
      logger.info({ model: picked.model, attempt: attempt + 1, estTokens: est, priority }, 'Gemini request');

      const config = {
        systemInstruction: system,
        temperature: 0.2,
        maxOutputTokens: maxOut,
        abortSignal: ac.signal,
      };
      const thinking = useThinking ? thinkingConfigFor(picked.model) : undefined;
      if (thinking) config.thinkingConfig = thinking;
      if (responseSchema) {
        config.responseMimeType = 'application/json';
        config.responseSchema = responseSchema;
      }

      const stream = await ai.models.generateContentStream({
        model: picked.model,
        contents: [{ role: 'user', parts: [{ text: prompt }, ...parts] }],
        config,
      });

      for await (const chunk of stream) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(fireTimeout, env.LLM_IDLE_TIMEOUT_MS);

        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finishReason = cand.finishReason;
        if (chunk.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;
        if (chunk.usageMetadata?.totalTokenCount) usage = chunk.usageMetadata.totalTokenCount;

        let text = '';
        try {
          text = chunk.text || '';
        } catch {
          text = '';
        }
        if (text) {
          yielded = true;
          yield text;
        }
      }

      if (!yielded) {
        if (blockReason || BLOCKING_FINISH.has(finishReason)) {
          throw new LlmError('CONTENT_BLOCKED', USER_MESSAGES.CONTENT_BLOCKED, { retryable: false });
        }
        throw new LlmError('EMPTY_RESPONSE', USER_MESSAGES.EMPTY_RESPONSE, { retryable: true });
      }

      meta.model = picked.model;
      meta.finishReason = finishReason || 'STOP';
      meta.usage = usage;
      return;
    } catch (rawErr) {
      const err = classifyError(rawErr, { timedOut, callerAborted: Boolean(signal?.aborted) });
      if (yielded) err.partial = true;
      meta.model = picked.model;
      meta.finishReason = finishReason || 'ERROR';

      logger.warn(
        { model: picked.model, attempt: attempt + 1, code: err.code, status: err.status, partial: err.partial },
        'Gemini request failed'
      );

      if (err.code === 'RATE_LIMITED') sched.penalize(err.retryAfterMs ?? 15000);
      if (err.code === 'QUOTA_EXHAUSTED') {
        // Block this bucket for a while so queued/new work fails fast. A fallback model has its own quota.
        sched.blockDaily(60 * 60 * 1000, err);
      }

      if (err.dropThinking && useThinking) useThinking = false;

      // Never retry after text was already streamed - the caller must continue instead.
      if (err.partial) throw err;

      const canSwitch =
        Boolean(picked.fallback) &&
        picked.model === picked.primary &&
        ['RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'TIMEOUT', 'QUOTA_EXHAUSTED'].includes(err.code) &&
        !schedulerFor(picked.fallback).isCoolingDown(0);

      const retryable = err.retryable || (err.code === 'QUOTA_EXHAUSTED' && canSwitch);
      if (!retryable || attempt >= maxAttempts - 1) throw err;

      if (canSwitch) {
        picked = { ...picked, model: picked.fallback };
        retryDelay = 400; // different quota bucket: no need to wait out the primary's cooldown
      } else {
        retryDelay = backoffDelayMs(attempt, err.retryAfterMs);
      }
      onNotice?.({ type: 'retrying', code: err.code, attempt: attempt + 1, delayMs: retryDelay, model: picked.model });
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      signal?.removeEventListener('abort', onCallerAbort);
      lease.release(usage);
    }

    // Reached only after a retryable failure (every other path returns or throws above).
    // Sleeping here - after the lease was released - keeps the slot free for other work.
    await sleep(retryDelay, signal);
  }
}
