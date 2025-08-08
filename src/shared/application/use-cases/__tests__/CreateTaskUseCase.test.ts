import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateTaskUseCase, CreateTaskRequest } from "../CreateTaskUseCase";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { TaskImageRepository } from "../../../domain/repositories/TaskImageRepository";
import { EventBus } from "../../../domain/events/EventBus";
import { TodoDatabase } from "../../../infrastructure/database/TodoDatabase";
import { TaskCategory } from "../../../domain/types";
import { ResultUtils } from "../../../domain/Result";
import { DebouncedSyncService } from "../../services/DebouncedSyncService";
import { ImageSyncService } from "../../services/ImageSyncService";

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
};

const mockEventBus: EventBus = {
  publish: vi.fn(),
  publishAll: vi.fn(),
  subscribe: vi.fn(),
  subscribeToAll: vi.fn(),
  clear: vi.fn(),
};

const mockImageRepository: TaskImageRepository = {
  get: vi.fn(),
  save: vi.fn(),
};

const mockImageSyncService: ImageSyncService = {
  broadcastImage: vi.fn(),
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

describe("CreateTaskUseCase", () => {
  let useCase: CreateTaskUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock transaction to execute the callback immediately
    vi.mocked(mockDatabase.transaction).mockImplementation(
      async (mode, tables, callback) => {
        return await callback();
      }
    );

    useCase = new CreateTaskUseCase(
      mockTaskRepository,
      mockImageRepository,
      mockEventBus,
      mockDatabase,
      mockDebouncedSyncService,
      mockImageSyncService
    );
  });

  describe("execute", () => {
    it("should create a task successfully", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "Test Task",
        category: TaskCategory.SIMPLE,
      };

      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.taskId).toBeDefined();
        expect(typeof result.data.taskId).toBe("string");
      }

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);

      // Verify the event published
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock
        .calls[0][0];
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].eventType).toBe("TASK_CREATED");
    });

    it("should fail with empty title", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "",
        category: TaskCategory.SIMPLE,
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TITLE");
        expect(result.error.message).toContain("title cannot be empty");
      }

      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should fail with whitespace-only title", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "   ",
        category: TaskCategory.FOCUS,
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TITLE");
      }

      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should handle repository save failure", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "Test Task",
        category: TaskCategory.INBOX,
      };

      vi.mocked(mockTaskRepository.save).mockRejectedValue(
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

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it("should handle event bus failure", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "Test Task",
        category: TaskCategory.SIMPLE,
      };

      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockRejectedValue(
        new Error("Event bus error")
      );

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("CREATION_FAILED");
        expect(result.error.message).toContain("Event bus error");
      }

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);
    });

    it("should create INBOX task with correct category", async () => {
      // Arrange
      const request: CreateTaskRequest = {
        title: "Inbox Task",
        category: TaskCategory.INBOX,
      };

      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);

      // Verify the task was saved with correct category
      const savedTask = vi.mocked(mockTaskRepository.save).mock.calls[0][0];
      expect(savedTask.category).toBe(TaskCategory.INBOX);
      expect(savedTask.inboxEnteredAt).toBeDefined();
    });
  });
});
