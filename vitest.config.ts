import { defineConfig } from "vitest/config";

// Pure-logic unit tests only (parsers, date utils) — no Next.js/path-alias
// plugins needed; tests import via relative paths.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
