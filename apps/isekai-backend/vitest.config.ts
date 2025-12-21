import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules',
      'dist',
      'src/**/*.integration.test.{js,ts}'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'src/**/*.test.{js,ts}',
        'src/**/*.integration.test.{js,ts}',
        'src/index.ts',
        'dist/**'
      ],
      thresholds: {
        lines: 0.5,
        functions: 1,
        branches: 0,
        statements: 0.5
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
