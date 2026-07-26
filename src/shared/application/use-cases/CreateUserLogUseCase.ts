import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceUnitOfWork } from "../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskId } from "../../domain/value-objects/TaskId";
import { auditStringRecord } from "./AuditLogData";

export interface CreateUserLogRequest {
  taskId?: string;
  message: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export class CreateUserLogError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "CreateUserLogError";
  }
}

/** Appends an immutable user-authored audit record to the workspace CRDT. */
export class CreateUserLogUseCase {
  private static readonly MAX_MESSAGE_LENGTH = 500;

  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly unitOfWork: WorkspaceUnitOfWork,
    private readonly actor: CurrentActor
  ) {}

  async execute(
    request: CreateUserLogRequest
  ): Promise<Result<void, CreateUserLogError>> {
    const message = request.message?.trim();
    if (!message) {
      return ResultUtils.error(
        new CreateUserLogError("Log message cannot be empty", "EMPTY_MESSAGE")
      );
    }
    if (message.length > CreateUserLogUseCase.MAX_MESSAGE_LENGTH) {
      return ResultUtils.error(
        new CreateUserLogError(
          `Log message cannot exceed ${CreateUserLogUseCase.MAX_MESSAGE_LENGTH} characters`,
          "MESSAGE_TOO_LONG"
        )
      );
    }

    let taskId: string | null = null;
    if (request.taskId !== undefined) {
      try {
        taskId = TaskId.fromString(request.taskId).value;
      } catch {
        return ResultUtils.error(
          new CreateUserLogError("Invalid task ID format", "INVALID_TASK_ID")
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
        auditKind: "user_log",
        auditTime: this.actor.auditTime(),
        taskId,
        effectiveDate: null,
        data: {
          type: "USER",
          message,
          ...auditStringRecord(request.metadata),
        },
      });
      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new CreateUserLogError(
          `Failed to create user log: ${error instanceof Error ? error.message : "Unknown error"}`,
          "CREATION_FAILED"
        )
      );
    }
  }

  static getMaxMessageLength(): number {
    return CreateUserLogUseCase.MAX_MESSAGE_LENGTH;
  }
}
