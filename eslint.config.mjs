import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  // FASE-02: Security rules (strict everywhere)
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  // Relaxed rules for open-sse and tests (incremental adoption)
  {
    files: ["open-sse/**/*.ts", "tests/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@next/next/no-assign-module-variable": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Global ignores — keep ESLint scoped to source files only
  {
    ignores: [
      // Next.js build output
      ".next/**",
      "src/.next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Scripts and binaries
      "scripts/**",
      "bin/**",
      // Dependencies
      "node_modules/**",
      // VS Code extension and its large test fixtures
      "vscode-extension/**",
      // Docs
      "docs/**",
      // Open-SSE compiled/bundled output
      "open-sse/mcp-server/dist/**",
      // Playwright test output
      "playwright-report/**",
      "test-results/**",
      // Subdirectory .next build output (app/ subdir)
      "app/.next/**",
      // CLI package copy directory
      "clipr/**",
      // Test coverage output
      "coverage/**",
    ],
  },
];

export default eslintConfig;
