import { TaskId } from '../../domain/value-objects/TaskId';
import { TodoDatabase, TaskLogRecord } from '../../infrastructure/database/TodoDatabase';
import { Result, ResultUtils } from '../../domain/Result';

/**
 * Request for creating a user log
 */
export interface CreateUserLogRequest {
  taskId?: string; // Optional - for custom logs without task association
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Domain errors for user log creation
 */
export class CreateUserLogError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CreateUserLogError';
  }
}

/**
 * Use case for creating user logs with validation
 */
export class CreateUserLogUseCase {
  private static readonly MAX_MESSAGE_LENGTH = 500;

  constructor(
    private readonly database: TodoDatabase
  ) {}

  async execute(request: CreateUserLogRequest): Promise<Result<void, CreateUserLogError>> {
    try {
      // Validate message length
      if (!request.message || request.message.trim().length === 0) {
        return ResultUtils.error(
          new CreateUserLogError('Log message cannot be empty', 'EMPTY_MESSAGE')
        );
      }

      if (request.message.length > CreateUserLogUseCase.MAX_MESSAGE_LENGTH) {
        return ResultUtils.error(
          new CreateUserLogError(
            `Log message cannot exceed ${CreateUserLogUseCase.MAX_MESSAGE_LENGTH} characters`,
            'MESSAGE_TOO_LONG'
          )
        );
      }

      // Parse and validate task ID if provided
      let taskId: TaskId | undefined;
      if (request.taskId) {
        try {
          taskId = TaskId.fromString(request.taskId);
        } catch (error) {
          return ResultUtils.error(
            new CreateUserLogError('Invalid task ID format', 'INVALID_TASK_ID')
          );
        }
      }

      // Create log record
      const logRecord: TaskLogRecord = {
        taskId: taskId?.value,
        type: 'USER',
        message: request.message.trim(),
        metadata: request.metadata,
        createdAt: new Date()
      };

      // Save to database
      await this.database.taskLogs.add(logRecord);

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new CreateUserLogError(
          `Failed to create user log: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CREATION_FAILED'
        )
      );
    }
  }

  /**
   * Get the maximum allowed message length
   */
  static getMaxMessageLength(): number {
    return CreateUserLogUseCase.MAX_MESSAGE_LENGTH;
  }
}