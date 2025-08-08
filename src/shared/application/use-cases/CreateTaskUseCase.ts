import { injectable, inject } from "tsyringe";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { TaskCategory } from "../../domain/types";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { BaseTaskUseCase, TaskOperationError } from "./BaseTaskUseCase";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for creating a new task
 */
export interface CreateTaskRequest {
  title: string;
  category: TaskCategory;
  image?: File;
}

/**
 * Response for task creation
 */
export interface CreateTaskResponse {
  taskId: string;
}

/**
 * Domain errors for task creation
 */
export class TaskCreationError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "TaskCreationError";
  }
}

/**
 * Use case for creating a new task
 */
@injectable()
export class CreateTaskUseCase extends BaseTaskUseCase {
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
    request: CreateTaskRequest
  ): Promise<Result<CreateTaskResponse, TaskCreationError>> {
    return this.safeExecute(
      async () => {
        // Create task ID
        const taskId = TaskId.generate();

        // Create title value object
        let title: NonEmptyTitle;
        try {
          title = NonEmptyTitle.fromString(request.title);
        } catch (error) {
          return ResultUtils.error(
            new TaskCreationError(
              error instanceof Error ? error.message : "Invalid title",
              "INVALID_TITLE"
            )
          );
        }

        // Create task entity
        let thumbhash: string | undefined;
        if (request.image) {
          const { generateThumbhash } = await import(
            "../../infrastructure/utils/thumbhash"
          );
          thumbhash = await generateThumbhash(request.image);
        }
        const { task, events } = Task.create(
          taskId,
          title,
          request.category,
          thumbhash,
          request.image
        );

        // Execute in transaction (this will trigger sync)
        const transactionResult = await this.executeInTransaction<void>(
          task,
          "create",
          events
        );

        if (ResultUtils.isFailure(transactionResult)) {
          return ResultUtils.error(
            new TaskCreationError(
              transactionResult.error.message,
              transactionResult.error.code
            )
          );
        }

        return ResultUtils.ok({ taskId: task.id.value });
      },
      "Failed to create task",
      "CREATION_FAILED"
    );
  }
}
