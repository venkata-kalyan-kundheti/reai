const tokenize = (str) =>
  new Set(
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );

const numbersIn = (str) => new Set(String(str).match(/\d[\d,.]*\d|\d/g) || []);

/**
 * 'high' when the cited chunks plausibly support the segment, 'low' otherwise
 * (the UI draws a dashed highlight for 'low' so users double-check it).
 *  - not enough shared vocabulary with the cited text => low
 *  - a number in the explanation that never appears in the cited text => low
 */
export function computeConfidence(segmentText, citedChunks) {
  if (!citedChunks || citedChunks.length === 0) return 'low';

  const segWords = tokenize(segmentText);
  if (segWords.size === 0) return 'high';

  const chunkText = citedChunks.map((c) => c.text).join(' ');
  const chunkWords = tokenize(chunkText);

  let matches = 0;
  for (const w of segWords) if (chunkWords.has(w)) matches++;
  if (matches / segWords.size < 0.25) return 'low';

  const chunkNums = numbersIn(chunkText);
  for (const n of numbersIn(segmentText)) {
    if (n.length >= 2 && !chunkNums.has(n)) return 'low';
  }
  return 'high';
}
