import { describe, it, expect } from 'vitest';
import {
  textItemToRect,
  unionRects,
  clamp01,
  verticalOverlap,
  isHorizontalItem,
} from './normalizeRect.js';

describe('normalizeRect', () => {
  it('converts pdf.js item coordinates to normalized page rect with padding', () => {
    const pageW = 612;
    const pageH = 792;
    const viewport = {
      width: pageW,
      height: pageH,
      transform: [1, 0, 0, -1, 0, 792],
    };
    const item = {
      transform: [12, 0, 0, 12, 72, 700],
      width: 100,
    };

    const rect = textItemToRect(item, viewport);
    expect(rect).not.toBeNull();
    expect(rect.x).toBeCloseTo(0.1157, 3);
    expect(rect.y).toBeCloseTo(0.0995, 3);
    expect(rect.w).toBeCloseTo(0.1673, 3);
    expect(rect.h).toBeCloseTo(0.0182, 3);
  });

  it('returns null for item with NaN width or transform', () => {
    const viewport = { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] };
    expect(textItemToRect({ transform: [1, 0, 0, 1, 0, 0], width: NaN }, viewport)).toBeNull();
    expect(textItemToRect(null, viewport)).toBeNull();
    expect(textItemToRect({ transform: null, width: 50 }, viewport)).toBeNull();
  });

  it('clamps values to [0, 1] range', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('unionRects correctly unions multiple rects and handles empty', () => {
    expect(unionRects([])).toBeNull();
    const r1 = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const r2 = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };
    const u = unionRects([r1, r2]);
    expect(u).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 });
  });

  it('calculates vertical overlap correctly', () => {
    const r1 = { x: 0, y: 0.1, w: 0.5, h: 0.2 };
    const r2 = { x: 0, y: 0.2, w: 0.5, h: 0.2 };
    const overlap = verticalOverlap(r1, r2);
    expect(overlap).toBeCloseTo(0.5, 2);
  });
});

