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

export interface RemoveTaskFromTodayRequest {
  readonly taskId: string;
  readonly date?: string;
}

export class RemoveTaskFromTodayError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "RemoveTaskFromTodayError";
  }
}

export class RemoveTaskFromTodayUseCase extends BaseTaskUseCase {
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
    request: RemoveTaskFromTodayRequest
  ): Promise<Result<void, RemoveTaskFromTodayError>> {
    if (request.date !== undefined && !isValidDateOnly(request.date)) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError("Invalid date format", "INVALID_DATE")
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError(loaded.error.message, loaded.error.code)
      );
    }

    let date: string;
    try {
      date =
        request.date ??
        this.effectiveDates.current(loaded.data.workspace.state.settings);
    } catch (error) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError(
          `Failed to resolve effective date: ${errorMessage(error)}`,
          "INVALID_DATE"
        )
      );
    }
    if (!isValidDateOnly(date)) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError("Invalid date format", "INVALID_DATE")
      );
    }

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError(
          metadata.error.message,
          metadata.error.code
        )
      );
    }
    const committed = await this.commit({
      type: "RemoveFromDay",
      ...metadata.data,
      taskId: loaded.data.taskId,
      date,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new RemoveTaskFromTodayError(
            committed.error.message,
            committed.error.code
          )
        )
      : ResultUtils.ok(undefined);
  }
}
