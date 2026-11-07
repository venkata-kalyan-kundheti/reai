import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { openForRender, findFigurePages, renderPageJpeg, loadCanvas } from './figures.js';
import { extractText } from './extractText.js';
import { buildLines, medianFontSize, buildChunksForPage } from './buildChunks.js';
import { orderLines } from './detectColumns.js';
import { extractRegions } from '../vision/mockProvider.js';
import { normalizeRegions, regionToChunk, boxToRect, iou } from '../vision/regions.js';

const FIXTURE = path.resolve(import.meta.dirname, '../../../test/fixtures/figure.pdf');

async function textChunks() {
  const pages = await extractText(FIXTURE);
  const all = pages.flatMap((p) => buildLines(p));
  const body = medianFontSize(all);
  const chunks = [];
  for (const p of pages) chunks.push(...buildChunksForPage(p, orderLines(buildLines(p)), body, chunks.length));
  return chunks;
}

describe('figure detection + rendering', () => {
  it('flags the diagram page and ignores the text-only page', async () => {
    const pdf = await openForRender(FIXTURE);
    const pages = await findFigurePages(pdf, 10);
    expect(pages.map((p) => p.page)).toEqual([1]);
    await pdf.destroy();
  });

  it('renders a page to a non-trivial JPEG', async () => {
    expect(await loadCanvas()).toBeTruthy();
    const pdf = await openForRender(FIXTURE);
    const img = await renderPageJpeg(pdf, 1);
    expect(img.buffer.subarray(0, 2).toString('hex')).toBe('ffd8'); // JPEG magic
    expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(1600);
    expect(img.buffer.length).toBeGreaterThan(5000);
    await pdf.destroy();
  });
});

describe('regions', () => {
  it('converts Gemini 0-1000 boxes to normalized rects', () => {
    const close = (r, e) => Object.keys(e).forEach((k) => expect(r[k]).toBeCloseTo(e[k], 6));
    close(boxToRect([100, 200, 300, 600]), { x: 0.2, y: 0.1, w: 0.4, h: 0.2 });
    close(boxToRect([300, 600, 100, 200]), { x: 0.2, y: 0.1, w: 0.4, h: 0.2 }); // swapped corners
    expect(boxToRect([0, 0, 0, 0])).toBeNull();
    expect(boxToRect('nope')).toBeNull();
    expect(boxToRect([0, 0, 2000, 2000])).toEqual({ x: 0, y: 0, w: 1, h: 1 }); // clamped
  });

  it('drops tiny, huge and duplicate boxes and orders by flow', () => {
    const out = normalizeRegions(
      [
        { label: 'B', seq: 2, box_2d: [100, 400, 200, 600] },
        { label: 'A', seq: 1, box_2d: [100, 100, 200, 300] },
        { label: 'A again', seq: 3, box_2d: [101, 101, 201, 301] }, // near-duplicate
        { label: 'dot', seq: 4, box_2d: [10, 10, 12, 12] }, // too small
        { label: 'page', seq: 5, box_2d: [0, 0, 1000, 1000] }, // whole page
        { label: '', seq: 6, box_2d: [500, 500, 600, 600] }, // no label
      ],
      3
    );
    expect(out.map((r) => r.label)).toEqual(['A', 'B']);
    expect(out.map((r) => r.chunkId)).toEqual(['r_3_0', 'r_3_1']);
    expect(iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })).toBe(1);
  });

  it('mock vision finds the flowchart boxes on the real fixture and they become valid chunks', async () => {
    const chunks = await textChunks();
    const raw = await extractRegions({ page: 1, textChunks: chunks });
    const regions = normalizeRegions(raw, 1);
    const labels = regions.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(['Validate Input', 'Check Stock', 'Charge Payment', 'Ship Order']));

    const doc = regionToChunk(regions[0], { documentId: 'd', page: 1, order: 9.001 });
    expect(doc).toMatchObject({ type: 'image_region', page: 1, chunkId: expect.stringMatching(/^r_1_\d+$/) });
    expect(doc.bbox.w).toBeGreaterThan(0);
    expect(doc.rects).toHaveLength(1);
  });
});
