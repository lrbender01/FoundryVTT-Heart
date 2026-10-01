import { defineConfig } from "vitest/config";

// Rules tests for the Heart fork (2026-09-30, Luke). Node environment: the
// tests load only the pure rules modules (no .html / .sass imports, which
// need webpack), with the few Foundry globals they touch stubbed in
// test/setup.mjs. vitest itself resolves from the monorepo root's
// node_modules (the fork is not an npm workspace and installs nothing for it).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.mjs"],
    include: ["test/**/*.test.mjs"],
  },
});
