import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";
import { Result, ResultUtils } from "../../domain/Result";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface DeferTaskRequest {
  readonly taskId: string;
  readonly deferredUntil: string;
}

export interface DeferTaskResponse {
  readonly taskId: string;
  readonly deferredUntil: string;
}

export class TaskDeferralError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskDeferralError";
  }
}

export class DeferTaskUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: DeferTaskRequest
  ): Promise<Result<DeferTaskResponse, TaskDeferralError>> {
    if (!isValidDateOnly(request.deferredUntil)) {
      return ResultUtils.error(
        new TaskDeferralError("Invalid deferral date", "INVALID_DEFERRAL_DATE")
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskDeferralError(loaded.error.message, loaded.error.code)
      );
    }

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskDeferralError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "DeferTask",
      ...metadata.data,
      taskId: loaded.data.taskId,
      deferredUntil: request.deferredUntil,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskDeferralError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok({
          taskId: loaded.data.taskId,
          deferredUntil: request.deferredUntil,
        });
  }
}
