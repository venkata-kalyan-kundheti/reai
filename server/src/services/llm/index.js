import { env } from '../../config/env.js';
import * as mockProvider from './mockProvider.js';
import * as anthropicProvider from './anthropicProvider.js';
import * as geminiProvider from './geminiProvider.js';

export function getLlmProvider() {
  if (env.LLM_PROVIDER === 'gemini') {
    return geminiProvider;
  }
  if (env.LLM_PROVIDER === 'anthropic') {
    return anthropicProvider;
  }
  return mockProvider;
}

