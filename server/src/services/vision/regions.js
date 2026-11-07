import { regionId } from '../../utils/ids.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const MAX_REGIONS_PER_PAGE = 24;
const MIN_AREA = 0.0003; // 0.03% of the page
const MAX_AREA = 0.85;

/** Gemini boxes are [ymin, xmin, ymax, xmax] on a 0-1000 grid. -> normalized {x,y,w,h}. */
export function boxToRect(box) {
  if (!Array.isArray(box) || box.length !== 4 || box.some((n) => !Number.isFinite(Number(n)))) return null;
  let [ymin, xmin, ymax, xmax] = box.map(Number);
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  const x = clamp01(xmin / 1000);
  const y = clamp01(ymin / 1000);
  const w = clamp01(xmax / 1000) - x;
  const h = clamp01(ymax / 1000) - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Turn raw model output for one page into clean region records.
 * Drops invalid / tiny / giant / near-duplicate boxes and caps the count.
 * `raw` items: { label, role, description, box_2d | rect, seq, figure }
 */
export function normalizeRegions(raw = [], page) {
  const out = [];
  for (const item of raw) {
    const rect = item.rect || boxToRect(item.box_2d);
    if (!rect) continue;
    const area = rect.w * rect.h;
    if (area < MIN_AREA || area > MAX_AREA) continue;
    if (out.some((o) => iou(o.rect, rect) > 0.85)) continue;

    const label = String(item.label || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!label) continue;
    out.push({
      rect,
      label,
      role: String(item.role || 'region').slice(0, 24),
      description: String(item.description || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      seq: Number.isFinite(Number(item.seq)) ? Math.max(0, Math.round(Number(item.seq))) : 0,
      figure: String(item.figure || '').slice(0, 80),
    });
    if (out.length >= MAX_REGIONS_PER_PAGE) break;
  }

  // Reading order inside a figure: explicit flow number first, then top-to-bottom, left-to-right.
  out.sort((a, b) => (a.seq || 1e6) - (b.seq || 1e6) || a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return out.map((r, i) => ({ ...r, chunkId: regionId(page, i) }));
}

/** Region -> Chunk document (same shape as text chunks so highlighting/linking just works). */
export function regionToChunk(region, { documentId, page, order }) {
  const text = region.description ? `${region.label}: ${region.description}` : region.label;
  return {
    documentId,
    chunkId: region.chunkId,
    page,
    order,
    type: 'image_region',
    text,
    rects: [region.rect],
    bbox: region.rect,
    fontSize: 10,
    column: 0,
    regionRole: region.role,
    regionSeq: region.seq,
    figure: region.figure,
  };
}
