import { describe, it, expect } from 'vitest';
import { normToPx, pxToNorm, rectIntersects, pointInRect } from './geometry.js';

describe('client geometry', () => {
  it('converts normalized rect to pixel coordinates correctly', () => {
    const norm = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 };
    const px = normToPx(norm, 1000, 2000);
    expect(px).toEqual({
      left: 100,
      top: 400,
      width: 500,
      height: 600,
    });
  });

  it('converts pixel rect to normalized coordinates with clamping', () => {
    const px = { left: 100, top: 400, width: 500, height: 600 };
    const norm = pxToNorm(px, 1000, 2000);
    expect(norm.x).toBeCloseTo(0.1);
    expect(norm.y).toBeCloseTo(0.2);
    expect(norm.w).toBeCloseTo(0.5);
    expect(norm.h).toBeCloseTo(0.3);
  });

  it('tests rect intersection accurately', () => {
    const r1 = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
    const r2 = { x: 0.2, y: 0.2, w: 0.3, h: 0.3 };
    const r3 = { x: 0.6, y: 0.6, w: 0.2, h: 0.2 };
    expect(rectIntersects(r1, r2)).toBe(true);
    expect(rectIntersects(r1, r3)).toBe(false);
  });

  it('tests point in rect accurately', () => {
    const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    expect(pointInRect(0.3, 0.3, r)).toBe(true);
    expect(pointInRect(0.1, 0.3, r)).toBe(false);
  });
});

