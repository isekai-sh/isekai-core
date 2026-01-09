import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'src/**/*.integration.test.{js,ts}'],
    setupFiles: ['./src/test-helpers/setup.ts'],
    onConsoleLog(log) {
      // Suppress known test noise
      const suppressPatterns = [
        '[Redis] Failed to connect to Redis',
        '[Redis] Caching will be disabled',
        'Redis connection timeout',
        'Connection refused',
      ];

      if (suppressPatterns.some((pattern) => log.includes(pattern))) {
        return false;
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'src/**/*.test.{js,ts}',
        'src/**/*.integration.test.{js,ts}',
        'src/test-helpers/**',
        'src/db/index.ts',
        'src/index.ts',
        'dist/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
