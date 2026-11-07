import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ---------- in-memory fakes for the two Mongo models ---------- */
const store = { gen: null, chunks: [] };

vi.mock('../../models/Generation.js', () => ({
  Generation: {
    findById: async () => store.gen,
    updateOne: async (_filter, update) => {
      const g = store.gen;
      for (const [k, v] of Object.entries(update)) {
        if (k === '$push') for (const [f, val] of Object.entries(v)) g[f].push(val);
        else if (k === '$inc') for (const [f, val] of Object.entries(v)) {
          const [a, b] = f.split('.');
          g[a][b] = (g[a][b] || 0) + val;
        } else if (k.includes('.')) {
          const [a, b] = k.split('.');
          g[a][b] = v;
        } else g[k] = v;
      }
    },
  },
}));
vi.mock('../../models/Chunk.js', () => ({
  Chunk: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => store.chunks }) }) }) },
}));

/* ---------- fake LLM: behaviour set per test ---------- */
const llmPlan = { handler: null };
vi.mock('../llm/index.js', () => ({
  getLlmProvider: () => ({ generateStream: (args) => llmPlan.handler(args) }),
}));

const { runGeneration, startGeneration } = await import('./generate.js');
const { runner } = await import('./runner.js');
const { LlmError } = await import('../llm/errors.js');
const { env } = await import('../../config/env.js');

const seg = (text, sources) => JSON.stringify({ type: 'paragraph', depth: 1, text, sources }) + '\n';

function makeChunks(n, size = 5000) {
  return Array.from({ length: n }, (_, i) => ({
    chunkId: `c_1_${i}`, page: 1, order: i, type: i % 5 === 0 ? 'heading' : 'paragraph', text: `chunk ${i} ${'word '.repeat(size / 5)}`,
  }));
}

function freshGen() {
  return {
    _id: 'g1', documentId: 'd1', ownerGuestId: 'guest', level: 'medium', goal: 'understanding', question: 'Explain this document',
    status: 'pending', segments: [], progress: { sectionIndex: 0, sectionCount: 0 }, usage: { calls: 0, tokens: 0 },
  };
}

function events(id) {
  const out = [];
  runner.subscribe(id, (e) => out.push(e));
  return out;
}

beforeEach(() => {
  store.gen = freshGen();
  store.chunks = makeChunks(30); // 150k chars => several sections with the test limits below
  env.SINGLE_PASS_LIMIT_CHARS = 40000;
  env.SECTION_SIZE_CHARS = 40000;
  runner.reset('g1');
  runner.unregister('g1');
});

describe('runGeneration', () => {
  it('writes every section, persists progress and ends with a done event', async () => {
    llmPlan.handler = async function* ({ prompt, meta }) {
      const ids = [...prompt.matchAll(/\[(c_1_\d+)\]/g)].map((m) => m[1]);
      yield seg(`Explains ${ids[0]}`, [ids[0]]);
      meta.finishReason = 'STOP';
      meta.usage = 50;
    };
    runner.register('g1', { documentId: 'd1', guestId: 'guest' });
    await runGeneration('g1');

    expect(store.gen.status).toBe('done');
    expect(store.gen.progress.sectionCount).toBeGreaterThan(1);
    expect(store.gen.progress.sectionIndex).toBe(store.gen.progress.sectionCount);
    expect(store.gen.segments.length).toBe(store.gen.progress.sectionCount);
    expect(store.gen.segments.map((s) => s.segmentId)).toEqual(store.gen.segments.map((_, i) => `s_${i}`));
    expect(store.gen.usage.calls).toBe(store.gen.progress.sectionCount);
    expect(runner.isActive('g1')).toBe(false);

    const evs = events('g1').map((e) => e.type);
    expect(evs).toContain('meta');
    expect(evs.at(-1)).toBe('done');
  });

  it('keeps finished sections when the API fails, marks the run resumable, then resumes without repeating', async () => {
    let call = 0;
    llmPlan.handler = async function* ({ prompt, meta }) {
      call++;
      if (call === 3) throw new LlmError('RATE_LIMITED', 'busy', { retryable: true });
      const first = [...prompt.matchAll(/\[(c_1_\d+)\]/g)][0][1];
      yield seg(`About ${first}`, [first]);
      meta.finishReason = 'STOP';
    };

    runner.register('g1', { documentId: 'd1', guestId: 'guest' });
    await runGeneration('g1');

    expect(store.gen.status).toBe('failed');
    expect(store.gen.errorCode).toBe('RATE_LIMITED');
    expect(store.gen.errorRetryable).toBe(true);
    const keptTexts = store.gen.segments.map((s) => s.text);
    expect(keptTexts).toHaveLength(2); // two sections finished before the failure
    expect(store.gen.progress.sectionIndex).toBe(2);

    // second run (what the controller does on "Resume")
    runner.reset('g1');
    runner.register('g1', { documentId: 'd1', guestId: 'guest' });
    await runGeneration('g1', { resume: true });

    expect(store.gen.status).toBe('done');
    expect(store.gen.segments.slice(0, 2).map((s) => s.text)).toEqual(keptTexts); // untouched
    expect(new Set(store.gen.segments.map((s) => s.segmentId)).size).toBe(store.gen.segments.length); // no duplicate ids
  });

  it('flags non-retryable failures (bad API key) as not resumable', async () => {
    llmPlan.handler = async function* () {
      throw new LlmError('AUTH_ERROR', 'bad key');
    };
    runner.register('g1', { documentId: 'd1', guestId: 'guest' });
    await runGeneration('g1');
    expect(store.gen.status).toBe('failed');
    expect(store.gen.errorCode).toBe('AUTH_ERROR');
    expect(store.gen.errorRetryable).toBe(false);
  });

  it('pauses (resumable) when a newer generation supersedes it', async () => {
    llmPlan.handler = async function* ({ signal, meta }) {
      await new Promise((r) => setTimeout(r, 30));
      if (signal?.aborted) throw new LlmError('CANCELLED', 'cancelled');
      yield seg('hello', ['c_1_0']);
      meta.finishReason = 'STOP';
    };
    runner.register('g1', { documentId: 'd1', guestId: 'guest' });
    const run = runGeneration('g1');
    runner.cancelOthers('d1', 'guest', 'other');
    await run;
    expect(store.gen.status).toBe('failed');
    expect(store.gen.errorCode).toBe('CANCELLED');
    expect(store.gen.errorRetryable).toBe(true);
    expect(store.gen.errorMessage).toMatch(/Resume/);
  });

  it('startGeneration registers the job immediately', async () => {
    llmPlan.handler = async function* ({ meta }) {
      yield seg('x', ['c_1_0']);
      meta.finishReason = 'STOP';
    };
    startGeneration(store.gen);
    expect(runner.isActive('g1')).toBe(true);
    await vi.waitFor(() => expect(store.gen.status).toBe('done'));
  });
});
