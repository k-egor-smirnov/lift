import { Task } from '../../domain/entities/Task';
import { TaskId } from '../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../domain/value-objects/NonEmptyTitle';
import { TaskCategory } from '../../domain/types';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { Result, ResultUtils } from '../../domain/Result';

/**
 * Request for creating a new task
 */
export interface CreateTaskRequest {
  title: string;
  category: TaskCategory;
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
export class TaskCreationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TaskCreationError';
  }
}

/**
 * Use case for creating a new task
 */
export class CreateTaskUseCase {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(request: CreateTaskRequest): Promise<Result<CreateTaskResponse, TaskCreationError>> {
    try {
      // Validate title
      let title: NonEmptyTitle;
      try {
        title = NonEmptyTitle.fromString(request.title);
      } catch (error) {
        return ResultUtils.error(
          new TaskCreationError('Invalid task title: title cannot be empty', 'INVALID_TITLE')
        );
      }

      // Generate new task ID
      const taskId = TaskId.generate();

      // Create task with domain events
      const { task, events } = Task.create(taskId, title, request.category);

      // Save task
      await this.taskRepository.save(task);

      // Publish domain events
      await this.eventBus.publishAll(events);

      return ResultUtils.ok({
        taskId: taskId.value
      });
    } catch (error) {
      return ResultUtils.error(
        new TaskCreationError(
          `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CREATION_FAILED'
        )
      );
    }
  }
}