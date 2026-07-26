import { expect, type Page } from "@playwright/test";

export const startOfflineTestApp = async (page: Page): Promise<void> => {
  await page.goto("/");
  const setup = page.getByTestId("matrix-setup-wizard");
  const app = page.getByTestId("sidebar-today");
  await expect
    .poll(async () => (await setup.isVisible()) || (await app.isVisible()), {
      timeout: 20_000,
    })
    .toBe(true);
  if (await setup.isVisible()) {
    await page.getByRole("button", { name: "Начать офлайн" }).click();
  }
  await expect(app).toBeVisible();
};

export const openInbox = async (page: Page): Promise<void> => {
  await page.getByTestId("sidebar-inbox").click();
  await expect(page.getByPlaceholder("Добавить задачу...")).toBeVisible();
};

export const createInlineTask = async (
  page: Page,
  title: string
): Promise<void> => {
  const input = page.getByPlaceholder("Добавить задачу...");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
};
