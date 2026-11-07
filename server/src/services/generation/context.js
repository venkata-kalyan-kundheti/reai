/**
 * Everything that decides WHICH document text the model sees.
 * Pure functions (no DB, no network) so they are easy to test.
 */

const STOPWORDS = new Set(
  ('the a an and or but if then else of to in on at by for with from as is are was were be been being this that these those it its ' +
    'what why how when where which who whom do does did can could should would will may might about into over under between than so ' +
    'not no yes you your i we they he she them his her our their me my explain please tell give show mean means').split(' ')
);

export function tokenize(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Compact table of contents: "p3 Introduction", capped so it stays cheap. */
export function buildOutline(chunks, { maxEntries = 60, maxChars = 3000 } = {}) {
  const lines = [];
  let used = 0;
  for (const c of chunks) {
    if (c.type !== 'heading') continue;
    const line = `p${c.page} ${c.text.replace(/\s+/g, ' ').slice(0, 90)}`;
    if (lines.length >= maxEntries || used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines;
}

export function formatChunk(c) {
  if (c.type === 'image_region') return `[${c.chunkId}] (Page ${c.page}, figure part): ${c.text.replace(/\s+/g, ' ')}`;
  return `[${c.chunkId}] (Page ${c.page}): ${c.text.replace(/\s+/g, ' ')}`;
}

export function rectsOverlap(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
}

/** Chunks on `page` whose box intersects the user's selection rectangle. */
export function chunksInRegion(chunks, page, rect) {
  return chunks.filter((c) => c.page === page && c.bbox && rectsOverlap(c.bbox, rect));
}

/** BM25-lite: rank chunks by how well they match the query words. */
export function rankByKeywords(chunks, query, limit = 8) {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const docs = chunks.map((c) => ({ c, tokens: tokenize(c.text) }));
  const N = docs.length || 1;
  const df = new Map();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / N || 1;
  const k1 = 1.4;
  const b = 0.75;

  const scored = [];
  for (const d of docs) {
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.tokens.length) / avgLen));
    }
    if (score > 0) scored.push({ c: d.c, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit).map((s) => s.c);
}

/**
 * Assemble the evidence for an Ask / Simplify call.
 * Priority (kept first when the budget is tight): selected > anchor sources > neighbours > keyword hits.
 * Result is returned in document order so the text reads naturally.
 */
export function assembleContext(
  allChunks,
  { selected = [], anchor = [], query = '', neighbourRadius = 2, maxChars = 14000, keywordLimit = 6 } = {}
) {
  const byId = new Map(allChunks.map((c, i) => [c.chunkId, { c, i }]));
  const picked = new Map();
  let used = 0;

  const add = (chunk, role) => {
    if (!chunk || picked.has(chunk.chunkId)) return;
    if (used + chunk.text.length > maxChars && picked.size > 0) return;
    picked.set(chunk.chunkId, { chunk, role });
    used += chunk.text.length;
  };

  for (const c of selected) add(c, 'selected');
  for (const c of anchor) add(c, 'anchor');

  const core = [...selected, ...anchor];
  for (const c of core) {
    const idx = byId.get(c.chunkId)?.i;
    if (idx === undefined) continue;
    for (let d = 1; d <= neighbourRadius; d++) {
      add(allChunks[idx - d], 'neighbour');
      add(allChunks[idx + d], 'neighbour');
    }
    // nearest heading above, so the model knows which section it is in
    for (let j = idx - 1; j >= 0; j--) {
      if (allChunks[j].type === 'heading') {
        add(allChunks[j], 'heading');
        break;
      }
    }
  }

  for (const c of rankByKeywords(allChunks, query, keywordLimit)) add(c, 'keyword');

  const ordered = [...picked.values()].sort((a, b) => byId.get(a.chunk.chunkId).i - byId.get(b.chunk.chunkId).i);
  return {
    chunks: ordered.map((p) => p.chunk),
    selectedIds: ordered.filter((p) => p.role === 'selected' || p.role === 'anchor').map((p) => p.chunk.chunkId),
  };
}
