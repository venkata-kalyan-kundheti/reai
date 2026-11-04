import { z } from 'zod';

export const rectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const chunkSchema = z.object({
  chunkId: z.string(),
  page: z.number().int().min(1),
  order: z.number().int().min(0),
  type: z.enum(['heading', 'paragraph', 'list_item', 'caption', 'image_region']),
  text: z.string(),
  rects: z.array(rectSchema),
  bbox: rectSchema,
  fontSize: z.number().default(10),
  column: z.number().int().default(0),
});

