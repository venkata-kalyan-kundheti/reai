import { z } from 'zod';
import { rectSchema } from './chunk.js';

export const createGenerationSchema = z.object({
  documentId: z.string(),
  level: z.enum(['beginner', 'medium', 'experienced']).default('medium'),
  goal: z.enum(['exam', 'presentation', 'understanding']).default('understanding'),
  question: z.string().max(2000).optional().default('Explain this document'),
});

export const askFollowupSchema = z.object({
  question: z.string().min(1).max(2000),
  selectionText: z.string().optional(),
  selectionRect: z
    .object({
      page: z.number().int().min(1),
      rect: rectSchema,
    })
    .optional(),
  anchorSegmentId: z.string().optional(),
});

export const simplifyFollowupSchema = z.object({
  segmentId: z.string().min(1),
});

