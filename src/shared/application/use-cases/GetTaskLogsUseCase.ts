import type {
  AuditLogCursor,
  AuditLogEntry,
  AuditLogRepository,
} from "../../../features/workspaces/application/ports/AuditLogRepository";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskId } from "../../domain/value-objects/TaskId";

export interface GetTaskLogsRequest {
  taskId?: string;
  logType?: "SYSTEM" | "USER" | "CONFLICT";
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
}

export interface LogEntry {
  id: string;
  taskId?: string;
  type: "SYSTEM" | "USER" | "CONFLICT";
  message: string;
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: Date;
}

export interface GetTaskLogsResponse {
  logs: LogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class GetTaskLogsError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "GetTaskLogsError";
  }
}

const logType = (entry: AuditLogEntry): LogEntry["type"] => {
  const value = entry.data.type;
  return value === "USER" || value === "CONFLICT" ? value : "SYSTEM";
};

const toLogEntry = (entry: AuditLogEntry): LogEntry => {
  const { message, type: _type, ...metadata } = entry.data;
  return {
    id: `${entry.source}:${entry.recordId}`,
    ...(entry.taskId === null ? {} : { taskId: entry.taskId }),
    type: logType(entry),
    message: message ?? entry.kind,
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    createdAt: new Date(entry.auditTime),
  };
};

/** Stable audit projection query with a compatibility page-shaped response. */
export class GetTaskLogsUseCase {
  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly MAX_PAGE_SIZE = 100;

  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly repository: AuditLogRepository
  ) {}

  async execute(
    request: GetTaskLogsRequest = {}
  ): Promise<Result<GetTaskLogsResponse, GetTaskLogsError>> {
    let taskId: string | undefined;
    if (request.taskId !== undefined) {
      try {
        taskId = TaskId.fromString(request.taskId).value;
      } catch {
        return ResultUtils.error(
          new GetTaskLogsError("Invalid task ID format", "INVALID_TASK_ID")
        );
      }
    }
    const page = Math.max(1, request.page ?? 1);
    const pageSize = Math.min(
      GetTaskLogsUseCase.MAX_PAGE_SIZE,
      Math.max(1, request.pageSize ?? GetTaskLogsUseCase.DEFAULT_PAGE_SIZE)
    );

    try {
      const entries: AuditLogEntry[] = [];
      let cursor: AuditLogCursor | undefined;
      do {
        const result = await this.repository.query({
          workspaceId: this.workspace.requireId(),
          ...(taskId === undefined ? {} : { taskId }),
          ...(cursor === undefined ? {} : { cursor }),
          limit: 100,
        });
        entries.push(...result.entries);
        cursor = result.nextCursor ?? undefined;
      } while (cursor !== undefined);

      let logs = entries.map(toLogEntry);
      if (request.logType !== undefined) {
        logs = logs.filter((entry) => entry.type === request.logType);
      }
      if (request.sortOrder === "asc") logs.reverse();
      const totalCount = logs.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const offset = (page - 1) * pageSize;

      return ResultUtils.ok({
        logs: logs.slice(offset, offset + pageSize),
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      return ResultUtils.error(
        new GetTaskLogsError(
          `Failed to get task logs: ${error instanceof Error ? error.message : "Unknown error"}`,
          "GET_FAILED"
        )
      );
    }
  }

  getLogsForTask(
    taskId: string,
    page = 1
  ): Promise<Result<GetTaskLogsResponse, GetTaskLogsError>> {
    return this.execute({ taskId, page, sortOrder: "desc" });
  }

  async getRecentLogs(
    limit = 20
  ): Promise<Result<LogEntry[], GetTaskLogsError>> {
    const result = await this.execute({ pageSize: limit, sortOrder: "desc" });
    return ResultUtils.isFailure(result)
      ? result
      : ResultUtils.ok(result.data.logs);
  }
}
