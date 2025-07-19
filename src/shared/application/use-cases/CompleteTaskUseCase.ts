import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { Result, ResultUtils } from '../../domain/Result';
import { TodoDatabase } from '../../infrastructure/database/TodoDatabase';
import { hashTask } from '../../infrastructure/utils/hashUtils';
import * as tokens from '../../infrastructure/di/tokens';

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
@injectable()
export class CompleteTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
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
          
          // 3. Publish domain events (includes statistics capture)
          await this.eventBus.publishAll(events);
        }
      );

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