import { LlmError, USER_MESSAGES } from '../errors.js';

export const PRIORITY = { INTERACTIVE: 0, GENERATION: 1, BACKGROUND: 2 };

const WINDOW_MS = 60_000;
const ADAPT_MS = 5 * 60_000; // how long we stay slower after a 429

/**
 * Admission control for ONE model's quota bucket.
 *
 *  - requests per minute (sliding window)
 *  - tokens per minute (sliding window, estimated then corrected with real usage)
 *  - max concurrent in-flight requests
 *  - priority queue: interactive (Ask / simplify) > generation > background (vision)
 *  - cooldown: after a 429 the whole bucket pauses for Google's retryDelay and then runs
 *    at a reduced request rate for a few minutes
 *  - daily-quota block: fail fast instead of retrying something that cannot succeed today
 *
 * Usage:   const lease = await scheduler.acquire({ priority, estimatedTokens, signal });
 *          try { ...call the API... } finally { lease.release(actualTokens); }
 */
export class Scheduler {
  constructor({ name = 'default', rpm = 8, tpm = 200000, maxConcurrent = 2, now = () => Date.now() } = {}) {
    this.name = name;
    this.rpm = Math.max(1, rpm);
    this.tpm = Math.max(1000, tpm);
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.now = now;

    this.queue = [];
    this.seq = 0;
    this.inFlight = 0;
    this.reqLog = []; // timestamps
    this.tokLog = []; // { t, tokens, id }
    this.cooldownUntil = 0;
    this.adaptUntil = 0;
    this.blockedUntil = 0;
    this.blockedError = null;
    this.timer = null;
  }

  /* ------------------------------ public API ------------------------------ */

  acquire({ priority = PRIORITY.GENERATION, estimatedTokens = 0, signal, queueTimeoutMs = 240000 } = {}) {
    const t = this.now();
    if (this.blockedUntil > t && this.blockedError) {
      return Promise.reject(this.blockedError);
    }
    if (signal?.aborted) {
      return Promise.reject(new LlmError('CANCELLED', USER_MESSAGES.CANCELLED));
    }

    return new Promise((resolve, reject) => {
      const task = {
        id: ++this.seq,
        priority,
        est: Math.max(0, Math.min(Math.ceil(estimatedTokens), this.tpm)),
        resolve,
        reject,
        enqueuedAt: t,
        timeout: null,
        onAbort: null,
      };

      task.timeout = setTimeout(() => {
        this.#remove(task);
        reject(new LlmError('QUEUE_TIMEOUT', USER_MESSAGES.QUEUE_TIMEOUT, { retryable: false }));
      }, queueTimeoutMs);
      task.timeout.unref?.();

      if (signal) {
        task.onAbort = () => {
          this.#remove(task);
          reject(new LlmError('CANCELLED', USER_MESSAGES.CANCELLED));
        };
        signal.addEventListener('abort', task.onAbort, { once: true });
        task.signal = signal;
      }

      this.queue.push(task);
      this.queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
      this.#pump();
    });
  }

  /** The API told us we are going too fast: pause everything and slow down for a while. */
  penalize(ms) {
    const t = this.now();
    this.cooldownUntil = Math.max(this.cooldownUntil, t + Math.max(1000, ms));
    this.adaptUntil = t + ADAPT_MS;
    this.#pump();
  }

  /** Daily quota is gone: reject queued and new work immediately until `ms` has passed. */
  blockDaily(ms, error) {
    this.blockedUntil = this.now() + ms;
    this.blockedError = error;
    const queued = this.queue.splice(0);
    for (const task of queued) this.#settleFailure(task, error);
  }

  isCoolingDown(marginMs = 0) {
    const t = this.now();
    return this.cooldownUntil > t + marginMs || this.blockedUntil > t;
  }

