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
    files: ["open-sse/**/*.ts", "src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
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
      // Vendored Open WebUI frontend. It is committed (the chat cannot be built without it)
      // but it is upstream's code, with upstream's own eslint config and style — linting it
      // with Routiform's rules produces ~200 errors we would never fix and turns `npm run
      // lint` red for everyone. Our patches inside it are marked ROUTIFORM PATCH.
      "open-webui/**",
      "public/owui/**",
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
