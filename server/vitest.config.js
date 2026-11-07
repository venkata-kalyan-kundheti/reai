import { defineConfig } from 'vitest/config';

// Tests must never talk to a real LLM (that would burn the developer's API quota),
// so we force the mock providers regardless of what server/.env contains.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      COOKIE_SECRET: 'test-secret',
      LLM_PROVIDER: 'mock',
      LLM_API_KEY: '',
      VISION_PROVIDER: 'mock',
      VISION_API_KEY: '',
      LLM_RPM: '1000',
      LLM_TPM: '10000000',
      LLM_MAX_CONCURRENT: '4',
    },
  },
});
