import { injectable } from 'tsyringe';
import { Result, ResultUtils } from '../../domain/Result';
import { BaseTaskUseCase, TaskOperationError } from './BaseTaskUseCase';

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