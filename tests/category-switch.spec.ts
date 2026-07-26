import { expect, test } from "@playwright/test";
import { startOfflineTestApp } from "./helpers/secure-test-app";

test.describe("Category screen switching", () => {
  test("shows correct tasks when switching between Inbox and Focus", async ({
    page,
  }) => {
    await startOfflineTestApp(page);

    await page.getByTestId("sidebar-inbox").click();
    const inboxInput = page.getByPlaceholder("Добавить задачу...");
    await inboxInput.fill("Inbox screen task");
    await inboxInput.press("Enter");

    await page.getByTestId("sidebar-focus").click();
    const focusInput = page.getByPlaceholder("Добавить задачу...");
    await focusInput.fill("Focus screen task");
    await focusInput.press("Enter");

    await expect(page.getByText("Focus screen task")).toBeVisible();
    await expect(page.getByText("Inbox screen task")).not.toBeVisible();

    await page.getByTestId("sidebar-inbox").click();
    await expect(page.getByText("Inbox screen task")).toBeVisible();
    await expect(page.getByText("Focus screen task")).not.toBeVisible();
  });
});
