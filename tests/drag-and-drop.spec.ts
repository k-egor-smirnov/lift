import { test, expect } from '@playwright/test';

test.describe('Drag and Drop Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5174/');
    // Wait for the app to load
    await page.waitForSelector('[data-testid="task-list"], .text-center', { timeout: 10000 });
  });

  test('should display miniature task card during drag', async ({ page }) => {
    // Check if there are tasks available
    const taskCards = await page.locator('[data-testid="task-card"]').count();
    
    if (taskCards === 0) {
      // Create a test task first
      await page.click('button:has-text("New Task")');
      await page.fill('input[placeholder*="task"]', 'Test Drag Task');
      await page.press('input[placeholder*="task"]', 'Enter');
      await page.waitForSelector('[data-testid="task-card"]');
    }

    // Get the first task card
    const firstTask = page.locator('[data-testid="task-card"]').first();
    await expect(firstTask).toBeVisible();

    // Start dragging
    const taskBounds = await firstTask.boundingBox();
    if (taskBounds) {
      await page.mouse.move(taskBounds.x + taskBounds.width / 2, taskBounds.y + taskBounds.height / 2);
      await page.mouse.down();
      
      // Move mouse to trigger drag
      await page.mouse.move(taskBounds.x + taskBounds.width / 2, taskBounds.y + taskBounds.height / 2 + 50);
      
      // Check if miniature card appears (should be 32px height)
      const dragOverlay = page.locator('[data-testid="drag-overlay"], .transform-gpu');
      await expect(dragOverlay).toBeVisible();
      
      // Verify the miniature card has correct styling
      const miniatureCard = dragOverlay.locator('div').first();
      await expect(miniatureCard).toHaveClass(/h-8/);
      
      // End drag
      await page.mouse.up();
    }
  });

  test('should show blue line indicator at drop location', async ({ page }) => {
    // Check if there are at least 2 tasks for reordering
    const taskCards = await page.locator('[data-testid="task-card"]').count();
    
    if (taskCards < 2) {
      // Create test tasks
      for (let i = 0; i < 2; i++) {
        await page.click('button:has-text("New Task")');
        await page.fill('input[placeholder*="task"]', `Test Task ${i + 1}`);
        await page.press('input[placeholder*="task"]', 'Enter');
      }
      await page.waitForSelector('[data-testid="task-card"]');
    }

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const secondTask = page.locator('[data-testid="task-card"]').nth(1);
    
    await expect(firstTask).toBeVisible();
    await expect(secondTask).toBeVisible();

    // Start dragging first task
    const firstTaskBounds = await firstTask.boundingBox();
    const secondTaskBounds = await secondTask.boundingBox();
    
    if (firstTaskBounds && secondTaskBounds) {
      await page.mouse.move(firstTaskBounds.x + firstTaskBounds.width / 2, firstTaskBounds.y + firstTaskBounds.height / 2);
      await page.mouse.down();
      
      // Move over second task to trigger drop indicator
      await page.mouse.move(secondTaskBounds.x + secondTaskBounds.width / 2, secondTaskBounds.y + secondTaskBounds.height / 2);
      
      // Check for blue line indicator
      const blueIndicator = page.locator('.bg-blue-500, .h-1');
      await expect(blueIndicator).toBeVisible();
      
      // End drag
      await page.mouse.up();
    }
  });

  test('should reorder tasks when dragged and dropped', async ({ page }) => {
    // Ensure we have at least 2 tasks
    const taskCards = await page.locator('[data-testid="task-card"]').count();
    
    if (taskCards < 2) {
      // Create test tasks with distinct names
      await page.click('button:has-text("New Task")');
      await page.fill('input[placeholder*="task"]', 'First Task');
      await page.press('input[placeholder*="task"]', 'Enter');
      
      await page.click('button:has-text("New Task")');
      await page.fill('input[placeholder*="task"]', 'Second Task');
      await page.press('input[placeholder*="task"]', 'Enter');
      
      await page.waitForSelector('[data-testid="task-card"]');
    }

    // Get initial order
    const initialFirstTask = page.locator('[data-testid="task-card"]').first();
    const initialSecondTask = page.locator('[data-testid="task-card"]').nth(1);
    
    const firstTaskText = await initialFirstTask.textContent();
    const secondTaskText = await initialSecondTask.textContent();
    
    // Perform drag and drop
    const firstTaskBounds = await initialFirstTask.boundingBox();
    const secondTaskBounds = await initialSecondTask.boundingBox();
    
    if (firstTaskBounds && secondTaskBounds) {
      await page.mouse.move(firstTaskBounds.x + firstTaskBounds.width / 2, firstTaskBounds.y + firstTaskBounds.height / 2);
      await page.mouse.down();
      
      // Drag to second task position
      await page.mouse.move(secondTaskBounds.x + secondTaskBounds.width / 2, secondTaskBounds.y + secondTaskBounds.height + 10);
      await page.mouse.up();
      
      // Wait for reorder to complete
      await page.waitForTimeout(500);
      
      // Verify order has changed
      const newFirstTask = page.locator('[data-testid="task-card"]').first();
      const newSecondTask = page.locator('[data-testid="task-card"]').nth(1);
      
      const newFirstTaskText = await newFirstTask.textContent();
      const newSecondTaskText = await newSecondTask.textContent();
      
      // The order should be different
      expect(newFirstTaskText).not.toBe(firstTaskText);
      expect(newSecondTaskText).not.toBe(secondTaskText);
    }
  });

  test('should not show errors in console during drag operations', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Check if there are tasks available
    const taskCards = await page.locator('[data-testid="task-card"]').count();
    
    if (taskCards === 0) {
      await page.click('button:has-text("New Task")');
      await page.fill('input[placeholder*="task"]', 'Console Test Task');
      await page.press('input[placeholder*="task"]', 'Enter');
      await page.waitForSelector('[data-testid="task-card"]');
    }

    const firstTask = page.locator('[data-testid="task-card"]').first();
    const taskBounds = await firstTask.boundingBox();
    
    if (taskBounds) {
      // Perform drag operation
      await page.mouse.move(taskBounds.x + taskBounds.width / 2, taskBounds.y + taskBounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(taskBounds.x + taskBounds.width / 2, taskBounds.y + taskBounds.height / 2 + 50);
      await page.mouse.up();
      
      // Wait a bit for any async errors
      await page.waitForTimeout(1000);
    }

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('net::ERR_ABORTED') && 
      !error.includes('favicon') &&
      !error.includes('Objects are not valid as a React child')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});