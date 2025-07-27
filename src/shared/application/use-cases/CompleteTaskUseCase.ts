import { injectable, inject } from 'tsyringe';
import { Result, ResultUtils } from '../../domain/Result';
import { BaseTaskUseCase, TaskOperationError } from './BaseTaskUseCase';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { TodoDatabase } from '../../infrastructure/database/TodoDatabase';
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
export class TaskCompletionError extends TaskOperationError {
  constructor(message: string, code: string) {
    super(message, code);
    this.name = 'TaskCompletionError';
  }
}

/**
 * Use case for completing a task
 */
@injectable()
export class CompleteTaskUseCase extends BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) database: TodoDatabase
  ) {
    super(taskRepository, eventBus, database);
  }

  async execute(request: CompleteTaskRequest): Promise<Result<void, TaskCompletionError>> {
    return this.safeExecute(
      async () => {
        // Find and validate task
        const taskResult = await this.findTaskById(request.taskId);
        if (ResultUtils.isFailure(taskResult)) {
          return ResultUtils.error(
            new TaskCompletionError(taskResult.error.message, taskResult.error.code)
          );
        }

        const task = taskResult.data;
        
        // Complete the task (domain logic handles validation and events)
        const events = task.complete();

        // Execute in transaction
        const transactionResult = await this.executeInTransaction<void>(
          task,
          'update',
          events
        );

        if (ResultUtils.isFailure(transactionResult)) {
          return ResultUtils.error(
            new TaskCompletionError(transactionResult.error.message, transactionResult.error.code)
          );
        }

        return ResultUtils.ok(undefined);
      },
      'Failed to complete task',
      'COMPLETION_FAILED'
    );
  }
}