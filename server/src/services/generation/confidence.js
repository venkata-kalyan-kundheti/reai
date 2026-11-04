export function computeConfidence(segmentText, citedChunks) {
  if (!citedChunks || citedChunks.length === 0) return 'low';

  const tokenize = (str) =>
    new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4)
    );

  const segWords = tokenize(segmentText);
  if (segWords.size === 0) return 'high';

  const chunkWords = new Set();
  for (const c of citedChunks) {
    for (const w of tokenize(c.text)) {
      chunkWords.add(w);
    }
  }

  let matches = 0;
  for (const w of segWords) {
    if (chunkWords.has(w)) matches++;
  }

  const ratio = matches / segWords.size;
  return ratio >= 0.25 ? 'high' : 'low';
}

