import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    settings: {
      next: {
        rootDir: "apps/web/",
      },
      react: {
        version: "19.2.8",
      },
    },
    rules: {
      // FINALTab is App Router-only; this legacy Pages Router rule probes for a
      // pages/ directory and emits a false configuration warning in every CI run.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    // Keep pre-existing debt visible without making the first CI baseline
    // impossible to adopt. These narrow exceptions should be removed as the
    // named files are cleaned up; the same rules still fail everywhere else.
    files: ["packages/engine/src/eip3009.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    files: [
      "packages/engine/test/settlementAbi.test.ts",
      "packages/vision/src/fallbackRouter.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["packages/keeperhub/src/idempotency.ts"],
    rules: {
      "prefer-const": "warn",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/dist/**",
    "**/coverage/**",
    "**/artifacts/**",
    "**/cache/**",
    "**/typechain-types/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
  ]),
]);
