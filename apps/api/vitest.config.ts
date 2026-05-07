import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    exclude: ['test/**/*.e2e-spec.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
  },
  resolve: {
    alias: {
      '@jasabersih/shared-types': new URL('../../packages/shared-types/src/index.ts', import.meta.url).pathname,
    },
  },
});
