export const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Same maths as pdf.js Util.transform: result = m1 applied after m2.
export function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function normRect(minX, minY, maxX, maxY, pageW, pageH) {
  const x = clamp01(minX / pageW);
  const y = clamp01(minY / pageH);
  const x2 = clamp01(maxX / pageW);
  const y2 = clamp01(maxY / pageH);
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

export const isValidRect = (r) =>
  r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

export function textItemToRect(item, viewport) {
  if (!item || !Array.isArray(item.transform) || !Number.isFinite(item.width)) return null;
  const tx = multiply(viewport.transform, item.transform);
  const fontH = Math.hypot(tx[2], tx[3]);
  const len = Math.hypot(tx[0], tx[1]);
  if (!fontH || !len) return null;
  const dx = (tx[0] / len) * item.width;
  const dy = (tx[1] / len) * item.width;
  const ox = tx[4];
  const oy = tx[5];
  const xs = [ox, ox + dx, ox + tx[2], ox + dx + tx[2]];
  const ys = [oy, oy + dy, oy + tx[3], oy + dy + tx[3]];
  const pad = fontH * 0.1;
  const r = normRect(
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) + pad,
    Math.max(...ys) + pad,
    viewport.width,
    viewport.height
  );
  return isValidRect(r) ? r : null;
}

export function unionRects(rects) {
  const list = rects.filter(isValidRect);
  if (!list.length) return null;
  const x = Math.min(...list.map((r) => r.x));
  const y = Math.min(...list.map((r) => r.y));
  const x2 = Math.max(...list.map((r) => r.x + r.w));
  const y2 = Math.max(...list.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

export function verticalOverlap(a, b) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const overlap = Math.max(0, bottom - top);
  return overlap / Math.min(a.h, b.h);
}

export function isHorizontalItem(item, viewport) {
  if (!item || !Array.isArray(item.transform)) return false;
  const tx = multiply(viewport.transform, item.transform);
  return Math.abs(tx[1]) <= Math.abs(tx[0]) * 0.3;
}

