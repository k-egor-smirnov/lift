import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isDeleted } from "../../../features/workspaces/domain/ConflictPolicy";
import { Result, ResultUtils } from "../../domain/Result";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface DeleteTaskRequest {
  readonly taskId: string;
}

export interface DeleteTaskResponse {
  readonly taskId: string;
}

export class TaskDeletionError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskDeletionError";
  }
}

export class DeleteTaskUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: DeleteTaskRequest
  ): Promise<Result<DeleteTaskResponse, TaskDeletionError>> {
    const loaded = await this.findTaskById(request.taskId, {
      includeDeleted: true,
    });
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskDeletionError(loaded.error.message, loaded.error.code)
      );
    }
    if (isDeleted(loaded.data.task.deletionDots)) {
      return ResultUtils.ok({ taskId: loaded.data.taskId });
    }

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskDeletionError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "DeleteTask",
      ...metadata.data,
      taskId: loaded.data.taskId,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskDeletionError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok({ taskId: loaded.data.taskId });
  }
}
