import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { TaskCategory } from "../../domain/types";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for undeferring a task
 */
export interface UndeferTaskRequest {
  taskId: string;
}

/**
 * Response for undeferring a task
 */
export interface UndeferTaskResponse {
  taskId: string;
  restoredCategory: TaskCategory;
}

/**
 * Domain errors for task undeferral
 */
export class TaskUndeferralError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TaskUndeferralError";
  }
}

/**
 * Use case for undeferring a task
 */
@injectable()
export class UndeferTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN)
    private readonly debouncedSyncService: DebouncedSyncService
  ) {}

  async execute(
    request: UndeferTaskRequest
  ): Promise<Result<UndeferTaskResponse, TaskUndeferralError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new TaskUndeferralError("Invalid task ID format", "INVALID_TASK_ID")
        );
      }

      // Find the task
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new TaskUndeferralError("Task not found", "TASK_NOT_FOUND")
        );
      }

      // Check if task is deferred
      if (!task.isDeferred) {
        return ResultUtils.error(
          new TaskUndeferralError("Task is not deferred", "TASK_NOT_DEFERRED")
        );
      }

      // Store the restored category before undeferring
      const restoredCategory = task.originalCategory || TaskCategory.INBOX;

      // Undefer the task (domain logic handles validation and events)
      const events = task.undefer();

      // Execute transactional operation including task, and eventStore
      await this.database.transaction(
        "rw",
        [this.database.tasks, this.database.eventStore],
        async () => {
          // 1. Save the updated task
          await this.taskRepository.save(task);

          // 2. Publish domain events
          await this.eventBus.publishAll(events);
        }
      );

      // 4. Trigger debounced sync after successful transaction
      this.debouncedSyncService.triggerSync();

      return ResultUtils.ok({
        taskId: task.id.value,
        restoredCategory,
      });
    } catch (error) {
      return ResultUtils.error(
        new TaskUndeferralError(
          `Failed to undefer task: ${error instanceof Error ? error.message : "Unknown error"}`,
          "UNDEFERRAL_FAILED"
        )
      );
    }
  }
}
