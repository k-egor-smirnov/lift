import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskCategory } from "../../domain/types";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface UndeferTaskRequest {
  readonly taskId: string;
}

export interface UndeferTaskResponse {
  readonly taskId: string;
  readonly restoredCategory: TaskCategory;
}

export class TaskUndeferralError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskUndeferralError";
  }
}

export class UndeferTaskUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: UndeferTaskRequest
  ): Promise<Result<UndeferTaskResponse, TaskUndeferralError>> {
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskUndeferralError(loaded.error.message, loaded.error.code)
      );
    }
    if (loaded.data.task.deferredUntil === null) {
      return ResultUtils.error(
        new TaskUndeferralError("Task is not deferred", "TASK_NOT_DEFERRED")
      );
    }
    const restoredCategory =
      loaded.data.task.originalCategory ?? loaded.data.task.category;

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskUndeferralError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "DeferTask",
      ...metadata.data,
      taskId: loaded.data.taskId,
      deferredUntil: null,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskUndeferralError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok({
          taskId: loaded.data.taskId,
          restoredCategory: restoredCategory as TaskCategory,
        });
  }
}
