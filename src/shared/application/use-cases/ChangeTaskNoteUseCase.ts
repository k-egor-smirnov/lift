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

export interface ChangeTaskNoteRequest {
  readonly taskId: string;
  readonly note?: string;
}

export class TaskNoteChangeError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskNoteChangeError";
  }
}

export class ChangeTaskNoteUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: ChangeTaskNoteRequest
  ): Promise<Result<void, TaskNoteChangeError>> {
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskNoteChangeError(loaded.error.message, loaded.error.code)
      );
    }

    let splice;
    try {
      splice = minimalTextSplice(loaded.data.task.note, request.note ?? "");
    } catch (error) {
      return ResultUtils.error(
        new TaskNoteChangeError(errorMessage(error), "INVALID_NOTE")
      );
    }
    if (splice === null) return ResultUtils.ok(undefined);

    const metadata = this.commandBase(loaded.data);
    if (ResultUtils.isFailure(metadata)) {
      return ResultUtils.error(
        new TaskNoteChangeError(metadata.error.message, metadata.error.code)
      );
    }
    const committed = await this.commit({
      type: "SpliceTaskText",
      ...metadata.data,
      taskId: loaded.data.taskId,
      path: "note",
      baseHeads: [...loaded.data.workspace.heads],
      ...splice,
    });
    return ResultUtils.isFailure(committed)
      ? ResultUtils.error(
          new TaskNoteChangeError(committed.error.message, committed.error.code)
        )
      : ResultUtils.ok(undefined);
  }
}
