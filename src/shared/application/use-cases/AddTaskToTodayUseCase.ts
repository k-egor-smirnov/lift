import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { Result, ResultUtils } from '../../domain/Result';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for adding a task to today's selection
 */
export interface AddTaskToTodayRequest {
  taskId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
}

/**
 * Domain errors for adding task to today
 */
export class AddTaskToTodayError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AddTaskToTodayError';
  }
}

/**
 * Use case for adding a task to today's daily selection
 */
@injectable()
export class AddTaskToTodayUseCase {
  constructor(
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository
  ) {}

  async execute(request: AddTaskToTodayRequest): Promise<Result<void, AddTaskToTodayError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new AddTaskToTodayError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Parse date or use today (validate before checking task existence)
      let date: DateOnly;
      try {
        if (request.date) {
          date = DateOnly.fromString(request.date);
        } else {
          date = DateOnly.today();
        }
      } catch (error) {
        return ResultUtils.error(
          new AddTaskToTodayError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Verify task exists
      const task = await this.taskRepository.findById(taskId);
      if (!task) {
        return ResultUtils.error(
          new AddTaskToTodayError('Task not found', 'TASK_NOT_FOUND')
        );
      }

      // Add task to daily selection (idempotent operation)
      await this.dailySelectionRepository.addTaskToDay(date, taskId);

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new AddTaskToTodayError(
          `Failed to add task to today: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'ADD_FAILED'
        )
      );
    }
  }
}