import { describe, expect, it } from "vitest";

import type { WorkspaceTaskReadModel } from "../../../../workspaces/application/ports/WorkspaceRepository";
import { Task } from "../../../../../shared/domain/entities/Task";
import { NonEmptyTitle } from "../../../../../shared/domain/value-objects/NonEmptyTitle";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";
import { TaskCategory, TaskStatus } from "../../../../../shared/domain/types";
import { legacyTaskToListItem, workspaceTaskToListItem } from "../TaskListItem";

const workspaceTask = (
  category: WorkspaceTaskReadModel["category"] = "FOCUS"
): WorkspaceTaskReadModel => ({
  workspaceId: "workspace-1",
  taskId: "01J00000000000000000000001",
  title: "Review protocol",
  note: "Check causal heads",
  tags: ["security"],
  category,
  completion: "completed",
  positionKey: "a0",
  deferredUntil: "2026-07-24",
  inboxEnteredOn: null,
});

describe("TaskListItem adapters", () => {
  it("maps every row field directly from a workspace projection", () => {
    expect(workspaceTaskToListItem(workspaceTask())).toEqual({
      taskId: "01J00000000000000000000001",
      title: "Review protocol",
      note: "Check causal heads",
      category: TaskCategory.FOCUS,
      completion: "completed",
      deferredUntil: "2026-07-24",
    });
  });

  it.each([
    ["INBOX", TaskCategory.INBOX],
    ["SIMPLE", TaskCategory.SIMPLE],
    ["FOCUS", TaskCategory.FOCUS],
    ["DEFERRED", TaskCategory.DEFERRED],
  ] as const)(
    "maps the %s workspace category exhaustively",
    (value, expected) => {
      expect(workspaceTaskToListItem(workspaceTask(value)).category).toBe(
        expected
      );
    }
  );

  it("maps a real legacy deferred calendar value to a date-only string", () => {
    const task = new Task(
      TaskId.fromString("01J00000000000000000000002"),
      NonEmptyTitle.fromString("Wait for response"),
      TaskCategory.DEFERRED,
      TaskStatus.ACTIVE,
      42,
      new Date(2026, 6, 20, 8),
      new Date(2026, 6, 21, 9),
      undefined,
      undefined,
      new Date(2026, 6, 25, 23, 30),
      TaskCategory.INBOX,
      "Follow up"
    );

    expect(legacyTaskToListItem(task)).toEqual({
      taskId: "01J00000000000000000000002",
      title: "Wait for response",
      note: "Follow up",
      category: TaskCategory.DEFERRED,
      completion: "active",
      deferredUntil: "2026-07-25",
    });
  });

  it("serializes no time, order, selection, or inferred state", () => {
    const serialized = JSON.stringify(workspaceTaskToListItem(workspaceTask()));

    for (const forbidden of [
      "createdAt",
      "updatedAt",
      "selectedAt",
      "order",
      "completedInSelection",
      "isOverdue",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
