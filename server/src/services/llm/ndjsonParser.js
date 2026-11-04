import { segmentSchema } from '../../schemas/segment.js';
import { logger } from '../../utils/logger.js';

export async function* parseNdjsonStream(asyncIterable, validChunkIdsSet = null) {
  let buffer = '';

  for await (const chunk of asyncIterable) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      let line = rawLine.trim();
      // Strip markdown code fences
      line = line.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      // Strip leading array bracket if model attempted to output a JSON array
      if (line.startsWith('[')) line = line.slice(1).trim();
      // Strip trailing comma or array closing bracket
      line = line.replace(/,\s*$/, '').replace(/\]\s*$/, '').trim();

      if (!line || line === '[' || line === ']') continue;

      try {
        const obj = JSON.parse(line);
        // Normalize common type synonyms
        if (obj.type === 'header' || obj.type === 'subheading') obj.type = 'heading';
        if (obj.type === 'point' || obj.type === 'item') obj.type = 'bullet';

        const validated = segmentSchema.safeParse(obj);
        if (!validated.success) {
          logger.warn({ err: validated.error, line }, 'Dropping invalid segment schema');
          continue;
        }

        const seg = validated.data;
        if (validChunkIdsSet) {
          seg.sources = seg.sources.filter((s) => validChunkIdsSet.has(s));
        }
        yield seg;
      } catch {
        // Skip malformed line
      }
    }
  }

  // Final flush for any remaining line in buffer
  let finalLine = buffer.trim();
  finalLine = finalLine.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  if (finalLine.startsWith('[')) finalLine = finalLine.slice(1).trim();
  finalLine = finalLine.replace(/,\s*$/, '').replace(/\]\s*$/, '').trim();

  if (finalLine && finalLine !== '[' && finalLine !== ']') {
    try {
      const obj = JSON.parse(finalLine);
      if (obj.type === 'header' || obj.type === 'subheading') obj.type = 'heading';
      if (obj.type === 'point' || obj.type === 'item') obj.type = 'bullet';

      const validated = segmentSchema.safeParse(obj);
      if (validated.success) {
        const seg = validated.data;
        if (validChunkIdsSet) {
          seg.sources = seg.sources.filter((s) => validChunkIdsSet.has(s));
        }
        yield seg;
      }
    } catch {
      // ignore trailing garbage
    }
  }
}
