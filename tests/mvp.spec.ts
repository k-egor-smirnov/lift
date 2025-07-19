import { test, expect } from '@playwright/test';

test.describe('Daily Todo PWA MVP', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main page with correct title', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Daily Todo PWA/);
    
    // Check main heading
    await expect(page.getByRole('heading', { name: /Daily Todo PWA - MVP/ })).toBeVisible();
    
    // Check navigation tabs
    await expect(page.getByTestId('all-tasks-tab')).toBeVisible();
    await expect(page.getByTestId('today-tab')).toBeVisible();
    
    // Check new task button
    await expect(page.getByTestId('new-task-button')).toBeVisible();
  });

  test('should show stats cards', async ({ page }) => {
    // Check all stats cards are visible
    await expect(page.getByText('Total Tasks')).toBeVisible();
    await expect(page.getByText('Inbox')).toBeVisible();
    await expect(page.getByText('Focus')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
    
    // Initially should show 0 tasks
    await expect(page.getByTestId('total-tasks-count')).toHaveText('0');
  });

  test('should create a new task', async ({ page }) => {
    // Click new task button
    await page.getByTestId('new-task-button').click();
    
    // Modal should be visible
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create New Task')).toBeVisible();
    
    // Fill in task details
    await page.getByPlaceholder('Enter task title').fill('Test Task 1');
    await page.getByRole('combobox').selectOption('SIMPLE');
    
    // Submit the form
    await page.getByRole('button', { name: 'Create Task' }).click();
    
    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Task should appear in the list
    await expect(page.getByText('Test Task 1')).toBeVisible();
    
    // Stats should update
    await expect(page.getByTestId('total-tasks-count')).toHaveText('1');
  });

  test('should switch between tabs', async ({ page }) => {
    // Initially on All Tasks tab
    await expect(page.getByTestId('all-tasks-tab')).toHaveClass(/border-blue-500/);
    
    // Switch to Today tab
    await page.getByTestId('today-tab').click();
    await expect(page.getByTestId('today-tab')).toHaveClass(/border-blue-500/);
    
    // Should show Today view
    await expect(page.getByText('Focus on your selected tasks for the day')).toBeVisible();
    await expect(page.getByText('No Tasks Selected')).toBeVisible();
    
    // Switch back to All Tasks
    await page.getByTestId('all-tasks-tab').click();
    await expect(page.getByTestId('all-tasks-tab')).toHaveClass(/border-blue-500/);
  });

  test('should add task to today and show in today view', async ({ page }) => {
    // First create a task
    await page.getByTestId('new-task-button').click();
    await page.getByPlaceholder('Enter task title').fill('Daily Task');
    await page.getByRole('combobox').selectOption('FOCUS');
    await page.getByRole('button', { name: 'Create Task' }).click();
    
    // Task should be visible
    await expect(page.getByText('Daily Task')).toBeVisible();
    
    // Add to today using sun icon
    await page.getByTitle('Add to Today').click();
    
    // Switch to Today tab
    await page.getByTestId('today-tab').click();
    
    // Task should appear in Today view
    await expect(page.getByText('Daily Task')).toBeVisible();
    await expect(page.getByText('Active Tasks')).toBeVisible();
    
    // Stats should show 1 active task
    await expect(page.getByText('1').first()).toBeVisible(); // Total count
  });

  test('should complete a task', async ({ page }) => {
    // Create a task first
    await page.getByTestId('new-task-button').click();
    await page.getByPlaceholder('Enter task title').fill('Task to Complete');
    await page.getByRole('combobox').selectOption('SIMPLE');
    await page.getByRole('button', { name: 'Create Task' }).click();
    
    // Complete the task
    await page.getByRole('button', { name: '✅ Complete' }).click();
    
    // Task should show as completed (with strikethrough)
    await expect(page.locator('h3').filter({ hasText: 'Task to Complete' })).toHaveClass(/line-through/);
    
    // Complete button should change to Revert
    await expect(page.getByRole('button', { name: '↩️ Revert' })).toBeVisible();
  });

  test('should filter tasks by category', async ({ page }) => {
    // Create tasks of different categories
    const tasks = [
      { title: 'Simple Task', category: 'SIMPLE' },
      { title: 'Focus Task', category: 'FOCUS' },
      { title: 'Inbox Task', category: 'INBOX' }
    ];
    
    for (const task of tasks) {
      await page.getByTestId('new-task-button').click();
      await page.getByPlaceholder('Enter task title').fill(task.title);
      await page.getByRole('combobox').selectOption(task.category);
      await page.getByRole('button', { name: 'Create Task' }).click();
    }
    
    // All tasks should be visible initially
    await expect(page.getByText('Simple Task')).toBeVisible();
    await expect(page.getByText('Focus Task')).toBeVisible();
    await expect(page.getByText('Inbox Task')).toBeVisible();
    
    // Filter by SIMPLE
    await page.getByTestId('filter-simple').click();
    await expect(page.getByText('Simple Task')).toBeVisible();
    await expect(page.getByText('Focus Task')).not.toBeVisible();
    await expect(page.getByText('Inbox Task')).not.toBeVisible();
    
    // Filter by FOCUS
    await page.getByTestId('filter-focus').click();
    await expect(page.getByText('Simple Task')).not.toBeVisible();
    await expect(page.getByText('Focus Task')).toBeVisible();
    await expect(page.getByText('Inbox Task')).not.toBeVisible();
    
    // Back to all tasks
    await page.getByTestId('filter-all').click();
    await expect(page.getByText('Simple Task')).toBeVisible();
    await expect(page.getByText('Focus Task')).toBeVisible();
    await expect(page.getByText('Inbox Task')).toBeVisible();
  });

  test('should show today view with proper date formatting', async ({ page }) => {
    // Switch to Today tab
    await page.getByTestId('today-tab').click();
    
    // Should show "Today" as the date
    await expect(page.getByText('Today')).toBeVisible();
    
    // Should show sun emoji
    await expect(page.locator('span').filter({ hasText: '☀️' }).first()).toBeVisible();
    
    // Should show refresh button
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('should handle task removal from today', async ({ page }) => {
    // Create and add task to today
    await page.getByTestId('new-task-button').click();
    await page.getByPlaceholder('Enter task title').fill('Remove Me Task');
    await page.getByRole('combobox').selectOption('SIMPLE');
    await page.getByRole('button', { name: 'Create Task' }).click();
    
    // Add to today
    await page.getByTitle('Add to Today').click();
    
    // Switch to Today tab
    await page.getByTestId('today-tab').click();
    
    // Task should be visible
    await expect(page.getByText('Remove Me Task')).toBeVisible();
    
    // Remove from today using sunrise icon
    await page.getByTitle('Remove from Today').click();
    
    // Task should be removed from today view
    await expect(page.getByText('Remove Me Task')).not.toBeVisible();
    await expect(page.getByText('No Tasks Selected')).toBeVisible();
  });

  test('should show progress bar when tasks are completed', async ({ page }) => {
    // Create a task and add to today
    await page.getByTestId('new-task-button').click();
    await page.getByPlaceholder('Enter task title').fill('Progress Task');
    await page.getByRole('combobox').selectOption('SIMPLE');
    await page.getByRole('button', { name: 'Create Task' }).click();
    
    await page.getByTitle('Add to Today').click();
    
    // Switch to Today tab
    await page.getByTestId('today-tab').click();
    
    // Should show 0% progress initially
    await expect(page.getByText('0% complete')).toBeVisible();
    
    // Complete the task
    await page.getByRole('button', { name: '✅ Complete' }).click();
    
    // Should show 100% progress
    await expect(page.getByText('100% complete')).toBeVisible();
    
    // Progress bar should be full
    await expect(page.locator('.bg-green-600')).toHaveAttribute('style', 'width: 100%;');
  });
});