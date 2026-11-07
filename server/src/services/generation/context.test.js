import { describe, it, expect } from 'vitest';
import { buildOutline, rankByKeywords, assembleContext, chunksInRegion } from './context.js';
import { sectionChunks, targetSegmentCount } from './sectioning.js';

const mk = (i, text, type = 'paragraph', page = 1, bbox = { x: 0.1, y: 0.1 * (i % 9), w: 0.8, h: 0.05 }) => ({
  chunkId: `c_${page}_${i}`, page, order: i, type, text, bbox,
});

describe('context helpers', () => {
  const chunks = [
    mk(0, 'Neural Networks', 'heading'),
    mk(1, 'Neural networks are inspired by the structure of biological neurons in the brain.'),
    mk(2, 'Backpropagation computes gradients of the loss with respect to every weight.'),
    mk(3, 'Optimisation', 'heading'),
    mk(4, 'Stochastic gradient descent updates weights using small batches of data.'),
    mk(5, 'Regularisation methods such as dropout reduce overfitting.'),
  ];

  it('builds an outline from headings only', () => {
    expect(buildOutline(chunks)).toEqual(['p1 Neural Networks', 'p1 Optimisation']);
  });

  it('ranks keyword matches first', () => {
    const r = rankByKeywords(chunks, 'what inspired neural networks? biological neurons');
    expect(r[0].chunkId).toBe('c_1_1');
  });

  it('assembles selected + neighbours + heading, in document order', () => {
    const { chunks: ctx, selectedIds } = assembleContext(chunks, { selected: [chunks[4]], neighbourRadius: 1, query: '' });
    expect(selectedIds).toEqual(['c_1_4']);
    expect(ctx.map((c) => c.chunkId)).toEqual(['c_1_3', 'c_1_4', 'c_1_5']);
  });

  it('respects the character budget but always keeps the selection', () => {
    const { chunks: ctx } = assembleContext(chunks, { selected: [chunks[1]], maxChars: 10, query: 'gradients' });
    expect(ctx.map((c) => c.chunkId)).toEqual(['c_1_1']);
  });

  it('finds chunks inside a selection rectangle', () => {
    const hit = chunksInRegion(
      [mk(1, 'a', 'paragraph', 1, { x: 0.1, y: 0.1, w: 0.5, h: 0.1 }), mk(2, 'b', 'paragraph', 1, { x: 0.1, y: 0.8, w: 0.5, h: 0.1 })],
      1,
      { x: 0, y: 0, w: 1, h: 0.3 }
    );
    expect(hit.map((c) => c.chunkId)).toEqual(['c_1_1']);
  });
});

describe('sectioning', () => {
  const big = Array.from({ length: 40 }, (_, i) => mk(i, 'x'.repeat(1000), i % 10 === 0 ? 'heading' : 'paragraph'));

  it('keeps small documents in one pass', () => {
    expect(sectionChunks(big.slice(0, 5), { singlePassLimit: 10000, sectionSize: 4000 })).toHaveLength(1);
  });

  it('splits big documents at headings once a section is full', () => {
    const s = sectionChunks(big, { singlePassLimit: 10000, sectionSize: 10000 });
    expect(s.length).toBeGreaterThan(1);
    expect(s.every((sec, i) => i === 0 || sec[0].type === 'heading')).toBe(true);
    expect(s.flat()).toHaveLength(big.length); // nothing lost, nothing duplicated
  });

  it('force-splits documents without any heading', () => {
    const noHeadings = big.map((c) => ({ ...c, type: 'paragraph' }));
    const s = sectionChunks(noHeadings, { singlePassLimit: 10000, sectionSize: 8000 });
    expect(s.length).toBeGreaterThan(2);
    expect(Math.max(...s.map((sec) => sec.reduce((a, c) => a + c.text.length, 0)))).toBeLessThanOrEqual(8000 * 1.5 + 1000);
  });

  it('computes a bounded segment target', () => {
    expect(targetSegmentCount(1)).toBe(6);
    expect(targetSegmentCount(500)).toBe(60);
  });
});
