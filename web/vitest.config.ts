import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Only colocated unit tests under src/. The two scripts in e2e/ are
    // standalone Playwright programs run with `node`, not Vitest suites.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // `include` counts every matching source file, not only the ones a test
      // happened to import. That distinction matters: measured the narrow way
      // this suite reported 79% while the real figure across the codebase was
      // 2%, because it was only ever looking at the files it already covered.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        // Generated from design/tokens.json; drift is caught by
        // scripts/sync-design-tokens.mjs --check instead.
        'src/app/tokens.css',
      ],
      reporter: ['text-summary', 'html', 'lcov'],
      // A ratchet, not a target. These are set just under the current numbers
      // so an accidental deletion of tests fails the build, and they are meant
      // to be raised as coverage climbs, never lowered to make a build pass.
      thresholds: {
        statements: 87,
        branches: 73,
        functions: 84,
        lines: 88,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
