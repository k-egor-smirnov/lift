import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskId } from "../../domain/value-objects/TaskId";
import { auditStringRecord } from "./AuditLogData";

export type SystemLogAction =
  | "created"
  | "category_changed"
  | "completed"
  | "reverted"
  | "title_changed"
  | "overdue"
  | "conflict_resolved"
  | "added_to_today"
  | "removed_from_today"
  | "daily_modal_check";

export interface CreateSystemLogRequest {
  taskId: string;
  action: SystemLogAction;
  metadata?: Readonly<Record<string, unknown>>;
  message?: string;
}

export class CreateSystemLogError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CreateSystemLogError";
  }
}

/** Appends auxiliary immutable audit data; semantic commands log themselves. */
export class CreateSystemLogUseCase {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly unitOfWork: WorkspaceUnitOfWork,
    private readonly actor: CurrentActor
  ) {}

  async execute(
    request: CreateSystemLogRequest
  ): Promise<Result<void, CreateSystemLogError>> {
    let taskId: string | null = null;
    if (request.taskId !== "system") {
      try {
        taskId = TaskId.fromString(request.taskId).value;
      } catch {
        return ResultUtils.error(
          new CreateSystemLogError("Invalid task ID format", "INVALID_TASK_ID")
        );
      }
    }

    try {
      const identity = this.actor.require();
      const operationId = this.actor.nextOperationId();
      await this.unitOfWork.commit({
        type: "AppendAuditRecord",
        workspaceId: this.workspace.requireId(),
        actorId: identity.actorId,
        operationId,
        auditRecordId: operationId,
        auditKind: request.action,
        auditTime: this.actor.auditTime(),
        taskId,
        effectiveDate: null,
        data: {
          type: "SYSTEM",
          message: request.message ?? request.action,
          ...auditStringRecord(request.metadata),
        },
      });
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new CreateSystemLogError(
          `Failed to create system log: ${error instanceof Error ? error.message : "Unknown error"}`,
          "CREATION_FAILED"
        )
      );
    }
  }
}
