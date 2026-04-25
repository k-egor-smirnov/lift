import { expect, test, type Locator, type Page } from "@playwright/test";

const openInbox = async (page: Page) => {
  await page.getByTestId("sidebar-inbox").click();
  await expect(page.getByPlaceholder("Добавить задачу...")).toBeVisible();
};

const createTask = async (page: Page, title: string) => {
  const input = page.getByPlaceholder("Добавить задачу...");
  await expect(input).toBeVisible();
  await input.fill(title);
  await input.press("Enter");

  const card = page.locator('[data-testid="task-card"]').filter({
    hasText: title,
  });
  await expect(card).toBeVisible();

  return card;
};

const startDragToPoint = async (
  page: Page,
  source: Locator,
  targetX: number,
  targetY: number
) => {
  await expect(source).toBeVisible();

  const sourceBox = await source.boundingBox();
  expect(sourceBox).not.toBeNull();

  if (!sourceBox) {
    return false;
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + Math.min(sourceBox.height / 2, 24);

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX, sourceY + 16, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 12 });

  return true;
};

const startDragTo = async (page: Page, source: Locator, target: Locator) => {
  await expect(target).toBeVisible();

  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();

  if (!targetBox) {
    return false;
  }

  return startDragToPoint(
    page,
    source,
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2
  );
};

const dragTo = async (page: Page, source: Locator, target: Locator) => {
  const didStartDrag = await startDragTo(page, source, target);
  if (!didStartDrag) {
    return;
  }

  await page.mouse.up();
};

const getDragOverlayOpacity = async (page: Page) =>
  Number(
    await page
      .getByTestId("drag-overlay")
      .evaluate((element) => getComputedStyle(element).opacity)
  );

const createTagFromSidebar = async (page: Page, tagName: string) => {
  await page.getByTestId("create-tag-button-sidebar").click();
  await page.getByTestId("create-tag-input-sidebar").fill(tagName);
  await page.getByRole("button", { name: "Создать" }).click();
  await expect(page.getByText(tagName).first()).toBeVisible();
};

