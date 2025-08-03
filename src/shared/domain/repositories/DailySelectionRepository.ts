import { TaskId } from "../value-objects/TaskId";
import { DateOnly } from "../value-objects/DateOnly";

/**
 * Daily selection entry representing a task selected for a specific day
 */
export interface DailySelectionEntry {
  date: DateOnly;
  taskId: TaskId;
  completedFlag: boolean;
  createdAt: Date;
}

/**
 * Repository interface for DailySelection operations
 */
export interface DailySelectionRepository {
  /**
   * Add a task to daily selection (idempotent upsert)
   */
  addTaskToDay(date: DateOnly, taskId: TaskId): Promise<void>;

  /**
   * Remove a task from daily selection
   */
  removeTaskFromDay(date: DateOnly, taskId: TaskId): Promise<void>;

  /**
   * Get all tasks selected for a specific day
   */
  getTasksForDay(date: DateOnly): Promise<DailySelectionEntry[]>;

  /**
   * Get all task IDs selected for a specific day
   */
  getTaskIdsForDay(date: DateOnly): Promise<TaskId[]>;

  /**
   * Check if a task is selected for a specific day
   */
  isTaskSelectedForDay(date: DateOnly, taskId: TaskId): Promise<boolean>;

  /**
   * Mark a task as completed for a specific day
   */
  markTaskCompleted(
    date: DateOnly,
    taskId: TaskId,
    completed: boolean
  ): Promise<void>;

  /**
   * Get completion status of a task for a specific day
   */
  getTaskCompletionStatus(
    date: DateOnly,
    taskId: TaskId
  ): Promise<boolean | null>;

  /**
   * Get all daily selections for a date range
   */
  getDailySelectionsForRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<DailySelectionEntry[]>;

  /**
   * Clear all selections for a specific day
   */
  clearDay(date: DateOnly): Promise<void>;

  /**
   * Count tasks selected for a specific day
   */
  countTasksForDay(date: DateOnly): Promise<number>;

  /**
   * Get the most recent selection date for a task
   */
  getLastSelectionDateForTask(taskId: TaskId): Promise<DateOnly | null>;

  /**
   * Remove a task from all daily selections (used when deleting a task)
   */
  removeTaskFromAllDays(taskId: TaskId): Promise<void>;
}
