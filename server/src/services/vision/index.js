import { env } from '../../config/env.js';
import * as mockProvider from './mockProvider.js';
import * as geminiProvider from './geminiProvider.js';

export function getVisionProvider() {
  return env.VISION_PROVIDER === 'gemini' ? geminiProvider : mockProvider;
}
