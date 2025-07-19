import Dexie, { Table } from 'dexie';
import { TaskCategory, TaskStatus } from '../../domain/types';

// Database record interfaces
export interface TaskRecord {
  id: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  inboxEnteredAt?: Date;
}

export interface DailySelectionEntryRecord {
  id?: number;
  date: string; // YYYY-MM-DD format
  taskId: string;
  completedFlag: boolean;
  createdAt: Date;
}

export interface TaskLogRecord {
  id?: number;
  taskId?: string; // Optional for custom logs
  type: 'SYSTEM' | 'USER' | 'CONFLICT';
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface UserSettingsRecord {
  key: string;
  value: any;
  updatedAt: Date;
}

export interface SyncQueueRecord {
  id?: number;
  entityType: 'task' | 'dailySelectionEntry' | 'taskLog';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payloadHash: string;
  attemptCount: number;
  createdAt: Date;
  lastAttemptAt?: Date;
}

export interface StatsDailyRecord {
  date: string; // YYYY-MM-DD format
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
  createdAt: Date;
}

export class TodoDatabase extends Dexie {
  tasks!: Table<TaskRecord>;
  dailySelectionEntries!: Table<DailySelectionEntryRecord>;
  taskLogs!: Table<TaskLogRecord>;
  userSettings!: Table<UserSettingsRecord>;
  syncQueue!: Table<SyncQueueRecord>;
  statsDaily!: Table<StatsDailyRecord>;

  constructor() {
    super('TodoDatabase');
    
    // Version 1 - Initial schema
    this.version(1).stores({
      tasks: 'id, category, status, createdAt, updatedAt, deletedAt, inboxEnteredAt',
      dailySelectionEntries: '++id, [date+taskId], date, taskId, completedFlag, createdAt',
      taskLogs: '++id, taskId, type, createdAt',
      userSettings: 'key, updatedAt',
      syncQueue: '++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt',
      statsDaily: 'date, simpleCompleted, focusCompleted, inboxReviewed, createdAt'
    });

    // Add hooks for automatic timestamp updates
    this.tasks.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.tasks.hook('updating', (modifications, _primKey, _obj, _trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.dailySelectionEntries.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });

    this.taskLogs.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });

    this.userSettings.hook('creating', (_primKey, obj, _trans) => {
      obj.updatedAt = new Date();
    });

    this.userSettings.hook('updating', (modifications, _primKey, _obj, _trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.syncQueue.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });

    this.statsDaily.hook('creating', (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });
  }

  // Connection management
  async initialize(): Promise<void> {
    try {
      await this.open();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new DatabaseConnectionError('Failed to initialize database', error as Error);
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.tasks.limit(1).toArray();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  // Clear all data (for testing)
  async clearAllData(): Promise<void> {
    await this.transaction('rw', [this.tasks, this.dailySelectionEntries, this.taskLogs, 
                          this.userSettings, this.syncQueue, this.statsDaily], async () => {
      await this.tasks.clear();
      await this.dailySelectionEntries.clear();
      await this.taskLogs.clear();
      await this.userSettings.clear();
      await this.syncQueue.clear();
      await this.statsDaily.clear();
    });
  }
}

// Custom error classes
export class DatabaseConnectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseOperationError extends Error {
  constructor(message: string, public readonly operation: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseOperationError';
  }
}

// Singleton instance
export const todoDatabase = new TodoDatabase();