import type { CurrentActor } from "../../../workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceRepository } from "../../../workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../workspaces/application/ports/WorkspaceUnitOfWork";
import {
  isValidWorkspaceStartOfDay,
  isValidWorkspaceTimezone,
} from "../../../workspaces/domain/WorkspaceState";
import { Result, ResultUtils } from "../../../../shared/domain/Result";
import {
  BaseTaskUseCase,
  errorMessage,
  TaskOperationError,
} from "../../../../shared/application/use-cases/BaseTaskUseCase";

export type UpdateWorkspaceSettingsRequest =
  | { readonly timezone: string; readonly startOfDay?: string }
  | { readonly timezone?: string; readonly startOfDay: string };

export class WorkspaceSettingsUpdateError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "WorkspaceSettingsUpdateError";
  }
}

export class UpdateWorkspaceSettingsUseCase extends BaseTaskUseCase {
  constructor(
    workspace: CurrentWorkspace,
    repository: WorkspaceRepository,
    unitOfWork: WorkspaceUnitOfWork,
    actor: CurrentActor
  ) {
    super(workspace, repository, unitOfWork, actor);
  }

  async execute(
    request: UpdateWorkspaceSettingsRequest
  ): Promise<Result<void, WorkspaceSettingsUpdateError>> {
    if (request.timezone === undefined && request.startOfDay === undefined) {
      return ResultUtils.error(
        new WorkspaceSettingsUpdateError(
          "Settings patch is empty",
          "EMPTY_PATCH"
        )
      );
    }
    if (
      request.timezone !== undefined &&
      !isValidWorkspaceTimezone(request.timezone)
    ) {
      return ResultUtils.error(
        new WorkspaceSettingsUpdateError("Invalid timezone", "INVALID_TIMEZONE")
      );
    }
    if (
      request.startOfDay !== undefined &&
      !isValidWorkspaceStartOfDay(request.startOfDay)
    ) {
      return ResultUtils.error(
        new WorkspaceSettingsUpdateError(
          "Invalid start of day",
          "INVALID_START_OF_DAY"
        )
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
          new WorkspaceSettingsUpdateError(
            "Workspace not found",
            "WORKSPACE_NOT_FOUND"
          )
        );
      }

      const timezone =
        request.timezone !== undefined &&
        request.timezone !== workspace.state.settings.timezone
          ? request.timezone
          : undefined;
      const startOfDay =
        request.startOfDay !== undefined &&
        request.startOfDay !== workspace.state.settings.startOfDay
          ? request.startOfDay
          : undefined;
      if (timezone === undefined && startOfDay === undefined) {
        return ResultUtils.ok(undefined);
      }

      const metadata = this.commandBase({ workspaceId, identity }, true);
      if (ResultUtils.isFailure(metadata)) {
        return ResultUtils.error(
          new WorkspaceSettingsUpdateError(
            metadata.error.message,
            metadata.error.code
          )
        );
      }
      const base = {
        type: "UpdateWorkspaceSettings" as const,
        ...metadata.data,
      };
      const command =
        timezone !== undefined && startOfDay !== undefined
          ? {
              ...base,
              timezone,
              fromTimezone: workspace.state.settings.timezone,
              startOfDay,
              fromStartOfDay: workspace.state.settings.startOfDay,
            }
          : timezone !== undefined
            ? {
                ...base,
                timezone,
                fromTimezone: workspace.state.settings.timezone,
              }
            : {
                ...base,
                startOfDay: startOfDay!,
                fromStartOfDay: workspace.state.settings.startOfDay,
              };
      const committed = await this.commit(command);
      return ResultUtils.isFailure(committed)
        ? ResultUtils.error(
            new WorkspaceSettingsUpdateError(
              committed.error.message,
              committed.error.code
            )
          )
        : ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new WorkspaceSettingsUpdateError(
          `Failed to update workspace settings: ${errorMessage(error)}`,
          "UPDATE_FAILED"
        )
      );
    }
  }
}
