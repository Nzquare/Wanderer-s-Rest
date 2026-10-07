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
    // Standalone Node program, not part of the Next.js app (§Network
    // thermal printer / print bridge) — plain CommonJS, not meant to be
    // linted against this app's React/TS rules.
    "print-bridge/**",
  ]),
]);

export default eslintConfig;
