import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeleteTaskUseCase, DeleteTaskRequest } from "../DeleteTaskUseCase";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../../domain/repositories/DailySelectionRepository";
import { EventBus } from "../../../domain/events/EventBus";
import { TodoDatabase } from "../../../infrastructure/database/TodoDatabase";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import { TaskCategory } from "../../../domain/types";
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
};

const mockDailySelectionRepository: DailySelectionRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByDate: vi.fn(),
  findByDateRange: vi.fn(),
  findTodaySelection: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  addTaskToDate: vi.fn(),
  removeTaskFromDate: vi.fn(),
  removeTaskFromAllDays: vi.fn(),
  getTasksForDate: vi.fn(),
  count: vi.fn(),
  countByDate: vi.fn(),
  exists: vi.fn(),
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
  dailySelectionEntries: {},
} as unknown as TodoDatabase;

const mockDebouncedSyncService: DebouncedSyncService = {
  triggerSync: vi.fn(),
  cleanup: vi.fn(),
} as unknown as DebouncedSyncService;

// Helper to create mock task
const createMockTask = (overrides?: Partial<Task>): Task => {
  const task = {
    id: TaskId.fromString("test-task-id"),
    title: NonEmptyTitle.create("Test Task"),
    category: TaskCategory.INBOX,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    isDeleted: false,
    completedAt: null,
    deferredTo: null,
    note: null,
    softDelete: vi.fn().mockReturnValue([]),
    markAsCompleted: vi.fn(),
    defer: vi.fn(),
    undefer: vi.fn(),
    updateTitle: vi.fn(),
    updateNote: vi.fn(),
    changeCategory: vi.fn(),
    getDomainEvents: vi.fn().mockReturnValue([]),
    clearDomainEvents: vi.fn(),
    equals: vi.fn(),
    toJSON: vi.fn(),
    ...overrides,
  } as unknown as Task;
  
  return task;
};

describe("DeleteTaskUseCase", () => {
  let useCase: DeleteTaskUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    
    useCase = new DeleteTaskUseCase(
      mockTaskRepository,
      mockEventBus,
      mockDatabase,
      mockDebouncedSyncService,
      mockDailySelectionRepository
    );
  });

  describe("execute", () => {
    it("should successfully delete a task", async () => {
      const mockTask = createMockTask();
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockDatabase.transaction as any).mockImplementation(async (_, __, callback) => {
        await callback();
      });

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.taskId).toBe("test-task-id");
      }
      
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(
        TaskId.fromString("test-task-id")
      );
      expect(mockTask.softDelete).toHaveBeenCalled();
      expect(mockDailySelectionRepository.removeTaskFromAllDays).toHaveBeenCalled();
    });

    it("should return error for invalid task ID format", async () => {
      const request: DeleteTaskRequest = {
        taskId: "",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
        expect(result.error.message).toContain("Invalid task ID format");
      }
    });

    it("should return error when task not found", async () => {
      (mockTaskRepository.findById as any).mockResolvedValue(null);

      const request: DeleteTaskRequest = {
        taskId: "non-existent-task",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("TASK_NOT_FOUND");
      }
    });

    it("should return success when task is already deleted", async () => {
      const mockTask = createMockTask({ isDeleted: true });
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.taskId).toBe("test-task-id");
      }
      
      // Should not call softDelete if already deleted
      expect(mockTask.softDelete).not.toHaveBeenCalled();
    });

    it("should remove task from all daily selections", async () => {
      const mockTask = createMockTask();
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockDatabase.transaction as any).mockImplementation(async (_, __, callback) => {
        await callback();
      });

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      await useCase.execute(request);

      expect(mockDailySelectionRepository.removeTaskFromAllDays).toHaveBeenCalledWith(
        TaskId.fromString("test-task-id")
      );
    });

    it("should handle transaction failure", async () => {
      const mockTask = createMockTask();
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockDatabase.transaction as any).mockRejectedValue(new Error("Transaction failed"));

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("DELETION_FAILED");
      }
    });

    it("should trigger sync after successful deletion", async () => {
      const mockTask = createMockTask();
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockDatabase.transaction as any).mockImplementation(async (_, __, callback) => {
        await callback();
      });

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      await useCase.execute(request);

      expect(mockDebouncedSyncService.triggerSync).toHaveBeenCalled();
    });

    it("should publish domain events", async () => {
      const mockEvent = { type: "TaskDeleted", taskId: "test-task-id" };
      const mockTask = createMockTask({
        softDelete: vi.fn().mockReturnValue([mockEvent]),
        getDomainEvents: vi.fn().mockReturnValue([mockEvent]),
      });
      
      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockDatabase.transaction as any).mockImplementation(async (_, __, callback) => {
        await callback();
      });

      const request: DeleteTaskRequest = {
        taskId: "test-task-id",
      };

      await useCase.execute(request);

      expect(mockEventBus.publishAll).toHaveBeenCalled();
    });
  });
});
