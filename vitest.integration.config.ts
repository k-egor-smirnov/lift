/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
