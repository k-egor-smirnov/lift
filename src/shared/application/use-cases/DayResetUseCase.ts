import { injectable, inject } from 'tsyringe';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { DailySelectionRepository } from '../../domain/repositories/DailySelectionRepository';
import { DayResetRepository } from '../../domain/repositories/DayResetRepository';
import { Result, ResultUtils } from '../../domain/Result';
import { taskEventBus } from '../../infrastructure/events/TaskEventBus';
import { TaskEventType } from '../../domain/events/TaskEvent';
import { TaskStatus } from '../../domain/types';
import * as tokens from '../../infrastructure/di/tokens';
import { ulid } from 'ulid';

/**
 * Request for day reset
 */
export interface DayResetRequest {
  userId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
  dayStartAt?: number; // Hour when day starts (0-23), defaults to 0
}

/**
 * Response for day reset
 */
export interface DayResetResponse {
  resetEventId: string;
  date: string;
  snapshotId: string;
  movedToMissedCount: number;
  returningTasksCount: number;
  staleInboxTasksCount: number;
  isIdempotent: boolean; // true if this was already done today
}

/**
 * Domain errors for day reset
 */
export class DayResetError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DayResetError';
  }
}

/**
 * Use case for performing daily reset
 * Implements the hard reset logic with idempotency
 */
@injectable()
export class DayResetUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) private readonly taskRepository: TaskRepository,
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN) private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.DAY_RESET_REPOSITORY_TOKEN) private readonly dayResetRepository: DayResetRepository
  ) {}

  async execute(request: DayResetRequest): Promise<Result<DayResetResponse, DayResetError>> {
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
          new DayResetError('Invalid date format', 'INVALID_DATE')
        );
      }

      // Check if reset is needed (idempotency check)
      const needsReset = await this.dayResetRepository.needsDayReset(request.userId, date);
      
      if (!needsReset) {
        // Already reset today, return existing metadata
        const metadata = await this.dayResetRepository.getDayResetMetadata(request.userId);
        if (metadata && metadata.lastResetDate.equals(date)) {
          return ResultUtils.ok({
            resetEventId: metadata.resetEventId,
            date: date.value,
            snapshotId: metadata.lastSnapshotId,
            movedToMissedCount: 0,
            returningTasksCount: 0,
            staleInboxTasksCount: 0,
            isIdempotent: true
          });
        }
      }

      // Generate reset event ID
      const resetEventId = ulid();

      // Emit reset triggered event
      taskEventBus.emit({
        type: TaskEventType.DAY_RESET_TRIGGERED,
        taskId: '', // Not task-specific
        timestamp: new Date(),
        data: {
          date: date.value,
          resetEventId,
          snapshotId: '' // Will be set after snapshot creation
        }
      });

      // 2.1. Create snapshot of current "Today"
      const snapshotId = await this.dailySelectionRepository.createDaySnapshot(date);

      // 2.2. Move all incomplete tasks from "Today" to "Missed"
      const movedToMissedCount = await this.dailySelectionRepository.moveIncompleteTodayToMissed(date);

      // 2.3. Update task statuses
      const returningTasks = await this.dailySelectionRepository.getReturningTasks(date);
      const staleInboxTasks = await this.dailySelectionRepository.getStaleInboxTasks(date);

      // Mark returning tasks (defer_until <= today)
      for (const taskId of returningTasks) {
        const task = await this.taskRepository.findById(taskId);
        if (task && task.deferredUntil && task.deferredUntil <= new Date()) {
          // Clear deferred status
          await this.taskRepository.save(task.undefer());
        }
      }

      // Mark stale inbox tasks (inbox >= 3 days)
      for (const taskId of staleInboxTasks) {
        const task = await this.taskRepository.findById(taskId);
        if (task && task.inboxEnteredAt) {
          const daysSinceInbox = Math.floor(
            (date.toDate().getTime() - task.inboxEnteredAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceInbox >= 3) {
            // Task is stale - could add a flag or metadata here
            // For now, we just identify them for the modal
          }
        }
      }

      // 2.4. Update reset metadata
      await this.dayResetRepository.upsertDayResetMetadata({
        userId: request.userId,
        resetEventId,
        lastSnapshotId: snapshotId,
        lastResetDate: date,
        lastStartConfirmedDate: null // Reset confirmation status
      });

      // Emit reset completed event
      taskEventBus.emit({
        type: TaskEventType.DAY_RESET_COMPLETED,
        taskId: '', // Not task-specific
        timestamp: new Date(),
        data: {
          date: date.value,
          resetEventId,
          movedToMissedCount
        }
      });

      return ResultUtils.ok({
        resetEventId,
        date: date.value,
        snapshotId,
        movedToMissedCount,
        returningTasksCount: returningTasks.length,
        staleInboxTasksCount: staleInboxTasks.length,
        isIdempotent: false
      });
    } catch (error) {
      return ResultUtils.error(
        new DayResetError(
          `Failed to reset day: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'RESET_FAILED'
        )
      );
    }
  }
}