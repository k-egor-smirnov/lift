import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import {
  comparePositions,
  isDeleted,
} from "../../../features/workspaces/domain/ConflictPolicy";
import { Result, ResultUtils } from "../../domain/Result";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface ReorderTasksRequest {
  readonly taskId: string;
  readonly leftTaskId?: string | null;
  readonly rightTaskId?: string | null;
}

export class TaskReorderError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskReorderError";
  }
}

export class ReorderTasksUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: ReorderTasksRequest
  ): Promise<Result<void, TaskReorderError>> {
    const parsedTaskId = this.parseTaskId(request.taskId);
    if (ResultUtils.isFailure(parsedTaskId)) {
      return ResultUtils.error(
        new TaskReorderError(
          parsedTaskId.error.message,
          parsedTaskId.error.code
        )
      );
    }
    const left = this.parseNeighbor(request.leftTaskId);
    if (ResultUtils.isFailure(left)) return left;
    const right = this.parseNeighbor(request.rightTaskId);
    if (ResultUtils.isFailure(right)) return right;
    if (left.data === parsedTaskId.data || right.data === parsedTaskId.data) {
      return ResultUtils.error(
        new TaskReorderError(
          "A task cannot be its own position neighbor",
          "INVALID_POSITION"
        )
      );
    }

    const loaded = await this.findTaskById(parsedTaskId.data);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskReorderError(loaded.error.message, loaded.error.code)
      );
    }
    const leftTask = left.data
      ? loaded.data.workspace.state.tasks[left.data]
      : undefined;
    const rightTask = right.data
      ? loaded.data.workspace.state.tasks[right.data]
      : undefined;
    if (
      (left.data && (!leftTask || isDeleted(leftTask.deletionDots))) ||
      (right.data && (!rightTask || isDeleted(rightTask.deletionDots)))
    ) {
      return ResultUtils.error(
        new TaskReorderError("Task not found", "TASK_NOT_FOUND")
      );
    }
    if (
      leftTask !== undefined &&
      rightTask !== undefined &&
      comparePositions(
        { ...leftTask.position, taskId: leftTask.id },
        { ...rightTask.position, taskId: rightTask.id }
      ) >= 0
    ) {
      return ResultUtils.error(
        new TaskReorderError("Invalid task position bounds", "INVALID_POSITION")
      );
    }

    const remaining = Object.values(loaded.data.workspace.state.tasks)
      .filter(
        (task) =>
          task.id !== loaded.data.taskId && !isDeleted(task.deletionDots)
      )
      .sort((first, second) =>
        comparePositions(
          { ...first.position, taskId: first.id },
          { ...second.position, taskId: second.id }
        )
      );
    const insertionIndex =
      left.data === null
        ? 0
        : remaining.findIndex((task) => task.id === left.data) + 1;
    if (
      insertionIndex < 0 ||
      (right.data !== null && remaining[insertionIndex]?.id !== right.data) ||
      (right.data === null && insertionIndex !== remaining.length)
    ) {
      return ResultUtils.error(
        new TaskReorderError(
          "Invalid task position bounds: left and right must be actual canonical neighbours",
          "INVALID_POSITION"
        )
      );
    }

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskReorderError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "MoveTask",
      ...metadata.data,
      taskId: loaded.data.taskId,
      leftTaskId: left.data,
      rightTaskId: right.data,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskReorderError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok(undefined);
  }

  private parseNeighbor(
    value: string | null | undefined
  ): Result<string | null, TaskReorderError> {
    if (value === null || value === undefined) return ResultUtils.ok(null);
    const parsed = this.parseTaskId(value);
    return ResultUtils.isFailure(parsed)
      ? ResultUtils.error(
          new TaskReorderError(parsed.error.message, parsed.error.code)
        )
      : ResultUtils.ok(parsed.data);
  }
}
