import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

export default defineConfig({
  ...base,
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
  },
});
