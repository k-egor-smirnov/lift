import { describe, it, expect, beforeEach, vi } from "vitest";
import { TaskLogEventHandler } from "../TaskLogEventHandler";
import { TodoDatabase } from "../../../../../shared/infrastructure/database/TodoDatabase";
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent,
  TaskNoteChangedEvent,
} from "../../../../../shared/domain/events/TaskEvents";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../../../shared/domain/value-objects/NonEmptyTitle";
import { TaskCategory } from "../../../../../shared/domain/types";

// Mock TodoDatabase
const mockDatabase = {
  taskLogs: {
    put: vi.fn(),
  },
} as unknown as TodoDatabase;

describe("TaskLogEventHandler", () => {
  let handler: TaskLogEventHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new TaskLogEventHandler(mockDatabase);
  });

  describe("handleTaskCreated", () => {
    it("should create system log for task creation", async () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-created-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task created in SIMPLE category",
        metadata: {
          eventType: event.eventType,
          category: TaskCategory.SIMPLE,
          title: title.value,
        },
        createdAt: new Date(event.createdAt),
      });
    });
  });

  describe("handleTaskCompleted", () => {
    it("should create system log for task completion", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletedEvent(taskId, TaskCategory.FOCUS);

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-completed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task completed in FOCUS category",
        metadata: {
          eventType: event.eventType,
          categoryAtCompletion: TaskCategory.FOCUS,
        },
        createdAt: new Date(event.createdAt),
      });
    });
  });

  describe("handleTaskCategoryChanged", () => {
    it("should create system log for category change", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCategoryChangedEvent(
        taskId,
        TaskCategory.INBOX,
        TaskCategory.SIMPLE
      );

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-category-changed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task moved from INBOX to SIMPLE",
        metadata: {
          eventType: event.eventType,
          fromCategory: TaskCategory.INBOX,
          toCategory: TaskCategory.SIMPLE,
        },
        createdAt: new Date(event.createdAt),
      });
    });
  });

  describe("handleTaskReviewed", () => {
    it("should create system log for task review", async () => {
      const taskId = TaskId.generate();
      const reviewedAt = new Date();
      const event = new TaskReviewedEvent(taskId, reviewedAt);

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-reviewed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task reviewed - moved from INBOX for the first time",
        metadata: {
          eventType: event.eventType,
          reviewedAt: reviewedAt.toISOString(),
        },
        createdAt: new Date(event.createdAt),
      });
    });
  });

  describe("handleTaskNoteChanged", () => {
    it("should create system log for note added", async () => {
      const taskId = TaskId.generate();
      const event = new TaskNoteChangedEvent(taskId, undefined, "New note");

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-note-changed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task note added",
        metadata: {
          eventType: event.eventType,
          fromNote: undefined,
          toNote: "New note",
        },
        createdAt: new Date(event.createdAt),
      });
    });

    it("should create system log for note removed", async () => {
      const taskId = TaskId.generate();
      const event = new TaskNoteChangedEvent(taskId, "Old note", undefined);

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-note-changed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task note removed",
        metadata: {
          eventType: event.eventType,
          fromNote: "Old note",
          toNote: undefined,
        },
        createdAt: new Date(event.createdAt),
      });
    });

    it("should create system log for note changed", async () => {
      const taskId = TaskId.generate();
      const event = new TaskNoteChangedEvent(taskId, "Old note", "New note");

      await handler.handle(event);

      expect(mockDatabase.taskLogs.put).toHaveBeenCalledWith({
        id: `task-note-changed-${event.aggregateId}-${event.createdAt}`,
        taskId: taskId.value,
        type: "SYSTEM",
        message: "Task note changed",
        metadata: {
          eventType: event.eventType,
          fromNote: "Old note",
          toNote: "New note",
        },
        createdAt: new Date(event.createdAt),
      });
    });
  });

  describe("idempotency", () => {
    it("should use deterministic IDs for idempotent operations", async () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      // Handle the same event twice
      await handler.handle(event);
      await handler.handle(event);

      // Should be called twice with the same ID (database will handle upsert)
      expect(mockDatabase.taskLogs.put).toHaveBeenCalledTimes(2);
      expect(mockDatabase.taskLogs.put).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          id: `task-created-${event.aggregateId}-${event.createdAt}`,
        })
      );
      expect(mockDatabase.taskLogs.put).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: `task-created-${event.aggregateId}-${event.createdAt}`,
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      (mockDatabase.taskLogs.put as any).mockRejectedValue(
        new Error("Database error")
      );

      // Should not throw
      await expect(handler.handle(event)).rejects.toThrow("Database error");
    });
  });
});
