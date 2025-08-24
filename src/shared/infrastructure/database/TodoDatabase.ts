import { injectable } from "tsyringe";
import Dexie, { Table } from "dexie";
import { TaskCategory, TaskStatus } from "../../domain/types";
import { SummaryType, SummaryStatus } from "../../domain/entities/Summary";

// Database record interfaces
export interface TaskRecord {
  id: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  inboxEnteredAt?: Date;
  deferredUntil?: Date;
  originalCategory?: TaskCategory;
  note?: string;
}

export interface DailySelectionEntryRecord {
  id: string; // ULID primary key
  date: string; // YYYY-MM-DD format
  taskId: string;
  completedFlag: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface TaskLogRecord {
  id: string;
  taskId?: string; // Optional for custom logs
  type: "SYSTEM" | "USER" | "CONFLICT";
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface UserSettingsRecord {
  key: string;
  value: any;
  updatedAt: Date;
}

export interface StatsDailyRecord {
  date: string; // YYYY-MM-DD format
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
  createdAt: Date;
}

// Event store record interfaces for persistent event bus
export interface EventStoreRecord {
  id: string; // ULID (primary key)
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: string; // JSON serialized event data
  createdAt: number; // Date.now() timestamp
  status: "pending" | "processing" | "done" | "dead";
  attemptCount: number;
  nextAttemptAt?: number; // Date.now() timestamp for retry scheduling
  lastError?: string;
}

export interface HandledEventRecord {
  eventId: string;
  handlerId: string;
  processedAt: number; // Date.now() timestamp
}

export interface LockRecord {
  id: string; // Lock identifier
  expiresAt: number; // Date.now() timestamp
}

export interface SummaryRecord {
  id: string;
  type: SummaryType;
  status: SummaryStatus;
  dateKey: string;
  title: string;
  content?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  error?: string;
}

@injectable()
export class TodoDatabase extends Dexie {
  tasks!: Table<TaskRecord>;
  dailySelectionEntries!: Table<DailySelectionEntryRecord>;
  taskLogs!: Table<TaskLogRecord>;
  userSettings!: Table<UserSettingsRecord>;
  statsDaily!: Table<StatsDailyRecord>;
  eventStore!: Table<EventStoreRecord>;
  handledEvents!: Table<HandledEventRecord>;
  locks!: Table<LockRecord>;
  summaries!: Table<SummaryRecord>;

  constructor() {
    super("TodoDatabase");

    // Version 1 - Initial schema
    this.version(1).stores({
      tasks:
        "id, category, status, createdAt, updatedAt, deletedAt, inboxEnteredAt",
      dailySelectionEntries:
        "++id, [date+taskId], date, taskId, completedFlag, createdAt",
      taskLogs: "id, taskId, type, createdAt",
      userSettings: "key, updatedAt",
      syncQueue:
        "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt",
      statsDaily:
        "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
    });

    // Version 2 - Add event store tables for persistent event bus
    this.version(2)
      .stores({
        tasks:
          "id, category, status, createdAt, updatedAt, deletedAt, inboxEnteredAt",
        dailySelectionEntries:
          "++id, [date+taskId], date, taskId, completedFlag, createdAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(() => {
        // Data migration logic if needed
        console.log(
          "Upgrading database to version 2 - adding event store tables"
        );
      });

    // Version 3 - Add order field to tasks for drag and drop sorting
    this.version(3)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt",
        dailySelectionEntries:
          "++id, [date+taskId], date, taskId, completedFlag, createdAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async (trans) => {
        console.log(
          "Upgrading database to version 3 - adding order field to tasks"
        );
        // Initialize order field for existing tasks
        const tasks = await trans.table("tasks").toArray();
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          if (task.order === undefined) {
            await trans.table("tasks").update(task.id, {
              order: task.createdAt
                ? new Date(task.createdAt).getTime()
                : Date.now() + i,
            });
          }
        }
      });

