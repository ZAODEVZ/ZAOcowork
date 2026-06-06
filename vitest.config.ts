import { defineConfig } from "vitest/config";

// Pure-logic unit tests only (parsers, date utils). These modules have no
// Node/browser/server imports, so the default node environment is enough and we
// don't need the Next.js or path-alias plugins. Tests import via relative paths.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
