import { expect, test, type Page } from "@playwright/test";

import {
  createInlineTask,
  openInbox,
  startOfflineTestApp,
} from "./helpers/secure-test-app";

const taskCard = (page: Page, title: string) =>
  page.locator('[data-testid="task-card"]').filter({ hasText: title });

test.describe("Lift secure local-first UI", () => {
  test.beforeEach(async ({ page }) => {
    await startOfflineTestApp(page);
  });

  test("renders the preserved application shell", async ({ page }) => {
    await expect(page).toHaveTitle(/Lift/);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Lift", level: 2 })
    ).toBeVisible();
    await expect(page.getByTestId("sidebar-today")).toBeVisible();
    await expect(page.getByTestId("sidebar-inbox")).toBeVisible();
    await expect(page.getByTestId("sidebar-focus")).toBeVisible();
    await expect(page.getByTestId("sidebar-settings")).toBeVisible();
    await expect(page.getByTestId("connection-state")).toContainText("Оффлайн");
  });

  test("creates a task and keeps it after reload", async ({ page }) => {
    await openInbox(page);
    await createInlineTask(page, "Persistent task");

    await page.reload();
    await openInbox(page);
    await expect(
      page.getByText("Persistent task", { exact: true })
    ).toBeVisible();
  });

  test("adds an inbox task to Today and completes it", async ({ page }) => {
    await openInbox(page);
    await createInlineTask(page, "Daily task");
    const card = taskCard(page, "Daily task");
    await card.getByRole("button").first().click();

    await page.getByTestId("sidebar-today").click();
    const todayCard = taskCard(page, "Daily task");
    await expect(todayCard).toBeVisible();
    await todayCard.getByRole("toolbar").getByRole("button").first().click();

    await expect(todayCard.locator("h3")).toHaveClass(/line-through/);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
  });

  test("edits title, category and note through the task dialog", async ({
    page,
  }) => {
    await openInbox(page);
    await createInlineTask(page, "Edit me");
    const card = taskCard(page, "Edit me");
    await card.getByRole("toolbar").getByRole("button").last().click();
    await page.getByRole("menuitem").first().click();

    const dialog = page.getByRole("dialog", { name: "Редактирование задачи" });
    await dialog.getByLabel("Название").fill("Edited task");
    await dialog.getByLabel("Категория").selectOption("FOCUS");
    await dialog.getByLabel("Заметка").fill("Encrypted collaborative note");
    await dialog.getByRole("button", { name: "Сохранить" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Edited task", { exact: true })).toHaveCount(0);
    await page.getByTestId("sidebar-focus").click();
    await expect(page.getByText("Edited task", { exact: true })).toBeVisible();
  });

  test("shows security, sync and deterministic-day settings", async ({
    page,
  }) => {
    await page.getByTestId("sidebar-settings").click();
    await expect(
      page.getByRole("heading", { name: "Сквозное шифрование" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Синхронизация" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Рабочий день" })
    ).toBeVisible();
    await expect(page.getByText(/мастер-клиент не нужен/)).toBeVisible();
  });
});