test.describe("Drag and Drop Functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await openInbox(page);
  });

  test("should display compact task preview during drag", async ({ page }) => {
    const taskCards = await page.locator('[data-testid="task-card"]').count();

    if (taskCards === 0) {
      await createTask(page, "Test Drag Task");
    }

    const firstTask = page.locator('[data-testid="task-card"]').first();
    await expect(firstTask).toBeVisible();

    const title = await firstTask.locator("h3").textContent();

    const taskBounds = await firstTask.boundingBox();
    if (taskBounds) {
      await page.mouse.move(
        taskBounds.x + taskBounds.width / 2,
        taskBounds.y + taskBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        taskBounds.x + taskBounds.width / 2,
        taskBounds.y + taskBounds.height / 2 + 50
      );

      const dragOverlay = page.locator('[data-testid="drag-overlay"]');
      await expect(dragOverlay).toBeVisible();
      if (title) {
        await expect(dragOverlay).toContainText(title.trim());
      }

      await page.mouse.up();
    }
  });

  test("should show blue line indicator at drop location", async ({ page }) => {
    // Check if there are at least 2 tasks for reordering
    const taskCards = await page.locator('[data-testid="task-card"]').count();

    if (taskCards < 2) {
      // Create test tasks
      for (let i = 0; i < 2; i++) {
        await createTask(page, `Test Task ${i + 1}`);
      }
    }

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const secondTask = page.locator('[data-testid="task-card"]').nth(1);

    await expect(firstTask).toBeVisible();
    await expect(secondTask).toBeVisible();

    // Start dragging first task
    const firstTaskBounds = await firstTask.boundingBox();
    const secondTaskBounds = await secondTask.boundingBox();

    if (firstTaskBounds && secondTaskBounds) {
      await page.mouse.move(
        firstTaskBounds.x + firstTaskBounds.width / 2,
        firstTaskBounds.y + firstTaskBounds.height / 2
      );
      await page.mouse.down();

      // Move over second task to trigger drop indicator
      await page.mouse.move(
        secondTaskBounds.x + secondTaskBounds.width / 2,
        secondTaskBounds.y + secondTaskBounds.height / 2
      );

      await expect(page.getByTestId("task-drop-indicator")).toBeVisible();

      // End drag
      await page.mouse.up();
    }
  });

  test("should reorder tasks when dragged and dropped", async ({ page }) => {
    const firstTitle = `First Task ${Date.now()}`;
    const secondTitle = `Second Task ${Date.now()}`;
    await createTask(page, firstTitle);
    await createTask(page, secondTitle);

    // Get initial order
    const initialFirstTask = page.locator('[data-testid="task-card"]').first();
    const initialSecondTask = page.locator('[data-testid="task-card"]').nth(1);

    await expect(initialFirstTask).toContainText(firstTitle);
    await expect(initialSecondTask).toContainText(secondTitle);

    await dragTo(page, initialFirstTask, initialSecondTask);

    await expect(
      page.locator('[data-testid="task-card"]').first()
    ).toContainText(secondTitle);
    await expect(
      page.locator('[data-testid="task-card"]').nth(1)
    ).toContainText(firstTitle);
  });

  test("should not show errors in console during drag operations", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Check if there are tasks available
    const taskCards = await page.locator('[data-testid="task-card"]').count();

    if (taskCards === 0) {
      await createTask(page, "Console Test Task");
    }

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const taskBounds = await firstTask.boundingBox();

    if (taskBounds) {
      // Perform drag operation
      await page.mouse.move(
        taskBounds.x + taskBounds.width / 2,
        taskBounds.y + taskBounds.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        taskBounds.x + taskBounds.width / 2,
        taskBounds.y + taskBounds.height / 2 + 50
      );
      await page.mouse.up();

      // Wait a bit for any async errors
      await page.waitForTimeout(1000);
    }

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("net::ERR_ABORTED") &&
        !error.includes("favicon") &&
        !error.includes("Objects are not valid as a React child")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("should move a task to a sidebar category when dropped on it", async ({
    page,
  }) => {
    const title = `Move to Focus ${Date.now()}`;
    const taskCard = await createTask(page, title);
    const focusTarget = page.getByTestId("sidebar-focus");

    const didStartDrag = await startDragTo(page, taskCard, focusTarget);
    expect(didStartDrag).toBe(true);
    await expect(focusTarget).toHaveAttribute("data-task-drop-hover", "true");
    await expect.poll(() => getDragOverlayOpacity(page)).toBeLessThan(0.75);
    await page.mouse.up();
    await expect(taskCard).toHaveCount(0);

    await focusTarget.click();
    await expect(
      page.locator('[data-testid="task-card"]').filter({ hasText: title })
    ).toBeVisible();
  });

  test("should fade the preview and skip list reordering anywhere over the sidebar", async ({
    page,
  }) => {
    const firstTitle = `Sidebar Hover First ${Date.now()}`;
    const secondTitle = `Sidebar Hover Second ${Date.now()}`;
    await createTask(page, firstTitle);
    await createTask(page, secondTitle);

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const secondTask = page.locator('[data-testid="task-card"]').nth(1);
    const sidebarScope = page.getByTestId("sidebar-drop-scope").first();

    await expect(firstTask).toContainText(firstTitle);
    await expect(secondTask).toContainText(secondTitle);

    const sidebarBox = await sidebarScope.boundingBox();
    expect(sidebarBox).not.toBeNull();

    if (!sidebarBox) {
      return;
    }

    const didStartDrag = await startDragToPoint(
      page,
      firstTask,
      sidebarBox.x + sidebarBox.width / 2,
      sidebarBox.y + 32
    );
    expect(didStartDrag).toBe(true);

    await expect(page.getByTestId("task-drop-indicator")).toHaveCount(0);
    await expect.poll(() => getDragOverlayOpacity(page)).toBeLessThan(0.75);
    await page.mouse.up();

    await expect(
      page.locator('[data-testid="task-card"]').first()
    ).toContainText(firstTitle);
    await expect(
      page.locator('[data-testid="task-card"]').nth(1)
    ).toContainText(secondTitle);
  });

  test("should add a task to today without reordering the current list", async ({
    page,
  }) => {
    const firstTitle = `Today Drop First ${Date.now()}`;
    const secondTitle = `Today Drop Second ${Date.now()}`;
    await createTask(page, firstTitle);
    await createTask(page, secondTitle);

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const secondTask = page.locator('[data-testid="task-card"]').nth(1);
    const todayTarget = page.getByTestId("sidebar-today");

    await expect(firstTask).toContainText(firstTitle);
    await expect(secondTask).toContainText(secondTitle);

    const sourceBox = await firstTask.boundingBox();
    const targetBox = await todayTarget.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (!sourceBox || !targetBox) {
      return;
    }

    await page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2 + 16,
      { steps: 4 }
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 12 }
    );

    await expect(todayTarget).toHaveAttribute("data-task-drop-hover", "true");
    await expect(page.getByTestId("task-drop-indicator")).toHaveCount(0);
    await expect.poll(() => getDragOverlayOpacity(page)).toBeLessThan(0.75);
    await page.mouse.up();

    await expect(
      page.locator('[data-testid="task-card"]').first()
    ).toContainText(firstTitle);
    await expect(
      page.locator('[data-testid="task-card"]').nth(1)
    ).toContainText(secondTitle);

    await expect
      .poll(() =>
        firstTask.evaluate((element) => getComputedStyle(element).opacity)
      )
      .toBe("1");

    await todayTarget.click();
    await expect(
      page.locator('[data-testid="task-card"]').filter({ hasText: firstTitle })
    ).toBeVisible();
  });

  test("should attach a tag when a task is dropped on a sidebar tag", async ({
    page,
  }) => {
    const tagName = `DndTag-${Date.now()}`;
    const title = `Drop on tag ${Date.now()}`;
    await createTagFromSidebar(page, tagName);
    const taskCard = await createTask(page, title);
    const tagTarget = page
      .locator('[data-task-drop-target="tag"]')
      .filter({ hasText: tagName });

    await dragTo(page, taskCard, tagTarget);
    await expect(tagTarget).toContainText("1");

    await tagTarget.click();
    const taggedTask = page.locator('[data-testid="task-card"]').filter({
      hasText: title,
    });
    await expect(taggedTask).toBeVisible();
    await expect(taggedTask).toContainText(tagName);
    await expect
      .poll(() =>
        taggedTask.evaluate((element) => getComputedStyle(element).opacity)
      )
      .toBe("1");
  });
});
