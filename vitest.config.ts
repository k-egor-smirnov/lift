import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [
      "tests/**",
      "**/*.integration.test.ts",
      "**/*.integration.test.tsx",
      "**/node_modules/**",
    ],
    typecheck: {
      include: ["**/*.{test,spec}.{ts,tsx}"],
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportOnFailure: true,
      all: true,
      exclude: [
        "tests/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "src/test/**",
        "src/main.tsx",
        "vite.config.ts",
        "vitest.config.ts",
        "playwright.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "**/node_modules/**",
        "dist/**",
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
