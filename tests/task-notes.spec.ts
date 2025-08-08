import { test, expect } from "@playwright/test";

test.describe("Task Notes Error Verification", () => {
  test("should not have scheduleSync or publishEvents errors in console", async ({
    page,
  }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to the app
    await page.goto("/");

    // Wait for the page to load completely
    await page.waitForLoadState("networkidle");

    // Wait a bit more for any async operations
    await page.waitForTimeout(3000);

    // Check that no console errors related to scheduleSync or publishEvents occurred
    const relevantErrors = consoleErrors.filter(
      (error) =>
        error.includes("scheduleSync") ||
        error.includes("publishEvents") ||
        error.includes("TypeError: this.publishEvents is not a function") ||
        error.includes(
          "TypeError: this.debouncedSyncService.scheduleSync is not a function"
        )
    );

    // Log all errors for debugging
    if (consoleErrors.length > 0) {
      console.log("All console errors:", consoleErrors);
    }

    if (relevantErrors.length > 0) {
      console.log("Relevant errors found:", relevantErrors);
    }

    expect(relevantErrors).toHaveLength(0);
    console.log("✅ No scheduleSync or publishEvents errors found in console");
  });
});
