import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import {
  TodoDatabase,
  TaskLogRecord,
} from "../../infrastructure/database/TodoDatabase";
import { Result, ResultUtils } from "../../domain/Result";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for getting task logs
 */
export interface GetTaskLogsRequest {
  taskId?: string; // Optional - if not provided, gets all logs
  logType?: "SYSTEM" | "USER" | "CONFLICT"; // Optional filter by log type
  page?: number; // Optional, defaults to 1
  pageSize?: number; // Optional, defaults to 20
  sortOrder?: "asc" | "desc"; // Optional, defaults to 'desc' (newest first)
}

/**
 * Log entry with formatted data
 */
export interface LogEntry {
  id: number;
  taskId?: string;
  type: "SYSTEM" | "USER" | "CONFLICT";
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Response for getting task logs
 */
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

/**
 * Domain errors for getting task logs
 */
export class GetTaskLogsError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "GetTaskLogsError";
  }
}

/**
 * Use case for getting task logs with pagination
 */
@injectable()
export class GetTaskLogsUseCase {
  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly MAX_PAGE_SIZE = 100;

  constructor(
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(
    request: GetTaskLogsRequest = {}
  ): Promise<Result<GetTaskLogsResponse, GetTaskLogsError>> {
    try {
      // Parse and validate task ID if provided
      let taskId: TaskId | undefined;
      if (request.taskId) {
        try {
          taskId = TaskId.fromString(request.taskId);
        } catch (error) {
          return ResultUtils.error(
            new GetTaskLogsError("Invalid task ID format", "INVALID_TASK_ID")
          );
        }
      }

      // Validate and set pagination parameters
      const page = Math.max(1, request.page || 1);
      let requestedPageSize =
        request.pageSize ?? GetTaskLogsUseCase.DEFAULT_PAGE_SIZE;
      // Handle edge case where pageSize is 0 or negative
      if (requestedPageSize <= 0) {
        requestedPageSize = 1;
      }
      const pageSize = Math.min(
        GetTaskLogsUseCase.MAX_PAGE_SIZE,
        requestedPageSize
      );
      const sortOrder = request.sortOrder || "desc";

      // Build query
      let query: any;

      // Filter by task ID if provided
      if (taskId) {
        query = this.database.taskLogs.where("taskId").equals(taskId.value);
      } else {
        query = this.database.taskLogs.toCollection();
      }

      // Filter by log type if provided
      if (request.logType) {
        if (taskId) {
          // If we already filtered by taskId, we need to use and() for additional filtering
          query = query.and((log: any) => log.type === request.logType);
        } else {
          query = this.database.taskLogs.where("type").equals(request.logType);
        }
      }

      // Get total count for pagination
      const totalCount = await query.count();
      const totalPages = Math.ceil(totalCount / pageSize);

      // Apply sorting and pagination
      const offset = (page - 1) * pageSize;

      let logs: TaskLogRecord[];
      if (sortOrder === "desc") {
        logs = await query.reverse().offset(offset).limit(pageSize).toArray();
      } else {
        logs = await query.offset(offset).limit(pageSize).toArray();
      }

      // Convert to response format
      const logEntries: LogEntry[] = logs.map((log) => ({
        id: log.id!,
        taskId: log.taskId,
        type: log.type,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt,
      }));

      return ResultUtils.ok({
        logs: logEntries,
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

  /**
   * Get logs for a specific task with default pagination
   */
  async getLogsForTask(
    taskId: string,
    page: number = 1
  ): Promise<Result<GetTaskLogsResponse, GetTaskLogsError>> {
    return this.execute({
      taskId,
      page,
      pageSize: GetTaskLogsUseCase.DEFAULT_PAGE_SIZE,
      sortOrder: "desc",
    });
  }

  /**
   * Get recent logs across all tasks
   */
  async getRecentLogs(
    limit: number = 20
  ): Promise<Result<LogEntry[], GetTaskLogsError>> {
    try {
      const result = await this.execute({
        pageSize: Math.min(limit, GetTaskLogsUseCase.MAX_PAGE_SIZE),
        sortOrder: "desc",
      });

      if (ResultUtils.isFailure(result)) {
        return result;
      }

      return ResultUtils.ok(result.data.logs);
    } catch (error) {
      return ResultUtils.error(
        new GetTaskLogsError(
          `Failed to get recent logs: ${error instanceof Error ? error.message : "Unknown error"}`,
          "GET_FAILED"
        )
      );
    }
  }
}
