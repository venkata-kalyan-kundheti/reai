import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

let anthropicClient = null;

function getClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: env.LLM_API_KEY,
    });
  }
  return anthropicClient;
}

export async function* generateStream({ system, prompt, model, signal }) {
  const client = getClient();
  const stream = await client.messages.stream(
    {
      model: model || env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal }
  );

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      yield chunk.delta.text;
    }
  }
}

