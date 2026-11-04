export const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function normToPx(rect, pageW, pageH) {
  if (!rect) return null;
  return {
    left: rect.x * pageW,
    top: rect.y * pageH,
    width: rect.w * pageW,
    height: rect.h * pageH,
  };
}

export function pxToNorm(rect, pageW, pageH) {
  if (!rect || !pageW || !pageH) return null;
  return {
    x: clamp01(rect.left / pageW),
    y: clamp01(rect.top / pageH),
    w: clamp01(rect.width / pageW),
    h: clamp01(rect.height / pageH),
  };
}

export function rectIntersects(r1, r2) {
  if (!r1 || !r2) return false;
  return !(
    r2.x > r1.x + r1.w ||
    r2.x + r2.w < r1.x ||
    r2.y > r1.y + r1.h ||
    r2.y + r2.h < r1.y
  );
}

export function pointInRect(x, y, rect) {
  if (!rect) return false;
  return (
    x >= rect.x &&
    x <= rect.x + rect.w &&
    y >= rect.y &&
    y <= rect.y + rect.h
  );
}

