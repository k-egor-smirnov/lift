import { Task } from '../../domain/entities/Task';
import { TaskId } from '../../domain/value-objects/TaskId';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { Result, ResultUtils } from '../../domain/Result';

/**
 * Request for completing a task
 */
export interface CompleteTaskRequest {
  taskId: string;
}

/**
 * Domain errors for task completion
 */
export class TaskCompletionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TaskCompletionError';
  }
}

/**
 * Use case for completing a task
 */
export class CompleteTaskUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(request: CompleteTaskRequest): Promise<Result<void, TaskCompletionError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new TaskCompletionError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Find the task
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new TaskCompletionError('Task not found', 'TASK_NOT_FOUND')
        );
      }

      // Complete the task (domain logic handles validation and events)
      const events = task.complete();

      // Save the updated task
      await this.taskRepository.save(task);

      // Publish domain events (includes statistics capture)
      await this.eventBus.publishAll(events);

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new TaskCompletionError(
          `Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'COMPLETION_FAILED'
        )
      );
    }
  }
}