    // Version 4 - Add deferred tasks support
    this.version(4)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory",
        dailySelectionEntries:
          "++id, [date+taskId], date, taskId, completedFlag, createdAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async () => {
        console.log(
          "Upgrading database to version 4 - adding deferred tasks support"
        );
        // No migration needed for new optional fields
      });

    // Version 5 - Add soft delete support for daily selection entries
    this.version(5)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory",
        dailySelectionEntries:
          "++id, [date+taskId], date, taskId, completedFlag, createdAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async () => {
        console.log(
          "Upgrading database to version 5 - adding soft delete support for daily selection entries"
        );
        // No migration needed for new optional field
      });

    // Version 6 - Change daily selection entries ID to ULID for Supabase compatibility
    this.version(6)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async (trans) => {
        console.log(
          "Upgrading database to version 6 - changing daily selection entries ID to ULID"
        );
        // Migrate existing entries to use ULID
        const { ulid } = await import("ulid");
        const existingEntries = await trans
          .table("dailySelectionEntries")
          .toArray();

        // Clear the table and re-add with ULID
        await trans.table("dailySelectionEntries").clear();

        for (const entry of existingEntries) {
          await trans.table("dailySelectionEntries").add({
            id: ulid(),
            date: entry.date,
            taskId: entry.taskId,
            completedFlag: entry.completedFlag,
            createdAt: entry.createdAt,
            deletedAt: entry.deletedAt,
          });
        }
      });

    // Version 7 - Add updatedAt field to daily selection entries
    this.version(7)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async (trans) => {
        console.log(
          "Upgrading database to version 7 - adding updatedAt field to daily selection entries"
        );
        // Add updatedAt field to existing entries
        const existingEntries = await trans
          .table("dailySelectionEntries")
          .toArray();

        for (const entry of existingEntries) {
          if (!entry.updatedAt) {
            await trans.table("dailySelectionEntries").update(entry.id, {
              updatedAt: entry.createdAt || new Date(),
            });
          }
        }
      });

    // Version 8 - Add note field to tasks
    this.version(8)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory, note",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
      })
      .upgrade(async () => {
        console.log(
          "Upgrading database to version 8 - adding note field to tasks"
        );
        // No migration needed for new optional field
      });

    // Version 9 - Add summaries table
    this.version(9)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory, note",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
        summaries:
          "id, [date+type], date, type, status, content, createdAt, updatedAt",
      })
      .upgrade(async () => {
        console.log("Upgrading database to version 9 - adding summaries table");
        // No migration needed for new table
      });

    // Version 10 - Fix summaries table index to use dateKey instead of date
    this.version(10)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory, note",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
        summaries:
          "id, [dateKey+type], dateKey, type, status, content, createdAt, updatedAt",
      })
      .upgrade(async () => {
        console.log(
          "Upgrading database to version 10 - fixing summaries table index"
        );
        // No migration needed - just index change
      });

    // Version 11 - Add retryCount field to summaries table
    this.version(11)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory, note",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
        summaries:
          "id, [dateKey+type], dateKey, type, status, content, retryCount, createdAt, updatedAt",
      })
      .upgrade(async (trans) => {
        console.log(
          "Upgrading database to version 11 - adding retryCount field to summaries"
        );
        // Initialize retryCount field for existing summaries
        const existingSummaries = await trans.table("summaries").toArray();
        for (const summary of existingSummaries) {
          if (summary.retryCount === undefined) {
            await trans.table("summaries").update(summary.id, {
              retryCount: 0,
            });
          }
        }
      });

    // Version 12 - Update summaries table schema to match new SummaryRecord interface
    this.version(12)
      .stores({
        tasks:
          "id, category, status, order, createdAt, updatedAt, deletedAt, inboxEnteredAt, deferredUntil, originalCategory, note",
        dailySelectionEntries:
          "id, [date+taskId], date, taskId, completedFlag, createdAt, updatedAt, deletedAt",
        taskLogs: "id, taskId, type, createdAt",
        userSettings: "key, updatedAt",
        syncQueue:
          "++id, entityType, entityId, operation, attemptCount, createdAt, lastAttemptAt, nextAttemptAt",
        statsDaily:
          "date, simpleCompleted, focusCompleted, inboxReviewed, createdAt",
        eventStore:
          "id, status, aggregateId, [aggregateId+createdAt], nextAttemptAt, attemptCount, createdAt",
        handledEvents: "[eventId+handlerId], eventId, handlerId",
        locks: "id, expiresAt",
        summaries:
          "id, [dateKey+type], dateKey, type, status, title, content, metadata, createdAt, updatedAt, processedAt, error",
      })
      .upgrade(async (trans) => {
        console.log(
          "Upgrading database to version 12 - updating summaries table schema"
        );
        // Migrate existing summaries to new schema
        const existingSummaries = await trans.table("summaries").toArray();
        for (const summary of existingSummaries) {
          const updates: any = {};
          if (!summary.title) {
            updates.title = `Summary for ${summary.dateKey}`;
          }
          if (Object.keys(updates).length > 0) {
            await trans.table("summaries").update(summary.id, updates);
          }
        }
      });

    // Add hooks for automatic timestamp updates
    this.tasks.hook("creating", (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.tasks.hook("updating", (modifications, _primKey, _obj, _trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.dailySelectionEntries.hook("creating", (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.dailySelectionEntries.hook(
      "updating",
      (modifications, _primKey, _obj, _trans) => {
        (modifications as any).updatedAt = new Date();
      }
    );

    this.taskLogs.hook("creating", (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });

    this.userSettings.hook("creating", (_primKey, obj, _trans) => {
      obj.updatedAt = new Date();
    });

    this.userSettings.hook(
      "updating",
      (modifications, _primKey, _obj, _trans) => {
        (modifications as any).updatedAt = new Date();
      }
    );

    this.statsDaily.hook("creating", (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
    });

    this.summaries.hook("creating", (_primKey, obj, _trans) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });

    this.summaries.hook("updating", (modifications, _primKey, _obj, _trans) => {
      (modifications as any).updatedAt = new Date();
    });
  }

  // Connection management
  async initialize(): Promise<void> {
    try {
      await this.open();
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw new DatabaseConnectionError(
        "Failed to initialize database",
        error as Error
      );
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      await this.tasks.limit(1).toArray();
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  // Clear all data (for testing)
  async clearAllData(): Promise<void> {
    await this.transaction(
      "rw",
      [
        this.tasks,
        this.dailySelectionEntries,
        this.taskLogs,
        this.userSettings,
        this.statsDaily,
        this.eventStore,
        this.handledEvents,
        this.locks,
        this.summaries,
      ],
      async () => {
        await this.tasks.clear();
        await this.dailySelectionEntries.clear();
        await this.taskLogs.clear();
        await this.userSettings.clear();
        await this.statsDaily.clear();
        await this.eventStore.clear();
        await this.handledEvents.clear();
        await this.locks.clear();
        await this.summaries.clear();
      }
    );
  }
}

// Custom error classes
export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

export class DatabaseOperationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DatabaseOperationError";
  }
}

// Singleton instance
export const todoDatabase = new TodoDatabase();
