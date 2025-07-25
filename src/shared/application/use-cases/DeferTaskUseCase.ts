import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { Result, ResultUtils } from '../../domain/Result';
import { TodoDatabase } from '../../infrastructure/database/TodoDatabase';
import { hashTask } from '../../infrastructure/utils/hashUtils';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for deferring a task
 */
export interface DeferTaskRequest {
  taskId: string;
  deferredUntil: Date;
}

/**
 * Response for deferring a task
 */
export interface DeferTaskResponse {
  taskId: string;
  deferredUntil: Date;
}

/**
 * Domain errors for task deferral
 */
export class TaskDeferralError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TaskDeferralError';
  }
}

/**
 * Use case for deferring a task
 */
@injectable()
export class DeferTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(request: DeferTaskRequest): Promise<Result<DeferTaskResponse, TaskDeferralError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new TaskDeferralError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Validate deferral date
      if (!request.deferredUntil || isNaN(request.deferredUntil.getTime())) {
        return ResultUtils.error(
          new TaskDeferralError('Invalid deferral date', 'INVALID_DEFERRAL_DATE')
        );
      }

      // Find the task
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new TaskDeferralError('Task not found', 'TASK_NOT_FOUND')
        );
      }

      // Check if task is already deferred
      if (task.isDeferred) {
        return ResultUtils.error(
          new TaskDeferralError('Task is already deferred', 'TASK_ALREADY_DEFERRED')
        );
      }

      // Defer the task (domain logic handles validation and events)
      const events = task.defer(request.deferredUntil);

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
          await this.eventBus.publishAll(events);
        }
      );

      return ResultUtils.ok({
        taskId: task.id.value,
        deferredUntil: request.deferredUntil
      });
    } catch (error) {
      return ResultUtils.error(
        new TaskDeferralError(
          `Failed to defer task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'DEFERRAL_FAILED'
        )
      );
    }
  }
}