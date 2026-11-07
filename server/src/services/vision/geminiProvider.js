import { env } from '../../config/env.js';
import { generateStream, PRIORITY } from '../llm/geminiProvider.js';
import { classifyError } from '../llm/errors.js';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    regions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          figure: { type: 'STRING' },
          label: { type: 'STRING' },
          role: { type: 'STRING' },
          description: { type: 'STRING' },
          seq: { type: 'INTEGER' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['label', 'box_2d'],
      },
    },
  },
  required: ['regions'],
};

const SYSTEM = `You analyse ONE page image from a document and locate its diagrams, flowcharts, architecture drawings, charts and tables.
For every meaningful part of every figure return one region:
- figure: short name of the figure it belongs to (e.g. "Figure 1: Order flow").
- label: the visible text of that part (box text, axis name, legend entry) or a 2-5 word name if it has none.
- role: one of node, edge, label, axis, legend, series, cell, region.
- description: ONE short sentence on what this part is or does (for edges: "from X to Y").
- seq: the step number if the figure shows a flow/process (1 = first step), otherwise 0.
- box_2d: [ymin, xmin, ymax, xmax] with every value an integer from 0 to 1000 (relative to the page image).
Rules: only return parts of figures, never ordinary paragraphs of body text. Boxes must be tight. Return at most 24 regions. If the page has no figure, return {"regions": []}.`;

/**
 * @returns {Promise<Array>} raw regions (see regions.js#normalizeRegions)
 */
export async function extractRegions({ imageBuffer, mimeType = 'image/jpeg', page, textHints = [], signal, onNotice }) {
  const hint = textHints.length
    ? `Text found on this page (use it to read labels exactly):\n${textHints.join('\n').slice(0, 1800)}`
    : 'No text layer information is available for this page.';

  const stream = generateStream({
    system: SYSTEM,
    prompt: `Page ${page}. ${hint}\n\nReturn the JSON now.`,
    model: env.VISION_MODEL || env.LLM_MODEL,
    apiKey: env.VISION_API_KEY || env.LLM_API_KEY,
    parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }],
    extraTokens: 1500, // an image costs roughly this much input
    maxOutputTokens: 4096,
    responseSchema: SCHEMA,
    priority: PRIORITY.BACKGROUND,
    signal,
    onNotice,
  });

  let text = '';
  for await (const part of stream) text += part;

  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim());
    return Array.isArray(parsed.regions) ? parsed.regions : [];
  } catch (err) {
    throw classifyError(Object.assign(new Error('Vision model returned invalid JSON'), { status: 502 }));
  }
}
