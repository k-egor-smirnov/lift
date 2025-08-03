import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CreateSystemLogUseCase,
  CreateSystemLogRequest,
} from "../CreateSystemLogUseCase";
import {
  TodoDatabase,
  TaskLogRecord,
} from "../../../infrastructure/database/TodoDatabase";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { TaskCategory } from "../../../domain/types";
import { ResultUtils } from "../../../domain/Result";
import { DebouncedSyncService } from "../../services/DebouncedSyncService";

// Mock database
const mockDatabase = {
  taskLogs: {
    add: vi.fn(),
  },
} as unknown as TodoDatabase;

const mockDebouncedSyncService: DebouncedSyncService = {
  triggerSync: vi.fn(),
  cleanup: vi.fn(),
} as unknown as DebouncedSyncService;

describe("CreateSystemLogUseCase", () => {
  let useCase: CreateSystemLogUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CreateSystemLogUseCase(
      mockDatabase,
      mockDebouncedSyncService
    );
  });

  describe("execute", () => {
    it("should create system log with auto-generated message", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "created",
        metadata: { category: "SIMPLE" },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDatabase.taskLogs.add).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: taskId.value,
          type: "SYSTEM",
          message: "Task created in SIMPLE category",
          metadata: { category: "SIMPLE" },
        })
      );
    });

    it("should create system log with custom message", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const customMessage = "Custom system message";
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "completed",
        message: customMessage,
        metadata: { categoryAtCompletion: "FOCUS" },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDatabase.taskLogs.add).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: taskId.value,
          type: "SYSTEM",
          message: customMessage,
          metadata: { categoryAtCompletion: "FOCUS" },
        })
      );
    });

    it("should generate correct message for category change", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "category_changed",
        metadata: {
          fromCategory: "INBOX",
          toCategory: "FOCUS",
        },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe("Category changed from INBOX to FOCUS");
    });

    it("should generate correct message for task completion", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "completed",
        metadata: { categoryAtCompletion: "SIMPLE" },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe("Task completed in SIMPLE category");
    });

    it("should generate correct message for title change", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "title_changed",
        metadata: {
          fromTitle: "Old Title",
          toTitle: "New Title",
        },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe(
        'Title changed from "Old Title" to "New Title"'
      );
    });

    it("should generate correct message for overdue task", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "overdue",
        metadata: { daysOverdue: 5 },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe("Task marked as overdue (5 days in Inbox)");
    });

    it("should generate correct message for conflict resolution", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "conflict_resolved",
        metadata: { strategy: "last-write-wins" },
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe(
        "Sync conflict resolved using last-write-wins strategy"
      );
    });

    it("should fail with invalid task ID", async () => {
      // Arrange
      const request: CreateSystemLogRequest = {
        taskId: "invalid-id",
        action: "created",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
      }

      expect(mockDatabase.taskLogs.add).not.toHaveBeenCalled();
    });

    it("should handle database failure", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "created",
      };

      vi.mocked(mockDatabase.taskLogs.add).mockRejectedValue(
        new Error("Database error")
      );

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("CREATION_FAILED");
        expect(result.error.message).toContain("Database error");
      }
    });

    it("should handle unknown action gracefully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "unknown_action" as any,
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe("System action: unknown_action");
    });

    it("should include createdAt timestamp", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CreateSystemLogRequest = {
        taskId: taskId.value,
        action: "created",
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock
        .calls[0][0] as TaskLogRecord;
      expect(addCall.createdAt).toBeInstanceOf(Date);
    });
  });
});
