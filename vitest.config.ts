import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: [
      'apps/**/*.postgres.test.ts',
      'packages/database/src/repository.integration.test.ts',
    ],
  },
});
