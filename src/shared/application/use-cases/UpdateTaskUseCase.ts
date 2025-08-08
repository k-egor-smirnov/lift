import { injectable, inject } from "tsyringe";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { TaskCategory } from "../../domain/types";
import { Result, ResultUtils } from "../../domain/Result";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for updating a task
 */
export interface UpdateTaskRequest {
  taskId: string;
  title?: string;
  category?: TaskCategory;
  order?: number;
  note?: string | null;
}

/**
 * Domain errors for task updates
 */
export class TaskUpdateError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskUpdateError";
  }
}

/**
 * Use case for updating task title and/or category
 */
@injectable()
export class UpdateTaskUseCase extends BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN)
    debouncedSyncService: DebouncedSyncService
  ) {
    super(taskRepository, eventBus, database, debouncedSyncService);
  }
  async execute(
    request: UpdateTaskRequest
  ): Promise<Result<void, TaskUpdateError>> {
    return this.safeExecute(
      async () => {
        // Find and validate task
        const taskResult = await this.findTaskById(request.taskId);
        if (ResultUtils.isFailure(taskResult)) {
          return ResultUtils.error(
            new TaskUpdateError(taskResult.error.message, taskResult.error.code)
          );
        }

        const task = taskResult.data;
        const allEvents: any[] = [];

        // Update title if provided
        if (request.title !== undefined) {
          let title: NonEmptyTitle;
          try {
            title = NonEmptyTitle.fromString(request.title);
          } catch (error) {
            return ResultUtils.error(
              new TaskUpdateError(
                "Invalid task title: title cannot be empty",
                "INVALID_TITLE"
              )
            );
          }

          const titleEvents = task.changeTitle(title);
          allEvents.push(...titleEvents);
        }

        // Update category if provided
        if (request.category !== undefined) {
          const categoryEvents = task.changeCategory(request.category);
          allEvents.push(...categoryEvents);
        }

        // Update order if provided
        if (request.order !== undefined) {
          const orderEvents = task.changeOrder(request.order);
          allEvents.push(...orderEvents);
        }

        // Update note if provided
        if (request.note !== undefined) {
          const noteEvents = task.changeNote(request.note ?? null);
          allEvents.push(...noteEvents);
        }

        // Execute in transaction
        const transactionResult = await this.executeInTransaction<void>(
          task,
          "update",
          allEvents
        );

        if (ResultUtils.isFailure(transactionResult)) {
          return ResultUtils.error(
            new TaskUpdateError(
              transactionResult.error.message,
              transactionResult.error.code
            )
          );
        }

        return ResultUtils.ok(undefined);
      },
      "Failed to update task",
      "UPDATE_FAILED"
    );
  }
}
