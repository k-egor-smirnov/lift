import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.integration.test.{ts,tsx}"],
    passWithNoTests: true,
    setupFiles: ["fake-indexeddb/auto", "./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
