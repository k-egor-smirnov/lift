import { injectable, inject } from "tsyringe";
import {
  DailySelectionRepository,
  DailySelectionEntry,
} from "../../domain/repositories/DailySelectionRepository";
import { TaskId } from "../../domain/value-objects/TaskId";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import {
  TodoDatabase,
  DailySelectionEntryRecord,
} from "../database/TodoDatabase";
import * as tokens from "../di/tokens";
import { ulid } from "ulid";

/**
 * Repository implementation for DailySelection using IndexedDB
 */
@injectable()
export class DailySelectionRepositoryImpl implements DailySelectionRepository {
  constructor(@inject(tokens.DATABASE_TOKEN) private db: TodoDatabase) {}

  async addTaskToDay(date: DateOnly, taskId: TaskId): Promise<void> {
    // Use upsert to handle idempotent operations
    const existingEntry = await this.db.dailySelectionEntries
      .where("[date+taskId]")
      .equals([date.value, taskId.value])
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .first();

    if (!existingEntry) {
      await this.db.dailySelectionEntries.add({
        id: ulid(),
        date: date.value,
        taskId: taskId.value,
        completedFlag: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: undefined,
      });
    } else if (existingEntry.deletedAt) {
      // Если запись была soft-удалена, восстанавливаем её
      await this.db.dailySelectionEntries.update(existingEntry.id, {
        deletedAt: undefined,
        completedFlag: false,
        createdAt: new Date(),
      });
    }
  }

  async removeTaskFromDay(date: DateOnly, taskId: TaskId): Promise<void> {
    const now = new Date();
    // Используем soft delete вместо физического удаления
    await this.db.dailySelectionEntries
      .where("[date+taskId]")
      .equals([date.value, taskId.value])
      .modify({ deletedAt: now, updatedAt: now });
  }

  async getTasksForDay(date: DateOnly): Promise<DailySelectionEntry[]> {
    const records = await this.db.dailySelectionEntries
      .where("date")
      .equals(date.value)
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .toArray();

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async getTaskIdsForDay(date: DateOnly): Promise<TaskId[]> {
    const records = await this.db.dailySelectionEntries
      .where("date")
      .equals(date.value)
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .toArray();

    return records.map((record) => new TaskId(record.taskId));
  }

  async isTaskSelectedForDay(date: DateOnly, taskId: TaskId): Promise<boolean> {
    const entry = await this.db.dailySelectionEntries
      .where("[date+taskId]")
      .equals([date.value, taskId.value])
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .first();

    return entry !== undefined;
  }

  async markTaskCompleted(
    date: DateOnly,
    taskId: TaskId,
    completed: boolean
  ): Promise<void> {
    await this.db.dailySelectionEntries
      .where("[date+taskId]")
      .equals([date.value, taskId.value])
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .modify({ completedFlag: completed, updatedAt: Date.now() });
  }

  async getTaskCompletionStatus(
    date: DateOnly,
    taskId: TaskId
  ): Promise<boolean | null> {
    const entry = await this.db.dailySelectionEntries
      .where("[date+taskId]")
      .equals([date.value, taskId.value])
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .first();

    return entry ? entry.completedFlag : null;
  }

  async getDailySelectionsForRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<DailySelectionEntry[]> {
    const records = await this.db.dailySelectionEntries
      .where("date")
      .between(startDate.value, endDate.value, true, true)
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .toArray();

    return records.map((record) => this.mapRecordToEntity(record));
  }

  async clearDay(date: DateOnly): Promise<void> {
    // Используем soft delete для всех записей дня
    await this.db.dailySelectionEntries
      .where("date")
      .equals(date.value)
      .filter((record) => !record.deletedAt) // Только неудаленные записи
      .modify({ deletedAt: new Date(), updatedAt: Date.now() });
  }

  async countTasksForDay(date: DateOnly): Promise<number> {
    return await this.db.dailySelectionEntries
      .where("date")
      .equals(date.value)
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .count();
  }

  async getLastSelectionDateForTask(taskId: TaskId): Promise<DateOnly | null> {
    const entry = await this.db.dailySelectionEntries
      .where("taskId")
      .equals(taskId.value)
      .filter((record) => !record.deletedAt) // Исключаем удаленные записи
      .reverse()
      .sortBy("date");

    if (entry.length === 0) {
      return null;
    }

    return new DateOnly(entry[0].date);
  }

  async removeTaskFromAllDays(taskId: TaskId): Promise<void> {
    // Используем soft delete для всех записей задачи
    await this.db.dailySelectionEntries
      .where("taskId")
      .equals(taskId.value)
      .filter((record) => !record.deletedAt) // Только неудаленные записи
      .modify({ deletedAt: new Date(), updatedAt: Date.now() });
  }

  /**
   * Map database record to domain entity
   */
  private mapRecordToEntity(
    record: DailySelectionEntryRecord
  ): DailySelectionEntry {
    return {
      date: new DateOnly(record.date),
      taskId: new TaskId(record.taskId),
      completedFlag: record.completedFlag,
      createdAt: record.createdAt,
    };
  }
}
