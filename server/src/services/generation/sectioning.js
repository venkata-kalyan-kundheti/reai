import { env } from '../../config/env.js';

/**
 * Split the document into sections that each fit one LLM call.
 *
 *  - small documents: a single pass
 *  - big documents: close a section at a heading once it is "full" (nicer boundaries),
 *    but ALWAYS close it at 1.5x the target even without a heading (documents with no
 *    detectable headings must not become one giant request).
 */
export function sectionChunks(chunks, { singlePassLimit = env.SINGLE_PASS_LIMIT_CHARS, sectionSize = env.SECTION_SIZE_CHARS } = {}) {
  const total = chunks.reduce((acc, c) => acc + c.text.length, 0);
  if (total <= singlePassLimit) return [chunks];

  const sections = [];
  let current = [];
  let len = 0;

  for (const chunk of chunks) {
    const full = len >= sectionSize;
    const overfull = len >= sectionSize * 1.5;
    if (current.length > 0 && ((full && chunk.type === 'heading') || overfull)) {
      sections.push(current);
      current = [];
      len = 0;
    }
    current.push(chunk);
    len += chunk.text.length;
  }
  if (current.length) sections.push(current);
  return sections;
}

/** Soft target for how many segments a section should produce (keeps output size predictable). */
export function targetSegmentCount(chunkCount) {
  return Math.max(6, Math.min(60, Math.round(chunkCount * 0.8)));
}
