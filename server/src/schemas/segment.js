import { z } from 'zod';
import { SOURCE_ID_RE } from '../utils/ids.js';

export const segmentSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'bullet', 'step']),
  depth: z.number().int().min(1).max(3).default(1),
  text: z.string().min(1).max(4000),
  sources: z.array(z.string().regex(SOURCE_ID_RE)).default([]),
});

export const storedSegmentSchema = segmentSchema.extend({
  segmentId: z.string(),
  order: z.number().int().min(0),
  confidence: z.enum(['high', 'low']).default('high'),
});

