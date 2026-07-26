import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { minimalTextSplice } from "../../../features/workspaces/application/text/minimalTextSplice";
import { Result, ResultUtils } from "../../domain/Result";
import {
  BaseTaskUseCase,
  errorMessage,
  TaskOperationError,
} from "./BaseTaskUseCase";

export interface ChangeTaskTitleRequest {
  readonly taskId: string;
  readonly title: string;
}

export class TaskTitleChangeError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskTitleChangeError";
  }
}

/** Applies a text splice to the current Automerge frontier. */
export class ChangeTaskTitleUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: ChangeTaskTitleRequest
  ): Promise<Result<void, TaskTitleChangeError>> {
    const title = request.title.trim();
    if (!title) {
      return ResultUtils.error(
        new TaskTitleChangeError("Task title cannot be empty", "EMPTY_TITLE")
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskTitleChangeError(loaded.error.message, loaded.error.code)
      );
    }
    let splice;
    try {
      splice = minimalTextSplice(loaded.data.task.title, title);
    } catch (error) {
      return ResultUtils.error(
        new TaskTitleChangeError(errorMessage(error), "INVALID_TITLE")
      );
    }
    if (splice === null) return ResultUtils.ok(undefined);
    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskTitleChangeError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "SpliceTaskText",
      ...metadata.data,
      taskId: loaded.data.taskId,
      path: "title",
      baseHeads: [...loaded.data.workspace.heads],
      ...splice,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskTitleChangeError(
            committed.error.message,
            committed.error.code
          )
        )
      : ResultUtils.ok(undefined);
  }
}
