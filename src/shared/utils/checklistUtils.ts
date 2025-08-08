/**
 * Utility functions for working with checklists in HTML notes
 */

export interface ChecklistProgress {
  completed: number;
  total: number;
}

/**
 * Parses HTML content and extracts checklist progress
 * @param htmlContent - HTML content from Tiptap editor
 * @returns Object with completed and total checklist items count
 */
export function parseChecklistProgress(
  htmlContent?: string
): ChecklistProgress {
  if (!htmlContent) {
    return { completed: 0, total: 0 };
  }

  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlContent;

  // Find all task items (checkboxes)
  const taskItems = tempDiv.querySelectorAll('li[data-type="taskItem"]');

  let completed = 0;
  let total = 0;

  taskItems.forEach((item) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox) {
      total++;
      if (checkbox.hasAttribute("checked")) {
        completed++;
      }
    }
  });

  return { completed, total };
}

/**
 * Checks if HTML content contains any checklist items
 * @param htmlContent - HTML content from Tiptap editor
 * @returns true if content has checklist items
 */
export function hasChecklist(htmlContent?: string): boolean {
  if (!htmlContent) {
    return false;
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlContent;

  const taskItems = tempDiv.querySelectorAll('li[data-type="taskItem"]');
  return taskItems.length > 0;
}

/**
 * Formats checklist progress as "X / Y" string
 * @param progress - Checklist progress object
 * @returns Formatted string like "2 / 5"
 */
export function formatChecklistProgress(progress: ChecklistProgress): string {
  return `${progress.completed} / ${progress.total}`;
}
