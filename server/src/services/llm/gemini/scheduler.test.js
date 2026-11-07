import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler, PRIORITY } from './scheduler.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('Scheduler', () => {
  it('admits up to RPM immediately then makes the next request wait for the window', async () => {
    const s = new Scheduler({ rpm: 2, tpm: 1e6, maxConcurrent: 10 });
    const l1 = await s.acquire(); l1.release();
    const l2 = await s.acquire(); l2.release();

    let admitted = false;
    const p3 = s.acquire().then((l) => { admitted = true; return l; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(admitted).toBe(true);
    (await p3).release();
  });

  it('limits concurrency and releases the next waiter', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1e6, maxConcurrent: 1 });
    const l1 = await s.acquire();
    let second = false;
    const p2 = s.acquire().then((l) => { second = true; return l; });
    await flush();
    expect(second).toBe(false);
    l1.release();
    await flush();
    expect(second).toBe(true);
    (await p2).release();
  });

  it('serves interactive requests before queued generation work', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1e6, maxConcurrent: 1 });
    const first = await s.acquire();
    const order = [];
    const gen = s.acquire({ priority: PRIORITY.GENERATION }).then((l) => { order.push('gen'); l.release(); });
    const bg = s.acquire({ priority: PRIORITY.BACKGROUND }).then((l) => { order.push('bg'); l.release(); });
    const ask = s.acquire({ priority: PRIORITY.INTERACTIVE }).then((l) => { order.push('ask'); l.release(); });
    first.release();
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([gen, bg, ask]);
    expect(order).toEqual(['ask', 'gen', 'bg']);
  });

  it('respects tokens-per-minute', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1000, maxConcurrent: 10 });
    const l1 = await s.acquire({ estimatedTokens: 700 }); l1.release();
    let admitted = false;
    const p2 = s.acquire({ estimatedTokens: 700 }).then((l) => { admitted = true; return l; });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(41_000);
    expect(admitted).toBe(true);
    (await p2).release();
  });

  it('uses real token usage to correct the window on release', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1000, maxConcurrent: 10 });
    const l1 = await s.acquire({ estimatedTokens: 900 });
    l1.release(100); // actually only 100 tokens
    const l2 = await s.acquire({ estimatedTokens: 800 }); // fits now
    l2.release();
    expect(s.stats().tokensLastMinute).toBeLessThanOrEqual(1000);
  });

  it('penalize() pauses everything and then runs slower for a while', async () => {
    const s = new Scheduler({ rpm: 10, tpm: 1e6, maxConcurrent: 10 });
    s.penalize(5000);
    let admitted = false;
    const p = s.acquire().then((l) => { admitted = true; return l; });
    await vi.advanceTimersByTimeAsync(4000);
    expect(admitted).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(admitted).toBe(true);
    (await p).release();
    expect(s.stats().effectiveRpm).toBeLessThan(10);
    expect(s.isCoolingDown()).toBe(false);
  });

  it('blockDaily() fails queued and new requests immediately', async () => {
    const s = new Scheduler({ rpm: 1, tpm: 1e6, maxConcurrent: 1 });
    const l1 = await s.acquire();
    const queued = s.acquire();
    const err = Object.assign(new Error('daily'), { code: 'QUOTA_EXHAUSTED' });
    s.blockDaily(60_000, err);
    await expect(queued).rejects.toBe(err);
    await expect(s.acquire()).rejects.toBe(err);
    l1.release();
  });

  it('times out requests that wait too long in the queue', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1e6, maxConcurrent: 1 });
    await s.acquire(); // never released
    const p = s.acquire({ queueTimeoutMs: 1000 });
    const assertion = expect(p).rejects.toMatchObject({ code: 'QUEUE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it('removes aborted requests from the queue', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1e6, maxConcurrent: 1 });
    await s.acquire();
    const ac = new AbortController();
    const p = s.acquire({ signal: ac.signal });
    const assertion = expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
    ac.abort();
    await assertion;
    expect(s.stats().queued).toBe(0);
  });

  it('release() is idempotent', async () => {
    const s = new Scheduler({ rpm: 100, tpm: 1e6, maxConcurrent: 1 });
    const l = await s.acquire();
    l.release();
    l.release();
    expect(s.stats().inFlight).toBe(0);
  });
});
