import { describe, it, expect } from "vitest";
import { getChecklistProgressFromHTML } from "../checklist";

describe("getChecklistProgressFromHTML", () => {
  it("counts task items", () => {
    const html = `
      <ul data-type="taskList">
        <li data-type="taskItem"><label><input type="checkbox" /><span></span></label>Task 1</li>
        <li data-type="taskItem"><label><input type="checkbox" checked /><span></span></label>Task 2</li>
      </ul>
    `;
    const { completed, total } = getChecklistProgressFromHTML(html);
    expect(total).toBe(2);
    expect(completed).toBe(1);
  });
});
