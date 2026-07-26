import type { WorkspaceCommand } from "../../../features/workspaces/application/commands/WorkspaceCommand";
import type {
  CurrentActor,
  CurrentActorIdentity,
} from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type {
  WorkspaceReadModel,
  WorkspaceRepository,
} from "../../../features/workspaces/application/ports/WorkspaceRepository";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { isDeleted } from "../../../features/workspaces/domain/ConflictPolicy";
import type { TaskCrdtState } from "../../../features/workspaces/domain/WorkspaceState";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskId } from "../../domain/value-objects/TaskId";

export class TaskOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TaskOperationError";
  }
}

export interface LoadedWorkspaceTask {
  readonly workspaceId: string;
  readonly identity: CurrentActorIdentity;
  readonly workspace: WorkspaceReadModel;
  readonly task: Readonly<TaskCrdtState>;
  readonly taskId: string;
}

export interface CommandBaseMetadata {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly operationId: string;
}

export interface AuditedCommandBaseMetadata extends CommandBaseMetadata {
  readonly auditTime: string;
}

/** Common Application-port helpers for task scenarios. */
export abstract class BaseTaskUseCase {
  constructor(
    protected readonly workspace: CurrentWorkspace,
    protected readonly repository: WorkspaceRepository,
    protected readonly unitOfWork: WorkspaceUnitOfWork,
    protected readonly actor: CurrentActor
  ) {}

  protected parseTaskId(
    taskIdValue: string
  ): Result<string, TaskOperationError> {
    try {
      return ResultUtils.ok(TaskId.fromString(taskIdValue).value);
    } catch {
      return ResultUtils.error(
        new TaskOperationError("Invalid task ID format", "INVALID_TASK_ID")
      );
    }
  }

  protected async findTaskById(
    taskIdValue: string,
    options: { readonly includeDeleted?: boolean } = {}
  ): Promise<Result<LoadedWorkspaceTask, TaskOperationError>> {
    const parsed = this.parseTaskId(taskIdValue);
    if (ResultUtils.isFailure(parsed)) return parsed;

    try {
      const workspaceId = this.workspace.requireId();
      const identity = this.actor.require();
      const workspace = await this.repository.getWorkspace(
        workspaceId,
        identity.actorId
      );
      if (workspace === undefined) {
        return ResultUtils.error(
          new TaskOperationError("Workspace not found", "WORKSPACE_NOT_FOUND")
        );
      }
      const task = workspace.state.tasks[parsed.data];
      if (
        task === undefined ||
        (!options.includeDeleted && isDeleted(task.deletionDots))
      ) {
        return ResultUtils.error(
          new TaskOperationError("Task not found", "TASK_NOT_FOUND")
        );
      }

      return ResultUtils.ok({
        workspaceId,
        identity,
        workspace,
        task,
        taskId: parsed.data,
      });
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `Failed to find task: ${errorMessage(error)}`,
          "FIND_FAILED"
        )
      );
    }
  }

  protected commandBase(
    loaded: Pick<LoadedWorkspaceTask, "workspaceId" | "identity">,
    audited?: false
  ): Result<CommandBaseMetadata, TaskOperationError>;
  protected commandBase(
    loaded: Pick<LoadedWorkspaceTask, "workspaceId" | "identity">,
    audited: true
  ): Result<AuditedCommandBaseMetadata, TaskOperationError>;
  protected commandBase(
    loaded: Pick<LoadedWorkspaceTask, "workspaceId" | "identity">,
    audited = false
  ): Result<
    CommandBaseMetadata | AuditedCommandBaseMetadata,
    TaskOperationError
  > {
    try {
      const base: CommandBaseMetadata = {
        workspaceId: loaded.workspaceId,
        actorId: loaded.identity.actorId,
        operationId: this.actor.nextOperationId(),
      };
      return ResultUtils.ok(
        audited ? { ...base, auditTime: this.actor.auditTime() } : base
      );
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `Failed to acquire command authorship: ${errorMessage(error)}`,
          "AUTHORSHIP_FAILED"
        )
      );
    }
  }

  protected async commit(
    command: WorkspaceCommand
  ): Promise<Result<void, TaskOperationError>> {
    try {
      await this.unitOfWork.commit(command);
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `Transaction failed: ${errorMessage(error)}`,
          "TRANSACTION_FAILED"
        )
      );
    }
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";