  /** Rough ETA (ms) until a new request could start - used for UI notices. */
  estimateWaitMs() {
    const t = this.now();
    let wait = Math.max(0, this.cooldownUntil - t);
    this.#trim(t);
    if (this.reqLog.length >= this.#currentRpm()) wait = Math.max(wait, this.reqLog[0] + WINDOW_MS - t);
    return wait;
  }

  stats() {
    const t = this.now();
    this.#trim(t);
    return {
      name: this.name,
      queued: this.queue.length,
      inFlight: this.inFlight,
      requestsLastMinute: this.reqLog.length,
      tokensLastMinute: this.tokLog.reduce((s, e) => s + e.tokens, 0),
      effectiveRpm: this.#currentRpm(),
      cooldownMs: Math.max(0, this.cooldownUntil - t),
      blockedMs: Math.max(0, this.blockedUntil - t),
    };
  }

  /* ------------------------------- internals ------------------------------ */

  #currentRpm() {
    return this.now() < this.adaptUntil ? Math.max(1, Math.floor(this.rpm * 0.6)) : this.rpm;
  }

  #trim(t) {
    const cutoff = t - WINDOW_MS;
    while (this.reqLog.length && this.reqLog[0] <= cutoff) this.reqLog.shift();
    while (this.tokLog.length && this.tokLog[0].t <= cutoff) this.tokLog.shift();
  }

  #remove(task) {
    const i = this.queue.indexOf(task);
    if (i >= 0) this.queue.splice(i, 1);
    this.#cleanup(task);
  }

  #cleanup(task) {
    clearTimeout(task.timeout);
    if (task.signal && task.onAbort) task.signal.removeEventListener('abort', task.onAbort);
  }

  #settleFailure(task, error) {
    this.#cleanup(task);
    task.reject(error);
  }

  #schedulePump(delayMs) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#pump(), Math.max(25, delayMs));
    this.timer.unref?.();
  }

  #pump() {
    clearTimeout(this.timer);
    this.timer = null;

    while (this.queue.length) {
      const t = this.now();

      if (this.blockedUntil > t && this.blockedError) {
        const queued = this.queue.splice(0);
        for (const task of queued) this.#settleFailure(task, this.blockedError);
        return;
      }
      if (this.cooldownUntil > t) {
        this.#schedulePump(this.cooldownUntil - t);
        return;
      }
      if (this.inFlight >= this.maxConcurrent) return; // a release() will pump again

      this.#trim(t);
      const task = this.queue[0];

      if (this.reqLog.length >= this.#currentRpm()) {
        this.#schedulePump(this.reqLog[0] + WINDOW_MS - t + 20);
        return;
      }

      let used = this.tokLog.reduce((s, e) => s + e.tokens, 0);
      if (this.tokLog.length && used + task.est > this.tpm) {
        // wait until enough old entries have left the window
        let freeAt = t + WINDOW_MS;
        for (const e of this.tokLog) {
          used -= e.tokens;
          if (used + task.est <= this.tpm) {
            freeAt = e.t + WINDOW_MS;
            break;
          }
        }
        this.#schedulePump(freeAt - t + 20);
        return;
      }

      // admit
      this.queue.shift();
      this.#cleanup(task);
      this.inFlight++;
      this.reqLog.push(t);
      const entry = { t, tokens: task.est, id: task.id };
      this.tokLog.push(entry);

      let released = false;
      task.resolve({
        waitedMs: t - task.enqueuedAt,
        release: (actualTokens) => {
          if (released) return;
          released = true;
          this.inFlight = Math.max(0, this.inFlight - 1);
          if (Number.isFinite(actualTokens) && actualTokens > 0) entry.tokens = Math.min(actualTokens, this.tpm);
          this.#pump();
        },
      });
    }
  }
}

/* One scheduler per model name: Gemini quotas are tracked per model, per project. */
const registry = new Map();

export function getScheduler(model, limits) {
  if (!registry.has(model)) registry.set(model, new Scheduler({ name: model, ...limits }));
  return registry.get(model);
}

export function allSchedulerStats() {
  return [...registry.values()].map((s) => s.stats());
}

export function _resetSchedulersForTests() {
  registry.clear();
}
