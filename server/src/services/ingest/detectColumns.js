import { WIDE_LINE_W, GUTTER_MIN_W } from './constants.js';

function findGutter(lines) {
  if (lines.length < 8) return null;
  let bestStart = null;
  let bestLen = 0;
  let runStart = null;
  for (let i = 30; i <= 70; i++) {
    const x = i / 100;
    const covered = lines.some((l) => l.rect.x < x && l.rect.x + l.rect.w > x);
    if (covered) {
      runStart = null;
    } else {
      if (runStart === null) runStart = x;
      const len = x - runStart;
      if (len >= bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
    }
  }
  if (bestStart === null || bestLen < GUTTER_MIN_W) return null;
  const centre = bestStart + bestLen / 2;
  const left = lines.filter((l) => l.rect.x + l.rect.w <= centre).length;
  const right = lines.filter((l) => l.rect.x >= centre).length;
  if (left < 4 || right < 4) return null;
  if (left < lines.length * 0.25 || right < lines.length * 0.25) return null;
  return centre;
}

export function orderLines(lines) {
  const sorted = [...lines].sort((a, b) => a.centerY - b.centerY || a.rect.x - b.rect.x);
  const out = [];
  let band = [];

  const flush = () => {
    if (!band.length) return;
    const centre = findGutter(band);
    if (centre === null) {
      band.forEach((l) => {
        l.column = 0;
        out.push(l);
      });
    } else {
      band
        .filter((l) => l.rect.x < centre)
        .forEach((l) => {
          l.column = 1;
          out.push(l);
        });
      band
        .filter((l) => l.rect.x >= centre)
        .forEach((l) => {
          l.column = 2;
          out.push(l);
        });
    }
    band = [];
  };

  for (const l of sorted) {
    if (l.rect.w > WIDE_LINE_W) {
      flush();
      l.column = 0;
      out.push(l);
    } else {
      band.push(l);
    }
  }
  flush();
  return out;
}

