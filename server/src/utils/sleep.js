import { LlmError, USER_MESSAGES } from '../services/llm/errors.js';

/** Abortable sleep. Rejects with CANCELLED if the signal fires. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new LlmError('CANCELLED', USER_MESSAGES.CANCELLED));
    const onAbort = () => {
      clearTimeout(t);
      reject(new LlmError('CANCELLED', USER_MESSAGES.CANCELLED));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
