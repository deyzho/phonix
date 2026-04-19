import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // Resolve @axonsdk/sdk to TypeScript source during tests (no build needed)
      {
        find: '@axonsdk/sdk',
        replacement: resolve(__dirname, '../sdk/src/index.ts'),
      },
      // Intercept all relative .js imports and redirect to .ts source equivalents.
      // Ensures source files importing './foo.js' and tests importing './foo.ts'
      // resolve to the same absolute path and the same Vitest module cache entry,
      // preventing instanceof identity splits.
      {
        find: /^(\.{1,2}\/.+)\.js$/,
        replacement: '$1.ts',
      },
    ],
  },
  test: {
    environment: 'node',
  },
});
