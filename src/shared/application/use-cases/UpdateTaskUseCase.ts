import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../domain/value-objects/NonEmptyTitle';
import { TaskCategory } from '../../domain/types';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { Result, ResultUtils } from '../../domain/Result';
import { TodoDatabase } from '../../infrastructure/database/TodoDatabase';
import { hashTask } from '../../infrastructure/utils/hashUtils';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for updating a task
 */
export interface UpdateTaskRequest {
  taskId: string;
  title?: string;
  category?: TaskCategory;
}

/**
 * Domain errors for task updates
 */
export class TaskUpdateError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TaskUpdateError';
  }
}

/**
 * Use case for updating task title and/or category
 */
@injectable()
export class UpdateTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(request: UpdateTaskRequest): Promise<Result<void, TaskUpdateError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new TaskUpdateError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Find the task
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new TaskUpdateError('Task not found', 'TASK_NOT_FOUND')
        );
      }

      const allEvents: any[] = [];

      // Update title if provided
      if (request.title !== undefined) {
        let title: NonEmptyTitle;
        try {
          title = NonEmptyTitle.fromString(request.title);
        } catch (error) {
          return ResultUtils.error(
            new TaskUpdateError('Invalid task title: title cannot be empty', 'INVALID_TITLE')
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

      // Execute transactional operation including task, syncQueue, and eventStore
      await this.database.transaction('rw', 
        [this.database.tasks, this.database.syncQueue, this.database.eventStore], 
        async () => {
          // 1. Save the updated task
          await this.taskRepository.save(task);
          
          // 2. Add sync queue entry
          await this.database.syncQueue.add({
            entityType: 'task',
            entityId: task.id.value,
            operation: 'update',
            payloadHash: hashTask(task),
            attemptCount: 0,
            createdAt: new Date(),
            nextAttemptAt: Date.now()
          });
          
          // 3. Publish domain events
          if (allEvents.length > 0) {
            await this.eventBus.publishAll(allEvents);
          }
        }
      );

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new TaskUpdateError(
          `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'UPDATE_FAILED'
        )
      );
    }
  }
}