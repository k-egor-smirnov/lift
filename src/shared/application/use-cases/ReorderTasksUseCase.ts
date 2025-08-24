import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import * as tokens from "../../infrastructure/di/tokens";
import { Task } from "@/shared/domain/entities/Task";

/**
 * Request for reordering tasks
 */
export interface ReorderTasksRequest {
  taskOrders: Array<{
    taskId: string;
    order: number;
  }>;
}

/**
 * Domain errors for task reordering
 */
export class TaskReorderError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TaskReorderError";
  }
}

/**
 * Use case for reordering multiple tasks
 */
@injectable()
export class ReorderTasksUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(
    request: ReorderTasksRequest
  ): Promise<Result<void, TaskReorderError>> {
    try {
      const tasks: Task[] = [];
      const allEvents: any[] = [];

      // Validate and load all tasks
      for (const { taskId, order } of request.taskOrders) {
        let parsedTaskId: TaskId;
        try {
          parsedTaskId = TaskId.fromString(taskId);
        } catch (error) {
          return ResultUtils.error(
            new TaskReorderError(
              `Invalid task ID format: ${taskId}`,
              "INVALID_TASK_ID"
            )
          );
        }

        const taskResult = await this.taskRepository.findById(parsedTaskId);
        if (!taskResult) {
          return ResultUtils.error(
            new TaskReorderError(`Task not found: ${taskId}`, "TASK_NOT_FOUND")
          );
        }

        // Update task order
        const orderEvents = taskResult.changeOrder(order);
        allEvents.push(...orderEvents);
        tasks.push(taskResult);
      }

      // Execute transactional operation
      await this.database.transaction(
        "rw",
        [this.database.tasks, this.database.eventStore],
        async () => {
          // Save all updated tasks
          for (const task of tasks) {
            await this.taskRepository.save(task);
          }

          // Publish domain events
          if (allEvents.length > 0) {
            await this.eventBus.publishAll(allEvents);
          }
        }
      );

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new TaskReorderError(
          `Failed to reorder tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
          "REORDER_FAILED"
        )
      );
    }
  }
}
