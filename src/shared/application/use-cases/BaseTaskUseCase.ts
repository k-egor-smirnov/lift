import { inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { Task } from "../../domain/entities/Task";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { hashTask } from "../../infrastructure/utils/hashUtils";
import { DomainEvent } from "../../domain/events/DomainEvent";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Base error for task operations
 */
export class TaskOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TaskOperationError";
  }
}

/**
 * Base class for task-related use cases
 * Provides common functionality for task operations
 */
export abstract class BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    protected readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) protected readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) protected readonly database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN)
    protected readonly debouncedSyncService: DebouncedSyncService
  ) {}

  /**
   * Find task by ID with proper validation and error handling
   */
  protected async findTaskById(
    taskIdString: string
  ): Promise<Result<Task, TaskOperationError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(taskIdString);
      } catch (error) {
        return ResultUtils.error(
          new TaskOperationError("Invalid task ID format", "INVALID_TASK_ID")
        );
      }

      // Find the task
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new TaskOperationError("Task not found", "TASK_NOT_FOUND")
        );
      }

      return ResultUtils.ok(task);
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `Failed to find task: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "FIND_FAILED"
        )
      );
    }
  }

  /**
   * Execute operation in transaction with sync queue and event store
   */
  protected async executeInTransaction<T>(
    task: Task,
    operation: "create" | "update" | "delete",
    events: DomainEvent[],
    additionalOperations?: () => Promise<void>
  ): Promise<Result<T, TaskOperationError>> {
    try {
      let result: T | undefined;

      await this.database.transaction(
        "rw",
        [
          this.database.tasks,
          this.database.syncQueue,
          this.database.eventStore,
          this.database.dailySelectionEntries,
        ],
        async () => {
          // 1. Save task (if not delete operation)
          if (operation !== "delete") {
            await this.taskRepository.save(task);
          } else {
            await this.taskRepository.delete(task.id);
          }

          // 2. Add sync queue entry
          await this.database.syncQueue.add({
            entityType: "task",
            entityId: task.id.value,
            operation,
            payloadHash: operation !== "delete" ? hashTask(task) : "",
            attemptCount: 0,
            createdAt: new Date(),
            nextAttemptAt: Date.now(),
          });

          // 3. Execute additional operations if provided
          if (additionalOperations) {
            const additionalResult = await additionalOperations();
            if (additionalResult !== undefined) {
              result = additionalResult as T;
            }
          }

          // 4. Publish domain events
          if (events.length > 0) {
            await this.eventBus.publishAll(events);
          }
        }
      );

      // 5. Trigger debounced sync after successful transaction
      this.debouncedSyncService.triggerSync();

      return ResultUtils.ok(result as T);
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `Transaction failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "TRANSACTION_FAILED"
        )
      );
    }
  }

  /**
   * Wrapper for safe execution with error handling
   */
  protected async safeExecute<T, E extends Error>(
    operation: () => Promise<Result<T, E>>,
    errorMessage: string,
    errorCode: string
  ): Promise<Result<T, E | TaskOperationError>> {
    try {
      return await operation();
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          `${errorMessage}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          errorCode
        ) as unknown as E
      );
    }
  }
}
