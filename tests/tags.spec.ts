import { expect, test, type Page } from "@playwright/test";

const TAG_NAME = "E2E Tag";

const openSidebarTagPopover = async (page: Page) => {
  const sidebarTagButton = page.locator(
    '[data-testid="create-tag-button-sidebar"]:visible'
  );
  if ((await sidebarTagButton.count()) === 0) {
    await page.getByRole("button", { name: /open menu|меню/i }).click();
  }

  await expect(sidebarTagButton.first()).toBeVisible();
  await sidebarTagButton.first().click();
  await expect(page.getByTestId("create-tag-input-sidebar")).toBeVisible();
};

const createTagFromSidebar = async (page: Page, tagName: string) => {
  await openSidebarTagPopover(page);
  await page.getByTestId("create-tag-input-sidebar").fill(tagName);
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByText(tagName).first()).toBeVisible();
};

test.describe("Tags feature", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("focuses create-tag input when opened from sidebar popover", async ({
    page,
  }) => {
    await openSidebarTagPopover(page);
    await expect(page.getByTestId("create-tag-input-sidebar")).toBeFocused();
  });

  test("creates task in tag view with selected tag attached", async ({
    page,
  }) => {
    const uniqueTag = `${TAG_NAME}-${Date.now()}`;
    await createTagFromSidebar(page, uniqueTag);

    await page.getByRole("button", { name: uniqueTag }).click();
    await expect(page.getByRole("heading", { name: uniqueTag })).toBeVisible();

    const inlineInput = page.getByPlaceholder("Добавить задачу...");
    await inlineInput.fill("Task in tag view");
    await inlineInput.press("Enter");

    const createdTask = page.locator('[data-testid="task-card"]').filter({
      hasText: "Task in tag view",
    });

    await expect(createdTask).toBeVisible();
    await expect(createdTask).toContainText(uniqueTag);
  });

  test("shows category badges for tasks on tag screen", async ({ page }) => {
    const uniqueTag = `CategoryTag-${Date.now()}`;
    await createTagFromSidebar(page, uniqueTag);

    // Create INBOX task directly in tag view (should inherit the active tag)
    await page.getByRole("button", { name: uniqueTag }).click();
    const tagInlineInput = page.getByPlaceholder("Добавить задачу...");
    await tagInlineInput.fill("Inbox tagged task");
    await tagInlineInput.press("Enter");

    // Create FOCUS task in Focus category and tag it via edit modal
    await page.getByTestId("sidebar-focus").click();
    const focusInput = page.getByPlaceholder("Добавить задачу...");
    await focusInput.fill("Focus tagged task");
    await focusInput.press("Enter");

    const focusTaskCard = page.locator('[data-testid="task-card"]').filter({
      hasText: "Focus tagged task",
    });
    await focusTaskCard.click();

    await page.getByRole("button", { name: uniqueTag }).click();
    await page
      .getByRole("button", { name: /Сохранить|Save/i })
      .last()
      .click();

    await page.getByRole("button", { name: uniqueTag }).click();

    const tagTasks = page.locator('[data-testid="task-card"]');
    await expect(
      tagTasks.filter({ hasText: "Inbox tagged task" })
    ).toContainText("Входящие");
    await expect(
      tagTasks.filter({ hasText: "Focus tagged task" })
    ).toContainText("Фокус");
  });
});
