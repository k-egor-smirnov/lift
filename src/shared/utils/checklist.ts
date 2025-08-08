export interface ChecklistProgress {
  completed: number;
  total: number;
}

/**
 * Extract checklist progress from Tiptap HTML
 */
export function getChecklistProgressFromHTML(html: string): ChecklistProgress {
  if (!html) return { completed: 0, total: 0 };
  // DOMParser is available in browser/JSDOM environments
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const items = doc.querySelectorAll(
    'li[data-type="taskItem"] input[type="checkbox"]'
  );
  const total = items.length;
  let completed = 0;
  items.forEach((el) => {
    const input = el as HTMLInputElement;
    if (input.checked) completed++;
  });
  return { completed, total };
}
