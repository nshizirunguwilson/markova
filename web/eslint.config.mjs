import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // A standalone Playwright script run with `node`, not app code - CommonJS
    // require() is correct there.
    "e2e/**",
  ]),
  {
    rules: {
      /**
       * Tracked debt, deliberately a warning rather than an error.
       *
       * Every occurrence is an untyped API response flowing through the
       * TanStack Query hooks - `useTermResults`, `useStudents` and friends all
       * return `any`, and each page then annotates its callbacks `(r: any)` to
       * match. Fixing it properly means declaring response types for all ~40
       * endpoints, which is worth doing but is its own piece of work, not a
       * side effect of an unrelated change.
       *
       * Keeping it visible as a warning means CI still fails on real errors
       * today instead of the lint job being switched off entirely. Do not add
       * new `any` - type the response you are touching.
       */
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
