export interface ChecklistProgress {
  completed: number;
  total: number;
}

export const getChecklistProgress = (text: string): ChecklistProgress => {
  const lines = text.split(/\r?\n/);
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    const match = line.match(/^\s*[-*]?\s*\[( |x|X)\]/);
    if (match) {
      total++;
      if (match[1].toLowerCase() === "x") {
        completed++;
      }
    }
  }
  return { completed, total };
};
