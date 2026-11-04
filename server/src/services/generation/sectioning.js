import { env } from '../../config/env.js';

export function sectionChunks(chunks) {
  const totalLength = chunks.reduce((acc, c) => acc + c.text.length, 0);
  if (totalLength <= env.SINGLE_PASS_LIMIT_CHARS) {
    return [chunks];
  }

  const sections = [];
  let current = [];
  let currentLength = 0;

  for (const chunk of chunks) {
    const isHeading = chunk.type === 'heading';
    if (
      currentLength >= env.SECTION_SIZE_CHARS &&
      isHeading &&
      current.length > 0
    ) {
      sections.push(current);
      current = [chunk];
      currentLength = chunk.text.length;
    } else {
      current.push(chunk);
      currentLength += chunk.text.length;
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections;
}

