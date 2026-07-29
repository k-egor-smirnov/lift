import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configRoot = fileURLToPath(new URL(".", import.meta.url));
const requireFromConfig = createRequire(import.meta.url);
const fakeIndexedDbAuto = requireFromConfig.resolve("fake-indexeddb/auto");

export default defineConfig({
  root: configRoot,
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.integration.test.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: [resolve(configRoot, "src/test/setup.ts")],
  },
  resolve: {
    alias: {
      "@": resolve(configRoot, "src"),
      "fake-indexeddb/auto": fakeIndexedDbAuto,
    },
  },
});
