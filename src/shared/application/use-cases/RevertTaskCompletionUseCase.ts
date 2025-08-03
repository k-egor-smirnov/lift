import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { hashTask } from "../../infrastructure/utils/hashUtils";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for reverting task completion
 */
export interface RevertTaskCompletionRequest {
  taskId: string;
}

/**
 * Error thrown when task completion revert fails
 */
export class TaskCompletionRevertError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TaskCompletionRevertError";
  }
}

/**
 * Use case for reverting task completion
 */
@injectable()
export class RevertTaskCompletionUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(
    request: RevertTaskCompletionRequest
  ): Promise<Result<void, TaskCompletionRevertError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new TaskCompletionRevertError(
            "Invalid task ID format",
            "INVALID_TASK_ID"
          )
        );
      }

      // Execute in transaction
      await this.database.transaction(
        "rw",
        [this.database.tasks, this.database.eventStore],
        async () => {
          // Find the task
          const task = await this.taskRepository.findById(taskId);
          if (!task) {
            throw new TaskCompletionRevertError(
              "Task not found",
              "TASK_NOT_FOUND"
            );
          }

          // Revert completion
          const events = task.revertCompletion();

          // Save the updated task
          await this.taskRepository.save(task);

          // Publish domain events
          await this.eventBus.publishAll(events);
        }
      );

      return ResultUtils.ok(undefined);
    } catch (error) {
      if (error instanceof TaskCompletionRevertError) {
        return ResultUtils.error(error);
      }

      console.error("Unexpected error in RevertTaskCompletionUseCase:", error);
      return ResultUtils.error(
        new TaskCompletionRevertError(
          "An unexpected error occurred while reverting task completion",
          "UNEXPECTED_ERROR"
        )
      );
    }
  }
}
