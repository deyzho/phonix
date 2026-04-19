import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // Resolve @axonsdk/sdk to TypeScript source during tests so the relative
      // .js→.ts alias below doesn't hit dist/ files that have no .ts sibling.
      {
        find: '@axonsdk/sdk',
        replacement: resolve(__dirname, '../sdk/src/index.ts'),
      },
      // Resolve .js imports to .ts source during tests
      { find: /^(\.{1,2}\/.+)\.js$/, replacement: '$1.ts' },
    ],
  },
  test: {
    environment: 'node',
  },
});
