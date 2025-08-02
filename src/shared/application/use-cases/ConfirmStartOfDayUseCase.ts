import { injectable, inject } from 'tsyringe';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { DayResetRepository } from '../../domain/repositories/DayResetRepository';
import { Result, ResultUtils } from '../../domain/Result';
import { TaskCategory } from '../../domain/types';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Action to perform on a task
 */
export type TaskAction = 'add_to_today' | 'defer' | 'move_to_backlog' | 'archive' | 'delete' | 'mark_done';

/**
 * Task selection for start of day
 */
export interface TaskSelection {
  taskId: string;
  action: TaskAction;
  deferDate?: string; // Required for 'defer' action (YYYY-MM-DD format)
}

/**
 * Request for confirming start of day
 */
export interface ConfirmStartOfDayRequest {
  userId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
  selections: TaskSelection[];
}

/**
 * Response for confirming start of day
 */
export interface ConfirmStartOfDayResponse {
  date: string;
  processedTasksCount: number;
  addedToTodayCount: number;
  deferredCount: number;
  archivedCount: number;
  deletedCount: number;
  completedCount: number;
}

/**
 * Domain errors for confirming start of day
 */
export class ConfirmStartOfDayError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ConfirmStartOfDayError';
  }
}

/**
 * Use case for confirming start of day selections
 * Implements the "Сформировать 'Сегодня'" functionality
 */
@injectable()
export class ConfirmStartOfDayUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.DAY_RESET_REPOSITORY_TOKEN) private readonly dayResetRepository: DayResetRepository
  ) {}

  async execute(request: ConfirmStartOfDayRequest): Promise<Result<ConfirmStartOfDayResponse, ConfirmStartOfDayError>> {
    try {
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
          new ConfirmStartOfDayError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Initialize counters
      let addedToTodayCount = 0;
      let deferredCount = 0;
      let archivedCount = 0;
      let deletedCount = 0;
      let completedCount = 0;

      // Process each selection
      for (const selection of request.selections) {
        const task = await this.taskRepository.findById(selection.taskId);
        if (!task) {
          continue; // Skip non-existent tasks
        }

        switch (selection.action) {
          case 'add_to_today':
            await this.dailySelectionRepository.addTaskToDay(date, selection.taskId);
            addedToTodayCount++;
            break;

          case 'defer':
            if (!selection.deferDate) {
              return ResultUtils.error(
                new ConfirmStartOfDayError('Defer date is required for defer action', 'MISSING_DEFER_DATE')
              );
            }
            try {
              const deferDate = DateOnly.fromString(selection.deferDate);
              const updatedTask = task.defer(deferDate.toDate());
              await this.taskRepository.update(updatedTask);
              deferredCount++;
            } catch (error) {
              return ResultUtils.error(
                new ConfirmStartOfDayError('Invalid defer date format', 'INVALID_DEFER_DATE')
              );
            }
            break;

          case 'move_to_backlog':
            const backlogTask = task.moveToCategory(TaskCategory.BACKLOG);
            await this.taskRepository.update(backlogTask);
            archivedCount++;
            break;

          case 'archive':
            const archivedTask = task.archive();
            await this.taskRepository.update(archivedTask);
            archivedCount++;
            break;

          case 'delete':
            await this.taskRepository.delete(selection.taskId);
            deletedCount++;
            break;

          case 'mark_done':
            const completedTask = task.complete();
            await this.taskRepository.update(completedTask);
            completedCount++;
            break;

          default:
            return ResultUtils.error(
              new ConfirmStartOfDayError(`Unknown action: ${selection.action}`, 'UNKNOWN_ACTION')
            );
        }
      }

      // Mark start of day as confirmed
      await this.dayResetRepository.markStartOfDayConfirmed(request.userId, date);

      const processedTasksCount = request.selections.length;

      return ResultUtils.ok({
        date: date.value,
        processedTasksCount,
        addedToTodayCount,
        deferredCount,
        archivedCount,
        deletedCount,
        completedCount
      });
    } catch (error) {
      return ResultUtils.error(
        new ConfirmStartOfDayError(
          `Failed to confirm start of day: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CONFIRM_FAILED'
        )
      );
    }
  }
}