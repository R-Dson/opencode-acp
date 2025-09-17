import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@opencode-ai/sdk': new URL('./node_modules/@opencode-ai/sdk/dist/index.js', import.meta.url).pathname
    }
  }
});