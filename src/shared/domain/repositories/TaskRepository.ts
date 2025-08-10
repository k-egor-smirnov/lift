import { Task } from "../entities/Task";
import { TaskId } from "../value-objects/TaskId";
import { TaskCategory, TaskStatus } from "../types";
import { DateOnly } from "../value-objects/DateOnly";
import { Result } from "../Result";

/**
 * Repository interface for Task entity operations
 */
export interface TaskRepository {
  /**
   * Find a task by its ID
   */
  findById(id: TaskId): Promise<Task | null>;

  /**
   * Find all active (non-deleted) tasks
   */
  findAll(): Promise<Task[]>;

  /**
   * Find tasks by category (active only)
   */
  findByCategory(category: TaskCategory): Promise<Task[]>;

  /**
   * Find tasks by status (active only)
   */
  findByStatus(status: TaskStatus): Promise<Task[]>;

  /**
   * Find tasks by category and status (active only)
   */
  findByCategoryAndStatus(
    category: TaskCategory,
    status: TaskStatus
  ): Promise<Task[]>;

  /**
   * Find overdue tasks in INBOX category
   */
  findOverdueTasks(overdueDays: number): Promise<Task[]>;

  /**
   * Save a task (create or update)
   */
  save(task: Task): Promise<void>;

  /**
   * Save multiple tasks in a transaction
   */
  saveMany(tasks: Task[]): Promise<void>;

  /**
   * Delete a task permanently (hard delete)
   */
  delete(id: TaskId): Promise<void>;

  /**
   * Count total tasks (active only)
   */
  count(): Promise<number>;

  /**
   * Count tasks by category (active only)
   */
  countByCategory(category: TaskCategory): Promise<number>;

  /**
   * Check if a task exists
   */
  exists(id: TaskId): Promise<boolean>;

  /**
   * Find tasks created in date range
   */
  findTasksCreatedInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Task[], Error>>;

  /**
   * Find tasks completed in date range
   */
  findTasksCompletedInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Task[], Error>>;
}
