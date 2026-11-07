import { buildUserPrompt } from '../llm/prompts.js';
import { parseNdjsonStream } from '../llm/ndjsonParser.js';
import { LlmError, USER_MESSAGES, classifyError, backoffDelayMs } from '../llm/errors.js';
import { PRIORITY } from '../llm/gemini/scheduler.js';
import { sleep } from '../../utils/sleep.js';
import { env } from '../../config/env.js';

const normalise = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * Write ONE section of the explanation, streaming segments as they arrive.
 *
 * Handles the failure modes a long generation really hits:
 *  - answer cut off by the output-token limit  -> asks the model to continue (up to LLM_MAX_CONTINUATIONS)
 *  - connection dropped mid-stream             -> same continuation, never restarts from zero
 *  - empty / unusable answer                   -> one clean retry, then a clear error
 *  - model repeats itself after continuing     -> duplicates are dropped
 *
 * `initialWritten` lets a RESUMED generation continue a half-finished section.
 */
export async function runSection({
  llm,
  system,
  chunks,
  sectionIndex,
  sectionCount,
  outline,
  question,
  previousTail,
  targetSegments,
  validChunkIds,
  signal,
  onSegment,
  onNotice,
  initialWritten = [],
}) {
  const written = [...initialWritten];
  const seen = new Set(written.map((w) => normalise(w.text)));
  let continuations = 0;
  let emptyRetries = 0;
  const stats = { calls: 0, tokens: 0 };

  for (;;) {
    if (signal?.aborted) throw new LlmError('CANCELLED', USER_MESSAGES.CANCELLED);

    const prompt = buildUserPrompt({
      chunks,
      question,
      outline,
      sectionIndex,
      sectionCount,
      previousTail,
      written,
      targetSegments,
    });

    const meta = {};
    let newThisCall = 0;
    stats.calls++;

    try {
      const raw = llm.generateStream({
        system,
        prompt,
        signal,
        priority: PRIORITY.GENERATION,
        meta,
        onNotice,
      });

      for await (const seg of parseNdjsonStream(raw, validChunkIds)) {
        const key = normalise(seg.text);
        if (seen.has(key)) continue;
        seen.add(key);
        written.push(seg);
        newThisCall++;
        await onSegment(seg);
      }
    } catch (err) {
      const e = classifyError(err);
      if (e.code === 'CANCELLED') throw e;

      // Text had started flowing => continue where it stopped instead of failing the whole section.
      if ((e.partial || newThisCall > 0) && e.retryable && continuations < env.LLM_MAX_CONTINUATIONS) {
        continuations++;
        onNotice?.({ type: 'continuing', code: e.code });
        await sleep(backoffDelayMs(continuations, e.retryAfterMs, { baseMs: 1000, maxMs: 15000 }), signal);
        continue;
      }
      throw e;
    }

    stats.tokens += meta.usage || 0;

    if (newThisCall === 0 && written.length === 0) {
      if (emptyRetries < 1) {
        emptyRetries++;
        onNotice?.({ type: 'retrying', code: 'EMPTY_RESPONSE' });
        continue;
      }
      throw new LlmError('EMPTY_RESPONSE', USER_MESSAGES.EMPTY_RESPONSE, { retryable: true });
    }

    // Cut off by the token limit => ask for the rest. (A repeat-only answer ends the loop.)
    if (meta.finishReason === 'MAX_TOKENS' && newThisCall > 0 && continuations < env.LLM_MAX_CONTINUATIONS) {
      continuations++;
      onNotice?.({ type: 'continuing', code: 'MAX_TOKENS' });
      continue;
    }

    return { segments: written, continuations, ...stats };
  }
}
