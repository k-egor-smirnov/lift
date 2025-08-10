import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CompleteTaskUseCase,
  CompleteTaskRequest,
} from "../CompleteTaskUseCase";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { EventBus } from "../../../domain/events/EventBus";
import { TodoDatabase } from "../../../infrastructure/database/TodoDatabase";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import { TaskCategory, TaskStatus } from "../../../domain/types";
import { ResultUtils } from "../../../domain/Result";
import { DebouncedSyncService } from "../../services/DebouncedSyncService";

// Mock implementations
const mockTaskRepository: TaskRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findByCategoryAndStatus: vi.fn(),
  findOverdueTasks: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  countByCategory: vi.fn(),
  exists: vi.fn(),
  findTasksCreatedInDateRange: vi.fn(),
  findTasksCompletedInDateRange: vi.fn(),
};

const mockEventBus: EventBus = {
  publish: vi.fn(),
  publishAll: vi.fn(),
  subscribe: vi.fn(),
  subscribeToAll: vi.fn(),
  clear: vi.fn(),
};

const mockDatabase = {
  transaction: vi.fn(),
  syncQueue: {
    add: vi.fn(),
  },
  eventStore: {},
  tasks: {},
} as unknown as TodoDatabase;

const mockDebouncedSyncService: DebouncedSyncService = {
  triggerSync: vi.fn(),
  cleanup: vi.fn(),
} as unknown as DebouncedSyncService;

describe("CompleteTaskUseCase", () => {
  let useCase: CompleteTaskUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock transaction to execute the callback immediately    vi.mocked(mockDatabase.transaction).mockImplementation(      async (mode, tables, callback) => {        return await callback({} as any);      }    );

    useCase = new CompleteTaskUseCase(
      mockTaskRepository,
      mockEventBus,
      mockDatabase,
      mockDebouncedSyncService
    );
  });

  describe("execute", () => {
    it("should complete a task successfully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const task = new Task(
        taskId,
        title,
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE
      );

      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.isCompleted).toBe(true);
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);

      // Verify the event published
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock
        .calls[0][0];
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].eventType).toBe("TASK_COMPLETED");
    });

    it("should fail with invalid task ID", async () => {
      // Arrange
      const request: CompleteTaskRequest = {
        taskId: "INVALID_TASK_ID_FORMAT", // Invalid ULID format
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
      }

      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should fail when task not found", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(null);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("TASK_NOT_FOUND");
      }

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should handle already completed task gracefully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const task = new Task(
        taskId,
        title,
        TaskCategory.SIMPLE,
        TaskStatus.COMPLETED
      );

      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.isCompleted).toBe(true);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);

      // Should not publish events for already completed task
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock
        .calls[0][0];
      expect(publishedEvents).toHaveLength(0);
    });

    it("should handle repository save failure", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const task = new Task(
        taskId,
        title,
        TaskCategory.FOCUS,
        TaskStatus.ACTIVE
      );

      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockRejectedValue(
        new Error("Database error")
      );

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("COMPLETION_FAILED");
        expect(result.error.message).toContain("Database error");
      }

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should handle event bus failure", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const task = new Task(
        taskId,
        title,
        TaskCategory.INBOX,
        TaskStatus.ACTIVE
      );

      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockRejectedValue(
        new Error("Event bus error")
      );

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("COMPLETION_FAILED");
        expect(result.error.message).toContain("Event bus error");
      }

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);
    });

    it("should complete task with correct category at completion", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Focus Task");
      const task = new Task(
        taskId,
        title,
        TaskCategory.FOCUS,
        TaskStatus.ACTIVE
      );

      const request: CompleteTaskRequest = {
        taskId: taskId.value,
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);

      // Verify the event contains the category at completion      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock        .calls[0][0];      expect((publishedEvents[0] as any).categoryAtCompletion).toBe(TaskCategory.FOCUS);
    });
  });
});
