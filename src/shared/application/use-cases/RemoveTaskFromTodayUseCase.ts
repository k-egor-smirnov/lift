import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { Result, ResultUtils } from '../../domain/Result';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for removing a task from today's selection
 */
export interface RemoveTaskFromTodayRequest {
  taskId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
}

/**
 * Domain errors for removing task from today
 */
export class RemoveTaskFromTodayError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RemoveTaskFromTodayError';
  }
}

/**
 * Use case for removing a task from today's daily selection
 */
@injectable()
export class RemoveTaskFromTodayUseCase {
  constructor(
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository
  ) {}

  async execute(request: RemoveTaskFromTodayRequest): Promise<Result<void, RemoveTaskFromTodayError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new RemoveTaskFromTodayError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Parse date or use today
      let date: DateOnly;
      try {
        if (request.date) {
          date = DateOnly.fromString(request.date);
        } else {
          date = DateOnly.today();
        }
      } catch (error) {
        return ResultUtils.error(
          new RemoveTaskFromTodayError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Remove task from daily selection
      await this.dailySelectionRepository.removeTaskFromDay(date, taskId);

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new RemoveTaskFromTodayError(
          `Failed to remove task from today: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'REMOVE_FAILED'
        )
      );
    }
  }
}