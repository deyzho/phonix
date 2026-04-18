import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // Resolve .js imports to .ts source during tests
      { find: /^(\.{1,2}\/.+)\.js$/, replacement: '$1.ts' },
    ],
  },
  test: {
    environment: 'node',
  },
});
