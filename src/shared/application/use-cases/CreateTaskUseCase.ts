import { injectable, inject } from 'tsyringe';
import { Task } from '../../domain/entities/Task';
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
@injectable()
export class CreateTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
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

      // Execute transactional operation including task, syncQueue, and eventStore
      await this.database.transaction('rw', 
        [this.database.tasks, this.database.syncQueue, this.database.eventStore], 
        async () => {
          // 1. Save task
          await this.taskRepository.save(task);
          
          // 2. Add sync queue entry
          await this.database.syncQueue.add({
            entityType: 'task',
            entityId: task.id.value,
            operation: 'create',
            payloadHash: hashTask(task),
            attemptCount: 0,
            createdAt: new Date(),
            nextAttemptAt: Date.now()
          });
          
          // 3. Publish domain events (will be stored in eventStore within transaction)
          await this.eventBus.publishAll(events);
        }
      );

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