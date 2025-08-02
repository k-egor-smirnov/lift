import { injectable, inject } from 'tsyringe';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { DayResetRepository } from '../../domain/repositories/DayResetRepository';
import { Result, ResultUtils } from '../../domain/Result';
import { taskEventBus } from '../../infrastructure/events/TaskEventBus';
import { TaskEventType } from '../../domain/events/TaskEvent';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Request for day restore
 */
export interface RestoreDayRequest {
  userId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
}

/**
 * Response for day restore
 */
export interface RestoreDayResponse {
  resetEventId: string;
  date: string;
  snapshotId: string;
  restoredTasksCount: number;
  wasAlreadyRestored: boolean;
}

/**
 * Domain errors for day restore
 */
export class RestoreDayError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RestoreDayError';
  }
}

/**
 * Use case for restoring day from snapshot
 * Implements the "Вернуть как было" functionality
 */
@injectable()
export class RestoreDayUseCase {
  constructor(
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.DAY_RESET_REPOSITORY_TOKEN) private readonly dayResetRepository: DayResetRepository
  ) {}

  async execute(request: RestoreDayRequest): Promise<Result<RestoreDayResponse, RestoreDayError>> {
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
          new RestoreDayError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Check if restore is available
      const isRestoreAvailable = await this.dayResetRepository.isRestoreAvailable(request.userId, date);
      if (!isRestoreAvailable) {
        return ResultUtils.error(
          new RestoreDayError('Restore not available for this date', 'RESTORE_NOT_AVAILABLE')
        );
      }

      // Get reset metadata
      const metadata = await this.dayResetRepository.getDayResetMetadata(request.userId);
      if (!metadata) {
        return ResultUtils.error(
          new RestoreDayError('No reset metadata found', 'NO_METADATA')
        );
      }

      // Check if already restored (idempotency)
      if (metadata.lastStartConfirmedDate && metadata.lastStartConfirmedDate.equals(date)) {
        return ResultUtils.ok({
          resetEventId: metadata.resetEventId,
          date: date.value,
          snapshotId: metadata.lastSnapshotId,
          restoredTasksCount: 0,
          wasAlreadyRestored: true
        });
      }

      // Restore from snapshot
      await this.dailySelectionRepository.restoreFromSnapshot(date, metadata.lastSnapshotId);

      // Get count of restored tasks
      const restoredTasks = await this.dailySelectionRepository.getTasksForDay(date);
      const restoredTasksCount = restoredTasks.length;

      // Mark as confirmed to prevent showing modal again
      await this.dayResetRepository.markStartOfDayConfirmed(request.userId, date);

      // Emit restore event
      taskEventBus.emit({
        type: TaskEventType.DAY_RESTORED,
        taskId: '', // Not task-specific
        timestamp: new Date(),
        data: {
          date: date.value,
          resetEventId: metadata.resetEventId,
          snapshotId: metadata.lastSnapshotId,
          restoredTasksCount
        }
      });

      return ResultUtils.ok({
        resetEventId: metadata.resetEventId,
        date: date.value,
        snapshotId: metadata.lastSnapshotId,
        restoredTasksCount,
        wasAlreadyRestored: false
      });
    } catch (error) {
      return ResultUtils.error(
        new RestoreDayError(
          `Failed to restore day: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'RESTORE_FAILED'
        )
      );
    }
  }
}