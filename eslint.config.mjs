import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import hooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    ...next.configs["core-web-vitals"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ...hooks.configs.flat.recommended,
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);
