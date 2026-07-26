import { describe, expect, it } from "vitest";

import { taskReorderIntent } from "../TaskReorderIntent";

describe("taskReorderIntent", () => {
  it("moves a task to the start and returns its immediate right neighbour", () => {
    expect(taskReorderIntent(["a", "b", "c", "d"], "d", "a")).toEqual({
      taskId: "d",
      leftTaskId: null,
      rightTaskId: "a",
    });
  });

  it("moves a task to the middle and returns both immediate neighbours", () => {
    expect(taskReorderIntent(["a", "b", "c", "d"], "a", "c")).toEqual({
      taskId: "a",
      leftTaskId: "c",
      rightTaskId: "d",
    });
  });

  it("moves a task to the end and returns its immediate left neighbour", () => {
    expect(taskReorderIntent(["a", "b", "c", "d"], "b", "d")).toEqual({
      taskId: "b",
      leftTaskId: "d",
      rightTaskId: null,
    });
  });

  it.each([
    [["a", "b", "c"], "b", "b"],
    [["a", "b", "c"], "missing", "b"],
    [["a", "b", "c"], "a", "missing"],
    [["a", "b", "b"], "a", "b"],
  ] as const)(
    "returns null for a no-op, missing ID, or duplicate input",
    (orderedIds, activeId, overId) => {
      expect(taskReorderIntent(orderedIds, activeId, overId)).toBeNull();
    }
  );
});
