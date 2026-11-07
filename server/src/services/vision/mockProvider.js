/**
 * Dev/test stand-in for the vision model (no API key needed).
 *
 * Heuristic, for demos only: short text labels and "Title Case Pairs" found on a page are treated as
 * diagram nodes and numbered left-to-right. The real provider looks at the rendered page image instead.
 */
const PAIR = /[A-Z][a-z]+(?: [A-Z][a-z]+)+/g;

function candidates(c) {
  if (c.type === 'heading' || c.type === 'caption') return [];
  // a single short label ("Ship Order")
  if (c.text.length <= 40 && c.bbox.w < 0.35) return [{ label: c.text, from: 0, to: c.text.length, chunk: c }];
  // several labels merged into one text line ("Validate Input Check Stock Charge Payment")
  if (c.bbox.h < 0.04 && c.text.length <= 120) {
    const found = [];
    const words = c.text.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
    let cursor = 0;
    for (const w of words) {
      const i = c.text.indexOf(w, cursor);
      if (i < 0) continue;
      found.push({ label: w, from: i, to: i + w.length, chunk: c });
      cursor = i + w.length;
    }
    return found.length >= 2 ? found : [];
  }
  return [];
}

export async function extractRegions({ page, textChunks = [] }) {
  const nodes = textChunks.filter((c) => c.page === page).flatMap(candidates);
  if (nodes.length < 2) return [];

  const pad = 0.012;
  const regions = nodes.map((n) => {
    const b = n.chunk.bbox;
    const len = n.chunk.text.length;
    const x0 = b.x + (b.w * n.from) / len;
    const x1 = b.x + (b.w * n.to) / len;
    const x = Math.max(0, x0 - pad);
    const y = Math.max(0, b.y - pad);
    return {
      figure: 'Figure',
      label: n.label,
      role: 'node',
      description: '',
      rect: { x, y, w: Math.min(1 - x, x1 - x0 + pad * 2), h: Math.min(1 - y, b.h + pad * 2) },
    };
  });

  regions.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return regions.slice(0, 12).map((r, i) => ({ ...r, seq: i + 1, description: `Step ${i + 1} of the diagram` }));
}
