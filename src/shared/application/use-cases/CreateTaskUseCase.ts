import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { EffectiveDateProvider } from "../../../features/workspaces/application/ports/EffectiveDateProvider";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskCategory } from "../../domain/types";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { TaskId } from "../../domain/value-objects/TaskId";
import {
  BaseTaskUseCase,
  errorMessage,
  TaskOperationError,
} from "./BaseTaskUseCase";

export interface CreateTaskRequest {
  readonly title: string;
  readonly category: TaskCategory;
  /** Atomically include the new task in the current effective day. */
  readonly addToToday?: boolean;
}

export interface CreateTaskResponse {
  readonly taskId: string;
}

export class TaskCreationError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskCreationError";
  }
}

export class CreateTaskUseCase extends BaseTaskUseCase {
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
    request: CreateTaskRequest
  ): Promise<Result<CreateTaskResponse, TaskCreationError>> {
    let title: NonEmptyTitle;
    try {
      title = NonEmptyTitle.fromString(request.title);
    } catch (error) {
      return ResultUtils.error(
        new TaskCreationError(errorMessage(error), "INVALID_TITLE")
      );
    }
    if (
      request.category !== TaskCategory.INBOX &&
      request.category !== TaskCategory.SIMPLE &&
      request.category !== TaskCategory.FOCUS
    ) {
      return ResultUtils.error(
        new TaskCreationError("Invalid task category", "INVALID_CATEGORY")
      );
    }

    try {
      const workspaceId = this.workspace.requireId();
      const identity = this.actor.require();
      const workspace = await this.repository.getWorkspace(
        workspaceId,
        identity.actorId
      );
      if (workspace === undefined) {
        return ResultUtils.error(
          new TaskCreationError("Workspace not found", "WORKSPACE_NOT_FOUND")
        );
      }
      const effectiveDate = this.effectiveDates.current(
        workspace.state.settings
      );
      if (!isValidDateOnly(effectiveDate)) {
        return ResultUtils.error(
          new TaskCreationError("Invalid effective date", "INVALID_DATE")
        );
      }
      const taskId = TaskId.generate().value;
      const metadata = this.commandBase({ workspaceId, identity }, true);
      if (ResultUtils.isFailure(metadata)) {
        return ResultUtils.error(
          new TaskCreationError(metadata.error.message, metadata.error.code)
        );
      }
      const commitResult = await this.commit({
        type: "CreateTask",
        ...metadata.data,
        taskId,
        title: title.value,
        category: request.category,
        effectiveDate,
        ...(request.addToToday === true ? { addToDate: effectiveDate } : {}),
        deviceId: identity.deviceId,
      });
      if (ResultUtils.isFailure(commitResult)) {
        return ResultUtils.error(
          new TaskCreationError(
            commitResult.error.message,
            commitResult.error.code
          )
        );
      }
      return ResultUtils.ok({ taskId });
    } catch (error) {
      return ResultUtils.error(
        new TaskCreationError(
          `Failed to create task: ${errorMessage(error)}`,
          "CREATION_FAILED"
        )
      );
    }
  }
}
