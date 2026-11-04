import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let aiInstance = null;

function getAi() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: env.LLM_API_KEY,
    });
  }
  return aiInstance;
}

export async function* generateStream({ system, prompt, model, signal }) {
  const ai = getAi();
  const selectedModel = model || env.LLM_MODEL || 'gemini-2.5-flash';

  logger.info({ model: selectedModel }, 'Starting Gemini content stream');

  const stream = await ai.models.generateContentStream({
    model: selectedModel,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    config: {
      systemInstruction: system,
      temperature: 0.2,
    },
  });

  for await (const chunk of stream) {
    if (signal?.aborted) {
      logger.info('Gemini generation stream aborted by client signal');
      return;
    }
    const text = chunk.text;
    if (text) {
      yield text;
    }
  }
}

