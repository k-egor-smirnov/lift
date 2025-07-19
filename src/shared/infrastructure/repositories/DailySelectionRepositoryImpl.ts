import { DailySelectionRepository, DailySelectionEntry } from '../../domain/repositories/DailySelectionRepository';
import { TaskId } from '../../domain/value-objects/TaskId';
import { DateOnly } from '../../domain/value-objects/DateOnly';
import { TodoDatabase, DailySelectionEntryRecord } from '../database/TodoDatabase';

/**
 * Repository implementation for DailySelection using IndexedDB
 */
export class DailySelectionRepositoryImpl implements DailySelectionRepository {
  constructor(private db: TodoDatabase) {}

  async addTaskToDay(date: DateOnly, taskId: TaskId): Promise<void> {
    // Use upsert to handle idempotent operations
    const existingEntry = await this.db.dailySelectionEntries
      .where('[date+taskId]')
      .equals([date.value, taskId.value])
      .first();

    if (!existingEntry) {
      await this.db.dailySelectionEntries.add({
        date: date.value,
        taskId: taskId.value,
        completedFlag: false,
        createdAt: new Date()
      });
    }
  }

  async removeTaskFromDay(date: DateOnly, taskId: TaskId): Promise<void> {
    await this.db.dailySelectionEntries
      .where('[date+taskId]')
      .equals([date.value, taskId.value])
      .delete();
  }

  async getTasksForDay(date: DateOnly): Promise<DailySelectionEntry[]> {
    const records = await this.db.dailySelectionEntries
      .where('date')
      .equals(date.value)
      .toArray();

    return records.map(record => this.mapRecordToEntity(record));
  }

  async getTaskIdsForDay(date: DateOnly): Promise<TaskId[]> {
    const records = await this.db.dailySelectionEntries
      .where('date')
      .equals(date.value)
      .toArray();

    return records.map(record => new TaskId(record.taskId));
  }

  async isTaskSelectedForDay(date: DateOnly, taskId: TaskId): Promise<boolean> {
    const entry = await this.db.dailySelectionEntries
      .where('[date+taskId]')
      .equals([date.value, taskId.value])
      .first();

    return entry !== undefined;
  }

  async markTaskCompleted(date: DateOnly, taskId: TaskId, completed: boolean): Promise<void> {
    await this.db.dailySelectionEntries
      .where('[date+taskId]')
      .equals([date.value, taskId.value])
      .modify({ completedFlag: completed });
  }

  async getTaskCompletionStatus(date: DateOnly, taskId: TaskId): Promise<boolean | null> {
    const entry = await this.db.dailySelectionEntries
      .where('[date+taskId]')
      .equals([date.value, taskId.value])
      .first();

    return entry ? entry.completedFlag : null;
  }

  async getDailySelectionsForRange(startDate: DateOnly, endDate: DateOnly): Promise<DailySelectionEntry[]> {
    const records = await this.db.dailySelectionEntries
      .where('date')
      .between(startDate.value, endDate.value, true, true)
      .toArray();

    return records.map(record => this.mapRecordToEntity(record));
  }

  async clearDay(date: DateOnly): Promise<void> {
    await this.db.dailySelectionEntries
      .where('date')
      .equals(date.value)
      .delete();
  }

  async countTasksForDay(date: DateOnly): Promise<number> {
    return await this.db.dailySelectionEntries
      .where('date')
      .equals(date.value)
      .count();
  }

  async getLastSelectionDateForTask(taskId: TaskId): Promise<DateOnly | null> {
    const entry = await this.db.dailySelectionEntries
      .where('taskId')
      .equals(taskId.value)
      .reverse()
      .sortBy('date');

    if (entry.length === 0) {
      return null;
    }

    return new DateOnly(entry[0].date);
  }

  /**
   * Map database record to domain entity
   */
  private mapRecordToEntity(record: DailySelectionEntryRecord): DailySelectionEntry {
    return {
      date: new DateOnly(record.date),
      taskId: new TaskId(record.taskId),
      completedFlag: record.completedFlag,
      createdAt: record.createdAt
    };
  }
}