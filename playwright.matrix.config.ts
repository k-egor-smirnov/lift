import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/matrix",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 60_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5190",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
