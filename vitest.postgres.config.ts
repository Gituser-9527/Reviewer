import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/**/*.postgres.test.ts',
      'packages/database/src/repository.integration.test.ts',
    ],
  },
});
