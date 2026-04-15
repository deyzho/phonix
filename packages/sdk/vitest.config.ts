import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    // Intercept all .js imports and redirect to .ts source equivalents.
    // This ensures that source files importing './types.js' and test files
    // importing '../types.ts' resolve to the same absolute path and therefore
    // the same Vitest module cache entry — preventing instanceof identity splits.
    alias: [
      {
        find: /^(\.{1,2}\/.+)\.js$/,
        replacement: '$1.ts',
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
  },
});
