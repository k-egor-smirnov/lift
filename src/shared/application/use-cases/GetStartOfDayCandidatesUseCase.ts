import { injectable, inject } from "tsyringe";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { Task } from "../../domain/entities/Task";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../domain/repositories/DailySelectionRepository";
import { DayResetRepository } from "../../domain/repositories/DayResetRepository";
import { Result, ResultUtils } from "../../domain/Result";
import { TaskCategory, TaskStatus } from "../../domain/types";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for getting start of day candidates
 */
export interface GetStartOfDayCandidatesRequest {
  userId: string;
  date?: string; // Optional, defaults to today (YYYY-MM-DD format)
}

/**
 * Task candidate for start of day modal
 */
export interface StartOfDayCandidate {
  task: Task;
  category: "due_today" | "overdue" | "returning" | "missed" | "stale_inbox";
  daysInCategory?: number; // For stale inbox
}

/**
 * Grouped candidates by category
 */
export interface StartOfDayCandidateGroups {
  dueToday: StartOfDayCandidate[];
  overdue: StartOfDayCandidate[];
  returning: StartOfDayCandidate[];
  missed: StartOfDayCandidate[];
  staleInbox: StartOfDayCandidate[];
}

/**
 * Response for getting start of day candidates
 */
export interface GetStartOfDayCandidatesResponse {
  date: string;
  shouldShowModal: boolean;
  isRestoreAvailable: boolean;
  candidates: StartOfDayCandidateGroups;
  totalCount: number;
}

/**
 * Domain errors for getting start of day candidates
 */
export class GetStartOfDayCandidatesError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "GetStartOfDayCandidatesError";
  }
}

/**
 * Use case for getting candidates for start of day modal
 */
@injectable()
export class GetStartOfDayCandidatesUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN)
    private readonly dailySelectionRepository: DailySelectionRepository,
    @inject(tokens.DAY_RESET_REPOSITORY_TOKEN)
    private readonly dayResetRepository: DayResetRepository
  ) {}

  async execute(
    request: GetStartOfDayCandidatesRequest
  ): Promise<
    Result<GetStartOfDayCandidatesResponse, GetStartOfDayCandidatesError>
  > {
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
          new GetStartOfDayCandidatesError(
            "Invalid date format",
            "INVALID_DATE"
          )
        );
      }

      // Check if modal should be shown
      const shouldShowModal =
        await this.dayResetRepository.shouldShowStartOfDayModal(
          request.userId,
          date
        );

      console.log("checked show", request.userId, date, shouldShowModal);

      // Check if restore is available
      const isRestoreAvailable =
        await this.dayResetRepository.isRestoreAvailable(request.userId, date);

      // Initialize candidate groups
      const candidates: StartOfDayCandidateGroups = {
        dueToday: [],
        overdue: [],
        returning: [],
        missed: [],
        staleInbox: [],
      };

      console.log(11, shouldShowModal);

      if (shouldShowModal) {
        // Get all active tasks
        const allTasks = await this.taskRepository.findAll();
        const activeTasks = allTasks.filter((task) => task.isActive);
        const today = date.toDate();

        console.log(321, activeTasks, allTasks);

        for (const task of activeTasks) {
          // Due today/overdue tasks
          if (task.deferredUntil) {
            if (this.isSameDay(task.deferredUntil, today)) {
              candidates.dueToday.push({
                task,
                category: "due_today",
              });
            } else if (task.deferredUntil < today) {
              candidates.overdue.push({
                task,
                category: "overdue",
              });
            }
          }

          // Returning tasks (defer_until <= today)
          if (task.deferredUntil && task.deferredUntil <= today) {
            candidates.returning.push({
              task,
              category: "returning",
            });
          }

          // Stale inbox tasks (inbox >= 3 days)
          if (task.category === TaskCategory.INBOX && task.inboxEnteredAt) {
            const daysSinceInbox = Math.floor(
              (today.getTime() - task.inboxEnteredAt.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            if (daysSinceInbox >= 3) {
              candidates.staleInbox.push({
                task,
                category: "stale_inbox",
                daysInCategory: daysSinceInbox,
              });
            }
          }
        }

        // Get missed tasks from previous days
        const missedEntries =
          await this.dailySelectionRepository.getMissedTasksForDay(date);
        for (const entry of missedEntries) {
          const task = await this.taskRepository.findById(entry.taskId);
          if (task && task.isActive) {
            candidates.missed.push({
              task,
              category: "missed",
            });
          }
        }
      }

      // Calculate total count
      const totalCount = Object.values(candidates).reduce(
        (sum, group) => sum + group.length,
        0
      );

      return ResultUtils.ok({
        date: date.value,
        shouldShowModal,
        isRestoreAvailable,
        candidates,
        totalCount,
      });
    } catch (error) {
      return ResultUtils.error(
        new GetStartOfDayCandidatesError(
          `Failed to get start of day candidates: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "GET_CANDIDATES_FAILED"
        )
      );
    }
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}
