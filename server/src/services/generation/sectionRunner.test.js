import { describe, it, expect, vi } from 'vitest';
import { runSection } from './sectionRunner.js';
import { LlmError } from '../llm/errors.js';

const line = (text, sources = ['c_1_0'], type = 'paragraph') => JSON.stringify({ type, depth: 1, text, sources }) + '\n';

const chunks = [
  { chunkId: 'c_1_0', page: 1, order: 0, type: 'paragraph', text: 'alpha beta gamma' },
  { chunkId: 'c_1_1', page: 1, order: 1, type: 'paragraph', text: 'delta epsilon zeta' },
];
const validChunkIds = new Set(chunks.map((c) => c.chunkId));

/** llm whose successive calls follow `plans`: { text, finish, throwAfter } */
function fakeLlm(plans) {
  const prompts = [];
  return {
    prompts,
    generateStream: async function* ({ prompt, meta }) {
      const plan = plans[Math.min(prompts.length, plans.length - 1)];
      prompts.push(prompt);
      for (const piece of plan.pieces || []) yield piece;
      if (plan.throw) throw plan.throw;
      meta.finishReason = plan.finish || 'STOP';
      meta.usage = 100;
    },
  };
}

const base = (llm, extra = {}) => ({
  llm,
  system: 's',
  chunks,
  sectionIndex: 0,
  sectionCount: 1,
  outline: [],
  question: 'Explain',
  previousTail: [],
  targetSegments: 6,
  validChunkIds,
  onSegment: vi.fn(),
  ...extra,
});

describe('runSection', () => {
  it('emits every segment of a normal answer in one call', async () => {
    const llm = fakeLlm([{ pieces: [line('First point'), line('Second point', ['c_1_1'])] }]);
    const args = base(llm);
    const r = await runSection(args);
    expect(r.calls).toBe(1);
    expect(args.onSegment).toHaveBeenCalledTimes(2);
    expect(llm.prompts).toHaveLength(1);
  });

  it('continues after MAX_TOKENS and tells the model what was already written', async () => {
    const llm = fakeLlm([
      { pieces: [line('Part one about alpha')], finish: 'MAX_TOKENS' },
      { pieces: [line('Part two about delta', ['c_1_1'])], finish: 'STOP' },
    ]);
    const args = base(llm);
    const r = await runSection(args);
    expect(r.calls).toBe(2);
    expect(args.onSegment).toHaveBeenCalledTimes(2);
    expect(llm.prompts[1]).toContain('CUT OFF');
    expect(llm.prompts[1]).toContain('Part one about alpha');
  });

  it('drops repeated segments after a continuation', async () => {
    const llm = fakeLlm([
      { pieces: [line('Same sentence')], finish: 'MAX_TOKENS' },
      { pieces: [line('Same sentence'), line('A new one')], finish: 'STOP' },
    ]);
    const args = base(llm);
    await runSection(args);
    expect(args.onSegment.mock.calls.map((c) => c[0].text)).toEqual(['Same sentence', 'A new one']);
  });

  it('recovers from a stream that dies after partial output', async () => {
    const llm = fakeLlm([
      { pieces: [line('Written before the drop')], throw: new LlmError('NETWORK', 'dropped', { retryable: true, partial: true }) },
      { pieces: [line('Written after recovery', ['c_1_1'])], finish: 'STOP' },
    ]);
    const args = base(llm);
    const r = await runSection(args);
    expect(args.onSegment).toHaveBeenCalledTimes(2);
    expect(r.calls).toBe(2);
  }, 15000);

  it('retries once on an empty answer, then fails with EMPTY_RESPONSE', async () => {
    const llm = fakeLlm([{ pieces: ['this is not json at all\n'] }]);
    await expect(runSection(base(llm))).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
    expect(llm.prompts).toHaveLength(2);
  });

  it('does not swallow non-retryable errors', async () => {
    const llm = fakeLlm([{ throw: new LlmError('AUTH_ERROR', 'bad key') }]);
    await expect(runSection(base(llm))).rejects.toMatchObject({ code: 'AUTH_ERROR' });
    expect(llm.prompts).toHaveLength(1);
  });

  it('stops immediately when cancelled', async () => {
    const ac = new AbortController();
    ac.abort();
    const llm = fakeLlm([{ pieces: [line('x')] }]);
    await expect(runSection(base(llm, { signal: ac.signal }))).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(llm.prompts).toHaveLength(0);
  });

  it('resumes a half-finished section without repeating it', async () => {
    const llm = fakeLlm([{ pieces: [line('Already there'), line('Fresh content', ['c_1_1'])] }]);
    const args = base(llm, { initialWritten: [{ type: 'paragraph', text: 'Already there', sources: ['c_1_0'] }] });
    await runSection(args);
    expect(args.onSegment.mock.calls.map((c) => c[0].text)).toEqual(['Fresh content']);
    expect(llm.prompts[0]).toContain('Already there');
  });

  it('filters cited ids that do not exist', async () => {
    const llm = fakeLlm([{ pieces: [line('Cites a ghost', ['c_9_9', 'c_1_0'])] }]);
    const args = base(llm);
    await runSection(args);
    expect(args.onSegment.mock.calls[0][0].sources).toEqual(['c_1_0']);
  });
});
