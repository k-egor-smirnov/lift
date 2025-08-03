import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../domain/repositories/DailySelectionRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for deleting a task
 */
export interface DeleteTaskRequest {
  taskId: string;
}

/**
 * Response for task deletion
 */
export interface DeleteTaskResponse {
  taskId: string;
}

/**
 * Domain errors for task deletion
 */
export class TaskDeletionError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskDeletionError";
  }
}

/**
 * Use case for deleting a task (soft delete)
 * This use case handles:
 * 1. Soft deleting the task
 * 2. Removing the task from all daily selections
 * 3. Publishing domain events
 * 4. Triggering sync
 */
@injectable()
export class DeleteTaskUseCase extends BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN)
    debouncedSyncService: DebouncedSyncService,
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN)
    private readonly dailySelectionRepository: DailySelectionRepository
  ) {
    super(taskRepository, eventBus, database, debouncedSyncService);
  }

  async execute(
    request: DeleteTaskRequest
  ): Promise<Result<DeleteTaskResponse, TaskDeletionError>> {
    return this.safeExecute(
      async () => {
        // Parse and validate task ID
        let taskId: TaskId;
        try {
          taskId = TaskId.fromString(request.taskId);
        } catch (error) {
          return ResultUtils.error(
            new TaskDeletionError("Invalid task ID format", "INVALID_TASK_ID")
          );
        }

        // Find and validate task
        const taskResult = await this.findTaskById(request.taskId);
        if (ResultUtils.isFailure(taskResult)) {
          return ResultUtils.error(
            new TaskDeletionError(
              taskResult.error.message,
              taskResult.error.code
            )
          );
        }

        const task = taskResult.data;

        // Check if task is already deleted
        if (task.isDeleted) {
          return ResultUtils.ok({ taskId: task.id.value });
        }

        // Soft delete the task
        const events = task.softDelete();

        // Execute in transaction with additional operations
        const transactionResult =
          await this.executeInTransaction<DeleteTaskResponse>(
            task,
            "update", // Soft delete is an update operation
            events,
            async () => {
              // Remove task from all daily selections
              await this.dailySelectionRepository.removeTaskFromAllDays(taskId);
            }
          );

        if (ResultUtils.isFailure(transactionResult)) {
          return ResultUtils.error(
            new TaskDeletionError(
              transactionResult.error.message,
              transactionResult.error.code
            )
          );
        }

        return ResultUtils.ok({ taskId: task.id.value });
      },
      "Failed to delete task",
      "DELETION_FAILED"
    );
  }
}
