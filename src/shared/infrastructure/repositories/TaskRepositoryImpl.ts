import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { Task } from '../../domain/entities/Task';
import { TaskId } from '../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../domain/types';
import { TodoDatabase, TaskRecord } from '../database/TodoDatabase';

/**
 * Repository implementation for Task entity using IndexedDB
 */
export class TaskRepositoryImpl implements TaskRepository {
  constructor(private db: TodoDatabase) {}

  async findById(id: TaskId): Promise<Task | null> {
    const record = await this.db.tasks.get(id.value);
    if (!record || record.deletedAt) {
      return null;
    }
    return this.mapRecordToEntity(record);
  }

  async findAll(): Promise<Task[]> {
    const records = await this.db.tasks
      .filter(record => !record.deletedAt)
      .toArray();
    
    return records.map(record => this.mapRecordToEntity(record));
  }

  async findByCategory(category: TaskCategory): Promise<Task[]> {
    const records = await this.db.tasks
      .where('category')
      .equals(category)
      .and(record => !record.deletedAt)
      .toArray();
    
    return records.map(record => this.mapRecordToEntity(record));
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    const records = await this.db.tasks
      .where('status')
      .equals(status)
      .and(record => !record.deletedAt)
      .toArray();
    
    return records.map(record => this.mapRecordToEntity(record));
  }

  async findByCategoryAndStatus(category: TaskCategory, status: TaskStatus): Promise<Task[]> {
    const records = await this.db.tasks
      .where('category')
      .equals(category)
      .and(record => record.status === status && !record.deletedAt)
      .toArray();
    
    return records.map(record => this.mapRecordToEntity(record));
  }

  async findOverdueTasks(overdueDays: number): Promise<Task[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - overdueDays);

    const records = await this.db.tasks
      .where('category')
      .equals(TaskCategory.INBOX)
      .and(record => 
        !record.deletedAt && 
        record.status === TaskStatus.ACTIVE &&
        record.inboxEnteredAt !== undefined && 
        record.inboxEnteredAt <= cutoffDate
      )
      .toArray();
    
    return records.map(record => this.mapRecordToEntity(record));
  }

  async save(task: Task): Promise<void> {
    const record = this.mapEntityToRecord(task);
    await this.db.tasks.put(record);
  }

  async saveMany(tasks: Task[]): Promise<void> {
    const records = tasks.map(task => this.mapEntityToRecord(task));
    await this.db.tasks.bulkPut(records);
  }

  async delete(id: TaskId): Promise<void> {
    await this.db.tasks.delete(id.value);
  }

  async count(): Promise<number> {
    return await this.db.tasks
      .filter(record => !record.deletedAt)
      .count();
  }

  async countByCategory(category: TaskCategory): Promise<number> {
    return await this.db.tasks
      .where('category')
      .equals(category)
      .and(record => !record.deletedAt)
      .count();
  }

  async exists(id: TaskId): Promise<boolean> {
    const record = await this.db.tasks.get(id.value);
    return record !== undefined && !record.deletedAt;
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
      record.createdAt,
      record.updatedAt,
      record.deletedAt,
      record.inboxEnteredAt
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
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
      inboxEnteredAt: task.inboxEnteredAt
    };
  }
}