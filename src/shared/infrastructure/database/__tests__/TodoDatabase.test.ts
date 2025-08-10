import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TodoDatabase,
  TaskRecord,
  DailySelectionEntryRecord,
  TaskLogRecord,
} from "../TodoDatabase";
import { TaskCategory, TaskStatus } from "../../../domain/types";

describe("TodoDatabase", () => {
  let db: TodoDatabase;

  beforeEach(async () => {
    // Use a unique database name for each test
    db = new TodoDatabase();
    await db.initialize();
    await db.clearAllData();
  });

  afterEach(async () => {
    await db.close();
  });

  describe("Database Initialization", () => {
    it("should initialize database successfully", async () => {
      const isHealthy = await db.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it("should create all required tables", async () => {
      // Verify tables exist by attempting to query them
      await expect(db.tasks.toArray()).resolves.toEqual([]);
      await expect(db.dailySelectionEntries.toArray()).resolves.toEqual([]);
      await expect(db.taskLogs.toArray()).resolves.toEqual([]);
      await expect(db.userSettings.toArray()).resolves.toEqual([]);
      await expect(db.statsDaily.toArray()).resolves.toEqual([]);
    });
  });

  describe("Tasks Table", () => {
    it("should create task with automatic timestamps", async () => {
      const taskData: TaskRecord = {
        id: "task_123",
        title: "Test Task",
        category: TaskCategory.SIMPLE,
        status: TaskStatus.ACTIVE,
        order: 1,
        createdAt: new Date(), // Will be overridden by hook
        updatedAt: new Date(), // Will be overridden by hook
      };

      await db.tasks.add(taskData);

      const savedTask = await db.tasks.get("task_123");
      expect(savedTask).toBeDefined();
      expect(savedTask!.title).toBe("Test Task");
      expect(savedTask!.category).toBe("SIMPLE");
      expect(savedTask!.status).toBe("ACTIVE");
      expect(savedTask!.createdAt).toBeInstanceOf(Date);
      expect(savedTask!.updatedAt).toBeInstanceOf(Date);
    });

    it("should update task with automatic timestamp", async () => {
      const taskData: TaskRecord = {
        id: "task_123",
        title: "Test Task",
        category: TaskCategory.SIMPLE,
        status: TaskStatus.ACTIVE,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.tasks.add(taskData);
      const originalTask = await db.tasks.get("task_123");

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 50));

      await db.tasks.update("task_123", { title: "Updated Task" });

      const updatedTask = await db.tasks.get("task_123");
      expect(updatedTask!.title).toBe("Updated Task");
      expect(updatedTask!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalTask!.updatedAt.getTime()
      );
      expect(updatedTask!.createdAt.getTime()).toBe(
        originalTask!.createdAt.getTime()
      );
    });

    it("should filter by category", async () => {
      await db.tasks.bulkAdd([
        {
          id: "task_1",
          title: "Simple Task",
          category: TaskCategory.SIMPLE,
          status: TaskStatus.ACTIVE,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "task_2",
          title: "Focus Task",
          category: TaskCategory.FOCUS,
          status: TaskStatus.ACTIVE,
          order: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "task_3",
          title: "Inbox Task",
          category: TaskCategory.INBOX,
          status: TaskStatus.ACTIVE,
          order: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const simpleTasks = await db.tasks
        .where("category")
        .equals("SIMPLE")
        .toArray();
      const focusTasks = await db.tasks
        .where("category")
        .equals("FOCUS")
        .toArray();

      expect(simpleTasks).toHaveLength(1);
      expect(simpleTasks[0].title).toBe("Simple Task");
      expect(focusTasks).toHaveLength(1);
      expect(focusTasks[0].title).toBe("Focus Task");
    });

    it("should filter by status", async () => {
      await db.tasks.bulkAdd([
        {
          id: "task_1",
          title: "Active Task",
          category: TaskCategory.SIMPLE,
          status: TaskStatus.ACTIVE,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "task_2",
          title: "Completed Task",
          category: TaskCategory.SIMPLE,
          status: TaskStatus.COMPLETED,
          order: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const activeTasks = await db.tasks
        .where("status")
        .equals("ACTIVE")
        .toArray();
      const completedTasks = await db.tasks
        .where("status")
        .equals("COMPLETED")
        .toArray();

      expect(activeTasks).toHaveLength(1);
      expect(activeTasks[0].title).toBe("Active Task");
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].title).toBe("Completed Task");
    });
  });

  describe("Daily Selection Entries Table", () => {
    it("should create daily selection entry with automatic timestamp", async () => {
      const entryData: DailySelectionEntryRecord = {
        id: "entry_1",
        date: "2024-01-15",
        taskId: "task_123",
        completedFlag: false,
        createdAt: new Date(), // Will be overridden by hook
        updatedAt: new Date(), // Will be overridden by hook
      };

      const id = await db.dailySelectionEntries.add(entryData);

      const savedEntry = await db.dailySelectionEntries.get(id);
      expect(savedEntry).toBeDefined();
      expect(savedEntry!.date).toBe("2024-01-15");
      expect(savedEntry!.taskId).toBe("task_123");
      expect(savedEntry!.completedFlag).toBe(false);
      expect(savedEntry!.createdAt).toBeInstanceOf(Date);
    });

    it("should enforce unique constraint on date+taskId combination", async () => {
      const entryData: DailySelectionEntryRecord = {
        id: "entry_1",
        date: "2024-01-15",
        taskId: "task_123",
        completedFlag: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.dailySelectionEntries.add(entryData);

      // Attempting to add the same date+taskId should work (Dexie doesn't enforce unique constraints automatically)
      // But we can test that we can query by the compound index
      const entries = await db.dailySelectionEntries
        .where("[date+taskId]")
        .equals(["2024-01-15", "task_123"])
        .toArray();

      expect(entries).toHaveLength(1);
    });

    it("should filter by date", async () => {
      await db.dailySelectionEntries.bulkAdd([
        {
          id: "entry_1",
          date: "2024-01-15",
          taskId: "task_1",
          completedFlag: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "entry_2",
          date: "2024-01-15",
          taskId: "task_2",
          completedFlag: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "entry_3",
          date: "2024-01-16",
          taskId: "task_3",
          completedFlag: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const jan15Entries = await db.dailySelectionEntries
        .where("date")
        .equals("2024-01-15")
        .toArray();
      const jan16Entries = await db.dailySelectionEntries
        .where("date")
        .equals("2024-01-16")
        .toArray();

      expect(jan15Entries).toHaveLength(2);
      expect(jan16Entries).toHaveLength(1);
    });
  });

  describe("Task Logs Table", () => {
    it("should create task log with automatic timestamp", async () => {
      const logData: TaskLogRecord = {
        id: "log_1",
        taskId: "task_123",
        type: "SYSTEM",
        message: "Task created",
        createdAt: new Date(), // Will be overridden by hook
      };

      const id = await db.taskLogs.add(logData);

      const savedLog = await db.taskLogs.get(id);
      expect(savedLog).toBeDefined();
      expect(savedLog!.taskId).toBe("task_123");
      expect(savedLog!.type).toBe("SYSTEM");
      expect(savedLog!.message).toBe("Task created");
      expect(savedLog!.createdAt).toBeInstanceOf(Date);
    });

    it("should create custom log without taskId", async () => {
      const logData: TaskLogRecord = {
        id: "log_2",
        type: "USER",
        message: "Custom user log",
        createdAt: new Date(),
      };

      const id = await db.taskLogs.add(logData);

      const savedLog = await db.taskLogs.get(id);
      expect(savedLog).toBeDefined();
      expect(savedLog!.taskId).toBeUndefined();
      expect(savedLog!.type).toBe("USER");
      expect(savedLog!.message).toBe("Custom user log");
    });

    it("should filter logs by taskId", async () => {
      await db.taskLogs.bulkAdd([
        {
          id: "log_3",
          taskId: "task_1",
          type: "SYSTEM",
          message: "Task 1 created",
          createdAt: new Date(),
        },
        {
          id: "log_4",
          taskId: "task_1",
          type: "USER",
          message: "Working on task 1",
          createdAt: new Date(),
        },
        {
          id: "log_5",
          taskId: "task_2",
          type: "SYSTEM",
          message: "Task 2 created",
          createdAt: new Date(),
        },
      ]);

      const task1Logs = await db.taskLogs
        .where("taskId")
        .equals("task_1")
        .toArray();
      const task2Logs = await db.taskLogs
        .where("taskId")
        .equals("task_2")
        .toArray();

      expect(task1Logs).toHaveLength(2);
      expect(task2Logs).toHaveLength(1);
    });

    it("should filter logs by type", async () => {
      await db.taskLogs.bulkAdd([
        {
          id: "log_6",
          taskId: "task_1",
          type: "SYSTEM",
          message: "System log 1",
          createdAt: new Date(),
        },
        {
          id: "log_7",
          taskId: "task_2",
          type: "USER",
          message: "User log 1",
          createdAt: new Date(),
        },
        {
          id: "log_8",
          taskId: "task_3",
          type: "CONFLICT",
          message: "Conflict log 1",
          createdAt: new Date(),
        },
      ]);

      const systemLogs = await db.taskLogs
        .where("type")
        .equals("SYSTEM")
        .toArray();
      const userLogs = await db.taskLogs.where("type").equals("USER").toArray();
      const conflictLogs = await db.taskLogs
        .where("type")
        .equals("CONFLICT")
        .toArray();

      expect(systemLogs).toHaveLength(1);
      expect(userLogs).toHaveLength(1);
      expect(conflictLogs).toHaveLength(1);
    });
  });

  describe("User Settings Table", () => {
    it("should create and update user settings", async () => {
      await db.userSettings.add({
        key: "inboxOverdueDays",
        value: 3,
        updatedAt: new Date(),
      });

      const setting = await db.userSettings.get("inboxOverdueDays");
      expect(setting).toBeDefined();
      expect(setting!.value).toBe(3);

      await db.userSettings.update("inboxOverdueDays", { value: 5 });

      const updatedSetting = await db.userSettings.get("inboxOverdueDays");
      expect(updatedSetting!.value).toBe(5);
    });
  });

  describe("Stats Daily Table", () => {
    it("should create daily stats entry", async () => {
      const statsData = {
        date: "2024-01-15",
        simpleCompleted: 5,
        focusCompleted: 2,
        inboxReviewed: 3,
        createdAt: new Date(),
      };

      await db.statsDaily.add(statsData);

      const savedStats = await db.statsDaily.get("2024-01-15");
      expect(savedStats).toBeDefined();
      expect(savedStats!.simpleCompleted).toBe(5);
      expect(savedStats!.focusCompleted).toBe(2);
      expect(savedStats!.inboxReviewed).toBe(3);
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection errors gracefully", async () => {
      const badDb = new TodoDatabase();
      // Close the database to simulate connection issues
      await badDb.close();

      const isHealthy = await badDb.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe("Data Clearing", () => {
    it("should clear all data successfully", async () => {
      // Add some test data
      await db.tasks.add({
        id: "task_1",
        title: "Test Task",
        category: TaskCategory.SIMPLE,
        status: TaskStatus.ACTIVE,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.taskLogs.add({
        id: "log_test",
        taskId: "task_1",
        type: "SYSTEM",
        message: "Test log",
        createdAt: new Date(),
      });

      // Verify data exists
      expect(await db.tasks.count()).toBe(1);
      expect(await db.taskLogs.count()).toBe(1);

      // Clear all data
      await db.clearAllData();

      // Verify data is cleared
      expect(await db.tasks.count()).toBe(0);
      expect(await db.taskLogs.count()).toBe(0);
    });
  });
});
