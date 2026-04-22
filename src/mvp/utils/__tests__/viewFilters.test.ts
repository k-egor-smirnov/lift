import { describe, expect, it } from "vitest";
import { TaskCategory } from "@/shared/domain/types";
import { createMockTask } from "@/test/utils/mockFactories";
import { getVisibleTasks } from "../viewFilters";

describe("getVisibleTasks", () => {
  const inboxTask = createMockTask({ category: TaskCategory.INBOX });
  const focusTask = createMockTask({ category: TaskCategory.FOCUS });
  const simpleTask = createMockTask({ category: TaskCategory.SIMPLE });

  it("returns only tasks from selected category when switching views", () => {
    const tasks = [inboxTask, focusTask, simpleTask];

    const inboxVisible = getVisibleTasks({
      activeView: TaskCategory.INBOX,
      tasks,
      taskTags: {},
    });

    const focusVisible = getVisibleTasks({
      activeView: TaskCategory.FOCUS,
      tasks,
      taskTags: {},
    });

    expect(inboxVisible.map((task) => task.id.value)).toEqual([
      inboxTask.id.value,
    ]);
    expect(focusVisible.map((task) => task.id.value)).toEqual([
      focusTask.id.value,
    ]);
  });

  it("applies tag filter on top of active tasks", () => {
    const tagId = "tag-1";
    const tasks = [inboxTask, focusTask, simpleTask];

    const result = getVisibleTasks({
      activeView: `tag:${tagId}`,
      tasks,
      taskTags: {
        [inboxTask.id.value]: [tagId],
        [focusTask.id.value]: [],
      },
    });

    expect(result.map((task) => task.id.value)).toEqual([inboxTask.id.value]);
  });
});
