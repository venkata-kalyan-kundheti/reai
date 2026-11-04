import { env } from '../../config/env.js';
import * as mockProvider from './mockProvider.js';
import * as geminiProvider from './geminiProvider.js';

export function getVisionProvider() {
  if (env.VISION_PROVIDER === 'gemini') {
    return geminiProvider;
  }
  return mockProvider;
}

