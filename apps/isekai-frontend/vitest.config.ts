import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-helpers/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/lib/**/*.{js,ts}',
        'src/stores/**/*.{js,ts}',
        'src/hooks/**/*.{js,ts,tsx}',
        'src/components/**/*.{js,ts,tsx}',
        'src/pages/**/*.{js,ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.{js,ts}',
        'src/test-helpers/**',
        'src/**/*.d.ts',
        'src/lib/api.ts', // Exclude API client (just HTTP calls, no business logic)
        'src/lib/env.ts', // Exclude env validation (mostly error logging, hard to test)
        'src/stores/**/*.ts', // Will add tests with mocked APIs
        'src/hooks/use-mobile.tsx', // Will add tests with mocked matchMedia
        'src/hooks/useReviewCount.ts', // Will add tests with mocked API
        'src/hooks/use-toast.ts', // Reducer tested, exclude React hook wrapper
        'src/components/ui/**/*', // Exclude shadcn/ui components (third-party)
        'src/components/**/*Dialog.tsx', // Exclude dialog components (primarily Radix UI wrappers)
        'src/components/**/*Selector.tsx', // Exclude selector components (primarily Radix UI wrappers)
        'src/components/login-form.tsx', // Simple form, minimal logic
        'src/components/nav-*.tsx', // Exclude nav components (Sidebar UI wrappers)
        'src/components/app-sidebar.tsx', // Exclude sidebar (UI wrapper)
        'src/components/site-header.tsx', // Exclude header (UI wrapper)
        'dist/**',
      ],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
