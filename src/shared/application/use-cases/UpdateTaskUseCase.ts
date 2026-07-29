import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { EffectiveDateProvider } from "../../../features/workspaces/application/ports/EffectiveDateProvider";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskCategory } from "../../domain/types";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface UpdateTaskRequest {
  readonly taskId: string;
  readonly category: TaskCategory;
}

export class TaskUpdateError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskUpdateError";
  }
}

export class UpdateTaskUseCase extends BaseTaskUseCase {
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
    request: UpdateTaskRequest
  ): Promise<Result<void, TaskUpdateError>> {
    if (
      request.category !== TaskCategory.INBOX &&
      request.category !== TaskCategory.SIMPLE &&
      request.category !== TaskCategory.FOCUS
    ) {
      return ResultUtils.error(
        new TaskUpdateError("Invalid task category", "INVALID_CATEGORY")
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskUpdateError(loaded.error.message, loaded.error.code)
      );
    }
    if (loaded.data.task.category === request.category) {
      return ResultUtils.ok(undefined);
    }
    let effectiveDate: string;
    try {
      effectiveDate = this.effectiveDates.current(
        loaded.data.workspace.state.settings
      );
    } catch {
      return ResultUtils.error(
        new TaskUpdateError("Invalid effective date", "INVALID_DATE")
      );
    }
    if (!isValidDateOnly(effectiveDate)) {
      return ResultUtils.error(
        new TaskUpdateError("Invalid effective date", "INVALID_DATE")
      );
    }
    const metadata = this.commandBase(loaded.data, true);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskUpdateError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "ChangeTaskCategory",
      ...metadata.data,
      taskId: loaded.data.taskId,
      fromCategory: loaded.data.task.category,
      category: request.category,
      effectiveDate,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskUpdateError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok(undefined);
  }
}
