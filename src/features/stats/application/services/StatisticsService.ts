import {
  TodoDatabase,
  StatsDailyRecord,
} from "../../../../shared/infrastructure/database/TodoDatabase";
import { TaskCategory } from "../../../../shared/domain/types";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

export interface DailyStatistics {
  date: string; // YYYY-MM-DD
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface WeeklyStatistics {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface MonthlyStatistics {
  month: string; // YYYY-MM
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface StatisticsPeriod {
  type: "day" | "week" | "month";
  date: Date;
}

/**
 * Service for calculating and managing task completion statistics
 * Handles completion tracking by category, inbox review tracking, and aggregation
 */
export class StatisticsService {
  constructor(private database: TodoDatabase) {}

  /**
   * Record a task completion for statistics
   * Called when a task is completed to track completion by category
   */
  async recordTaskCompletion(
    _taskId: string,
    category: TaskCategory,
    completedAt: Date = new Date()
  ): Promise<void> {
    const dateKey = this.formatDateKey(completedAt);

    await this.database.transaction(
      "rw",
      [this.database.statsDaily],
      async () => {
        const existing = await this.database.statsDaily.get(dateKey);

        if (existing) {
          // Update existing record
          const updates: Partial<StatsDailyRecord> = {};

          switch (category) {
            case TaskCategory.SIMPLE:
              updates.simpleCompleted = existing.simpleCompleted + 1;
              break;
            case TaskCategory.FOCUS:
              updates.focusCompleted = existing.focusCompleted + 1;
              break;
            // INBOX tasks don't count as completed until they're reviewed and moved
          }

          await this.database.statsDaily.update(dateKey, updates);
        } else {
          // Create new record
          const newRecord: StatsDailyRecord = {
            date: dateKey,
            simpleCompleted: category === TaskCategory.SIMPLE ? 1 : 0,
            focusCompleted: category === TaskCategory.FOCUS ? 1 : 0,
            inboxReviewed: 0,
            createdAt: new Date(),
          };

          await this.database.statsDaily.add(newRecord);
        }
      }
    );
  }

  /**
   * Record an inbox review (first move from INBOX to any other category)
   * Called when a task is moved from INBOX for the first time
   */
  async recordInboxReview(
    _taskId: string,
    reviewedAt: Date = new Date()
  ): Promise<void> {
    const dateKey = this.formatDateKey(reviewedAt);

    await this.database.transaction(
      "rw",
      [this.database.statsDaily],
      async () => {
        const existing = await this.database.statsDaily.get(dateKey);

        if (existing) {
          await this.database.statsDaily.update(dateKey, {
            inboxReviewed: existing.inboxReviewed + 1,
          });
        } else {
          const newRecord: StatsDailyRecord = {
            date: dateKey,
            simpleCompleted: 0,
            focusCompleted: 0,
            inboxReviewed: 1,
            createdAt: new Date(),
          };

          await this.database.statsDaily.add(newRecord);
        }
      }
    );
  }

  /**
   * Revert a task completion (when task completion is undone)
   */
  async revertTaskCompletion(
    _taskId: string,
    category: TaskCategory,
    completedAt: Date
  ): Promise<void> {
    const dateKey = this.formatDateKey(completedAt);

    await this.database.transaction(
      "rw",
      [this.database.statsDaily],
      async () => {
        const existing = await this.database.statsDaily.get(dateKey);

        if (existing) {
          const updates: Partial<StatsDailyRecord> = {};

          switch (category) {
            case TaskCategory.SIMPLE:
              updates.simpleCompleted = Math.max(
                0,
                existing.simpleCompleted - 1
              );
              break;
            case TaskCategory.FOCUS:
              updates.focusCompleted = Math.max(0, existing.focusCompleted - 1);
              break;
          }

          await this.database.statsDaily.update(dateKey, updates);
        }
      }
    );
  }

  /**
   * Get daily statistics for a specific date
   */
  async getDailyStatistics(date: Date): Promise<DailyStatistics> {
    const dateKey = this.formatDateKey(date);
    const record = await this.database.statsDaily.get(dateKey);

    return {
      date: dateKey,
      simpleCompleted: record?.simpleCompleted ?? 0,
      focusCompleted: record?.focusCompleted ?? 0,
      inboxReviewed: record?.inboxReviewed ?? 0,
    };
  }

  /**
   * Get weekly statistics for the week containing the given date
   * Uses ISO week (Monday to Sunday)
   */
  async getWeeklyStatistics(date: Date): Promise<WeeklyStatistics> {
    const { weekStart, weekEnd } = this.getISOWeekBounds(date);

    const records = await this.database.statsDaily
      .where("date")
      .between(
        this.formatDateKey(weekStart),
        this.formatDateKey(weekEnd),
        true,
        true
      )
      .toArray();

    const aggregated = records.reduce(
      (acc, record) => ({
        simpleCompleted: acc.simpleCompleted + record.simpleCompleted,
        focusCompleted: acc.focusCompleted + record.focusCompleted,
        inboxReviewed: acc.inboxReviewed + record.inboxReviewed,
      }),
      { simpleCompleted: 0, focusCompleted: 0, inboxReviewed: 0 }
    );

    return {
      weekStart: this.formatDateKey(weekStart),
      weekEnd: this.formatDateKey(weekEnd),
      ...aggregated,
    };
  }

  /**
   * Get monthly statistics for the month containing the given date
   * Uses calendar month (1st to last day of month)
   */
  async getMonthlyStatistics(date: Date): Promise<MonthlyStatistics> {
    const { monthStart, monthEnd } = this.getCalendarMonthBounds(date);

    const records = await this.database.statsDaily
      .where("date")
      .between(
        this.formatDateKey(monthStart),
        this.formatDateKey(monthEnd),
        true,
        true
      )
      .toArray();

    const aggregated = records.reduce(
      (acc, record) => ({
        simpleCompleted: acc.simpleCompleted + record.simpleCompleted,
        focusCompleted: acc.focusCompleted + record.focusCompleted,
        inboxReviewed: acc.inboxReviewed + record.inboxReviewed,
      }),
      { simpleCompleted: 0, focusCompleted: 0, inboxReviewed: 0 }
    );

    return {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      ...aggregated,
    };
  }

  /**
   * Get statistics for multiple days (for charts and trends)
   */
  async getDailyStatisticsRange(
    startDate: Date,
    endDate: Date
  ): Promise<DailyStatistics[]> {
    const startKey = this.formatDateKey(startDate);
    const endKey = this.formatDateKey(endDate);

    const records = await this.database.statsDaily
      .where("date")
      .between(startKey, endKey, true, true)
      .toArray();

    // Create a map for quick lookup
    const recordMap = new Map(records.map((r) => [r.date, r]));

    // Generate all dates in range and fill with data or zeros
    const result: DailyStatistics[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = this.formatDateKey(currentDate);
      const record = recordMap.get(dateKey);

      result.push({
        date: dateKey,
        simpleCompleted: record?.simpleCompleted ?? 0,
        focusCompleted: record?.focusCompleted ?? 0,
        inboxReviewed: record?.inboxReviewed ?? 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Create nightly snapshot for the given date
   * This consolidates any missing statistics from events
   */
  async createNightlySnapshot(date: Date = new Date()): Promise<void> {
    const dateKey = this.formatDateKey(date);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Calculate statistics from actual task data for the day
    const [completedTasks, reviewedTasks] = await Promise.all([
      this.getCompletedTasksForDay(startOfDay, endOfDay),
      this.getReviewedTasksForDay(startOfDay, endOfDay),
    ]);

    // Aggregate by category
    const simpleCompleted = completedTasks.filter(
      (t) => t.category === TaskCategory.SIMPLE
    ).length;
    const focusCompleted = completedTasks.filter(
      (t) => t.category === TaskCategory.FOCUS
    ).length;
    const inboxReviewed = reviewedTasks.length;

    // Upsert the snapshot
    await this.database.transaction(
      "rw",
      [this.database.statsDaily],
      async () => {
        const existing = await this.database.statsDaily.get(dateKey);

        if (existing) {
          await this.database.statsDaily.update(dateKey, {
            simpleCompleted,
            focusCompleted,
            inboxReviewed,
          });
        } else {
          await this.database.statsDaily.add({
            date: dateKey,
            simpleCompleted,
            focusCompleted,
            inboxReviewed,
            createdAt: new Date(),
          });
        }
      }
    );
  }

  /**
   * Run nightly snapshot for all missing days up to today
   */
  async runNightlySnapshotCatchup(): Promise<void> {
    const today = new Date();
    const existingRecords = await this.database.statsDaily.toArray();
    const existingDates = new Set(existingRecords.map((r) => r.date));

    // Find the earliest task creation date
    const earliestTask = await this.database.tasks.orderBy("createdAt").first();

    if (!earliestTask) return; // No tasks, no snapshots needed

    const startDate = new Date(earliestTask.createdAt);
    startDate.setHours(0, 0, 0, 0);

    const currentDate = new Date(startDate);

    while (currentDate <= today) {
      const dateKey = this.formatDateKey(currentDate);

      if (!existingDates.has(dateKey)) {
        // Create a new date object for the snapshot to avoid timezone issues
        const snapshotDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate()
        );
        await this.createNightlySnapshot(snapshotDate);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Private helper methods

  private formatDateKey(date: Date): string {
    return DateOnly.fromDate(date).value;
  }

  private getISOWeekBounds(date: Date): { weekStart: Date; weekEnd: Date } {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  }

  private getCalendarMonthBounds(date: Date): {
    monthStart: Date;
    monthEnd: Date;
  } {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    return { monthStart, monthEnd };
  }

  private async getCompletedTasksForDay(startOfDay: Date, endOfDay: Date) {
    // Get tasks that were completed on this day by checking task logs
    const completionLogs = await this.database.taskLogs
      .where("createdAt")
      .between(startOfDay, endOfDay, true, true)
      .and((log) => log.type === "SYSTEM" && log.message.includes("completed"))
      .toArray();

    const taskIds = completionLogs
      .map((log) => log.taskId)
      .filter((id): id is string => Boolean(id));

    if (taskIds.length === 0) return [];

    // Get the tasks and their categories at completion time
    // Note: We need to get the category at the time of completion, not current category
    const tasks = await this.database.tasks
      .where("id")
      .anyOf(taskIds)
      .toArray();

    // For each task, we need to determine what category it was in when completed
    // This is complex because category might have changed after completion
    // For now, we'll use current category as approximation
    // TODO: Store category in completion log metadata for accuracy
    return tasks;
  }

  private async getReviewedTasksForDay(startOfDay: Date, endOfDay: Date) {
    // Get tasks that were reviewed (moved from INBOX) on this day
    const reviewLogs = await this.database.taskLogs
      .where("createdAt")
      .between(startOfDay, endOfDay, true, true)
      .and(
        (log) =>
          log.type === "SYSTEM" && log.message.includes("moved from INBOX")
      )
      .toArray();

    return reviewLogs.map((log) => ({ taskId: log.taskId }));
  }
}
