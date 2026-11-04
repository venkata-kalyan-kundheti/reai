import { FURNITURE_ZONE, FURNITURE_MIN_PAGES, FURNITURE_MIN_RATIO } from './constants.js';

const keyOf = (t) => t.toLowerCase().replace(/[0-9]+/g, '#').replace(/ +/g, ' ').trim();
const inZone = (l) => l.centerY < FURNITURE_ZONE || l.centerY > 1 - FURNITURE_ZONE;
const isBarePageNumber = (k) => /^[-– ]*#[-– ]*$/.test(k) || /^page #( of #)?$/.test(k);

export function detectFurniture(pagesLines) {
  const seen = new Map();
  for (const pl of pagesLines) {
    for (const l of pl.lines) {
      if (!inZone(l)) continue;
      const k = keyOf(l.text);
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(pl.number);
    }
  }

  const need = Math.max(FURNITURE_MIN_PAGES, Math.ceil(pagesLines.length * FURNITURE_MIN_RATIO));
  for (const pl of pagesLines) {
    for (const l of pl.lines) {
      if (!inZone(l)) continue;
      const k = keyOf(l.text);
      const repeated = pagesLines.length >= 4 && seen.get(k).size >= need;
      if (isBarePageNumber(k) || repeated) l.isFurniture = true;
    }
  }
}

