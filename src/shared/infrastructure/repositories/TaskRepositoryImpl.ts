import { injectable, inject } from "tsyringe";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { TaskCategory, TaskStatus } from "../../domain/types";
import { TodoDatabase, TaskRecord } from "../database/TodoDatabase";
import type { Result } from "../../domain/Result";
import { ResultFactory } from "../../domain/Result";
import * as tokens from "../di/tokens";

/**
 * Repository implementation for Task entity using IndexedDB
 */
@injectable()
export class TaskRepositoryImpl implements TaskRepository {
  constructor(@inject(tokens.DATABASE_TOKEN) private db: TodoDatabase) {
    console.log(db);
  }

  async findById(id: TaskId): Promise<Task | null> {
    const record = await this.db.tasks.get(id.value);
    if (!record || record.deletedAt) {
      return null;
    }
    return this.mapRecordToEntity(record);
  }

  async findAll(): Promise<Task[]> {
    const records = await this.db.tasks
      .filter((record) => !record.deletedAt)
      .sortBy("order");

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findByCategory(category: TaskCategory): Promise<Task[]> {
    const records = await this.db.tasks
      .where("category")
      .equals(category)
      .and((record) => !record.deletedAt)
      .sortBy("order");

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    const records = await this.db.tasks
      .where("status")
      .equals(status)
      .and((record) => !record.deletedAt)
      .sortBy("order");

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findByCategoryAndStatus(
    category: TaskCategory,
    status: TaskStatus
  ): Promise<Task[]> {
    const records = await this.db.tasks
      .where("category")
      .equals(category)
      .and((record) => record.status === status && !record.deletedAt)
      .sortBy("order");

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findOverdueTasks(overdueDays: number): Promise<Task[]> {
    // Use DateOnly.getCurrentDate() to respect dev mode time simulation
    const cutoffDate = DateOnly.getCurrentDate();
    cutoffDate.setDate(cutoffDate.getDate() - overdueDays);

    const records = await this.db.tasks
      .where("category")
      .equals(TaskCategory.INBOX)
      .and(
        (record) =>
          !record.deletedAt &&
          record.status === TaskStatus.ACTIVE &&
          record.inboxEnteredAt !== undefined &&
          record.inboxEnteredAt <= cutoffDate
      )
      .sortBy("order");

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async save(task: Task): Promise<void> {
    const record = this.mapEntityToRecord(task);
    await this.db.tasks.put(record);
  }

  async saveMany(tasks: Task[]): Promise<void> {
    const records = tasks.map((task) => this.mapEntityToRecord(task));
    await this.db.tasks.bulkPut(records);
  }

  async delete(id: TaskId): Promise<void> {
    await this.db.tasks.delete(id.value);
  }

  async count(): Promise<number> {
    return await this.db.tasks.filter((record) => !record.deletedAt).count();
  }

  async countByCategory(category: TaskCategory): Promise<number> {
    return await this.db.tasks
      .where("category")
      .equals(category)
      .and((record) => !record.deletedAt)
      .count();
  }

  async findDeferredTasks(): Promise<Task[]> {
    const records = await this.db.tasks
      .where("category")
      .equals(TaskCategory.DEFERRED)
      .and((record) => !record.deletedAt)
      .toArray();
    return records.map((record) => this.mapRecordToEntity(record));
  }

  async findDueDeferred(): Promise<Task[]> {
    const now = new Date();
    const records = await this.db.tasks
      .where("category")
      .equals(TaskCategory.DEFERRED)
      .and(
        (record) =>
          !record.deletedAt &&
          record.deferredUntil != null &&
          new Date(record.deferredUntil) <= now
      )
      .toArray();
    return records.map((record) => this.mapRecordToEntity(record));
  }

  async exists(id: TaskId): Promise<boolean> {
    const record = await this.db.tasks.get(id.value);
    return record !== undefined && !record.deletedAt;
  }

  async findTasksCreatedInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Task[]>> {
    try {
      const startTime = startDate.toDate().getTime();
      const endTime = endDate.toDate().getTime() + 24 * 60 * 60 * 1000 - 1; // End of day

      const records = await this.db.tasks
        .filter((record) => {
          if (record.deletedAt) return false;
          const createdTime = record.createdAt.getTime();
          return createdTime >= startTime && createdTime <= endTime;
        })
        .sortBy("createdAt");

      const tasks = records.map((record) => this.mapRecordToEntity(record));
      return ResultFactory.success(tasks);
    } catch (error) {
      return ResultFactory.failure(
        `Failed to find tasks created in date range: ${error}`
      );
    }
  }

  async findTasksCompletedInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Task[]>> {
    try {
      const startTime = startDate.toDate().getTime();
      const endTime = endDate.toDate().getTime() + 24 * 60 * 60 * 1000 - 1; // End of day

      const records = await this.db.tasks
        .filter((record) => {
          if (record.deletedAt) return false;
          if (record.status !== TaskStatus.DONE) return false;
          const updatedTime = record.updatedAt.getTime();
          return updatedTime >= startTime && updatedTime <= endTime;
        })
        .sortBy("updatedAt");

      const tasks = records.map((record) => this.mapRecordToEntity(record));
      return ResultFactory.success(tasks);
    } catch (error) {
      return ResultFactory.failure(
        `Failed to find tasks completed in date range: ${error}`
      );
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapRecordToEntity(record: TaskRecord): Task {
    return new Task(
      new TaskId(record.id),
      new NonEmptyTitle(record.title),
      record.category,
      record.status,
      record.order,
      record.createdAt,
      record.updatedAt,
      record.deletedAt,
      record.inboxEnteredAt,
      record.deferredUntil,
      record.originalCategory,
      record.note
    );
  }

  /**
   * Map domain entity to database record
   */
  private mapEntityToRecord(task: Task): TaskRecord {
    return {
      id: task.id.value,
      title: task.title.value,
      category: task.category,
      status: task.status,
      order: task.order,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      inboxEnteredAt: task.inboxEnteredAt,
      deferredUntil: task.deferredUntil,
      originalCategory: task.originalCategory,
      note: task.note,
    };
  }
}
