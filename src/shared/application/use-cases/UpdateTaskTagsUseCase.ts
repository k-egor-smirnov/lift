import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { Result, ResultUtils } from "../../domain/Result";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";

export interface UpdateTaskTagsRequest {
  readonly taskId: string;
  readonly tags: readonly string[];
}

export class TaskTagsUpdateError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskTagsUpdateError";
  }
}

/** Reconciles the task OR-set using idempotent semantic tag commands. */
export class UpdateTaskTagsUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: UpdateTaskTagsRequest
  ): Promise<Result<void, TaskTagsUpdateError>> {
    const desired = [
      ...new Set(request.tags.map((tag) => tag.trim()).filter(Boolean)),
    ].sort();
    if (desired.some((tag) => tag.length > 80)) {
      return ResultUtils.error(
        new TaskTagsUpdateError(
          "Tag cannot exceed 80 characters",
          "INVALID_TAG"
        )
      );
    }
    const loaded = await this.findTaskById(request.taskId);
    if (ResultUtils.isFailure(loaded)) {
      return ResultUtils.error(
        new TaskTagsUpdateError(loaded.error.message, loaded.error.code)
      );
    }
    const current = new Set(
      Object.entries(loaded.data.task.tags.adds)
        .filter(([, dots]) =>
          Object.keys(dots).some(
            (dot) => !Object.hasOwn(loaded.data.task.tags.removedDots, dot)
          )
        )
        .map(([tag]) => tag)
    );
    const target = new Set(desired);
    try {
      for (const tag of desired.filter((value) => !current.has(value))) {
        const identity = this.actor.require();
        await this.unitOfWork.commit({
          type: "AddTag",
          workspaceId: this.workspace.requireId(),
          actorId: identity.actorId,
          operationId: this.actor.nextOperationId(),
          taskId: loaded.data.taskId,
          tag,
        });
      }
      for (const tag of [...current]
        .filter((value) => !target.has(value))
        .sort()) {
        const identity = this.actor.require();
        await this.unitOfWork.commit({
          type: "RemoveTag",
          workspaceId: this.workspace.requireId(),
          actorId: identity.actorId,
          operationId: this.actor.nextOperationId(),
          taskId: loaded.data.taskId,
          tag,
        });
      }
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new TaskTagsUpdateError(
          error instanceof Error ? error.message : "Failed to update tags",
          "UPDATE_FAILED"
        )
      );
    }
  }
}
