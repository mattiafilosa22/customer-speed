import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Flat ESLint config (Next 16). eslint-config-next ships native flat configs,
 * so no FlatCompat shim is needed. Order: Next rules → Prettier (turns off
 * stylistic rules that conflict with the formatter) → our project overrides.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      // Prisma 7 generated client (custom output) — generated, not authored.
      "src/generated/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  eslintConfigPrettier,
  {
    rules: {
      // Enforce the quality standard: no `any`, no unused code.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // CLI scripts (seed, migrations tooling, one-off provisioning) legitimately
    // report progress to stdout; allow informational logging there.
    files: ["prisma/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
];

export default eslintConfig;
