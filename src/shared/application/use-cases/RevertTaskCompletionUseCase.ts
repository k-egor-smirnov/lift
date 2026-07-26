import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { EffectiveDateProvider } from "../../../features/workspaces/application/ports/EffectiveDateProvider";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";
import { Result, ResultUtils } from "../../domain/Result";
import {
  BaseTaskUseCase,
  errorMessage,
  TaskOperationError,
} from "./BaseTaskUseCase";

export interface RevertTaskCompletionRequest {
  readonly taskId: string;
  readonly effectiveDate?: string;
}

export class TaskCompletionRevertError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskCompletionRevertError";
  }
}

export class RevertTaskCompletionUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor,
    private readonly effectiveDates: EffectiveDateProvider
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: RevertTaskCompletionRequest
  ): Promise<Result<void, TaskCompletionRevertError>> {
    if (
      request.effectiveDate !== undefined &&
      !isValidDateOnly(request.effectiveDate)
    ) {
      return ResultUtils.error(
        new TaskCompletionRevertError("Invalid date format", "INVALID_DATE")
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskCompletionRevertError(loaded.error.message, loaded.error.code)
      );
    }
    if (loaded.data.task.completion === "active") {
      return ResultUtils.ok(undefined);
    }

    let effectiveDate: string;
    try {
      effectiveDate =
        request.effectiveDate ??
        this.effectiveDates.current(loaded.data.workspace.state.settings);
    } catch (error) {
      return ResultUtils.error(
        new TaskCompletionRevertError(
          `Failed to resolve effective date: ${errorMessage(error)}`,
          "INVALID_DATE"
        )
      );
    }
    if (!isValidDateOnly(effectiveDate)) {
      return ResultUtils.error(
        new TaskCompletionRevertError("Invalid date format", "INVALID_DATE")
      );
    }

    const metadata = this.commandBase(loaded.data, true);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskCompletionRevertError(
          metadata.error.message,
          metadata.error.code
        )
      );
    }
    const committed = await this.commit({
      type: "ReopenTask",
      ...metadata.data,
      taskId: loaded.data.taskId,
      effectiveDate,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskCompletionRevertError(
            committed.error.message,
            committed.error.code
          )
        )
      : ResultUtils.ok(undefined);
  }
}
