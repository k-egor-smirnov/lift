import type { WorkspaceTaskReadModel } from "../../../workspaces/application/ports/WorkspaceRepository";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

export interface TaskListItem {
  readonly taskId: string;
  readonly title: string;
  readonly note: string;
  readonly category: TaskCategory;
  readonly completion: "active" | "completed";
  readonly deferredUntil: string | null;
}

const impossibleCategory = (category: never): never => {
  throw new Error(`Unsupported workspace task category: ${String(category)}`);
};

const workspaceCategoryToTaskCategory = (
  category: WorkspaceTaskReadModel["category"]
): TaskCategory => {
  switch (category) {
    case "INBOX":
      return TaskCategory.INBOX;
    case "SIMPLE":
      return TaskCategory.SIMPLE;
    case "FOCUS":
      return TaskCategory.FOCUS;
    case "DEFERRED":
      return TaskCategory.DEFERRED;
    default:
      return impossibleCategory(category);
  }
};

export const workspaceTaskToListItem = (
  task: WorkspaceTaskReadModel
): TaskListItem => ({
  taskId: task.taskId,
  title: task.title,
  note: task.note,
  category: workspaceCategoryToTaskCategory(task.category),
  completion: task.completion,
  deferredUntil: task.deferredUntil,
});

export const legacyTaskToListItem = (task: Task): TaskListItem => ({
  taskId: task.id.value,
  title: task.title.value,
  note: task.note ?? "",
  category: task.category,
  completion: task.status === TaskStatus.COMPLETED ? "completed" : "active",
  deferredUntil: task.deferredUntil
    ? DateOnly.fromDate(task.deferredUntil).value
    : null,
});
