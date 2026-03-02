import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DeferTaskUseCase,
  DeferTaskRequest,
} from "../DeferTaskUseCase";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
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
    defer: vi.fn().mockReturnValue([]),
    undefer: vi.fn().mockReturnValue([]),
    softDelete: vi.fn().mockReturnValue([]),
    markAsCompleted: vi.fn(),
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

describe("DeferTaskUseCase", () => {
  let useCase: DeferTaskUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    useCase = new DeferTaskUseCase(
      mockTaskRepository,
      mockEventBus,
      mockDatabase,
      mockDebouncedSyncService
    );
  });

  describe("execute", () => {
    it("should successfully defer a task", async () => {
      const mockTask = createMockTask();
      const deferredDate = new Date("2024-12-31");

      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockTaskRepository.save as any).mockResolvedValue(undefined);
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: DeferTaskRequest = {
        taskId: "test-task-id",
        deferredUntil: deferredDate,
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.taskId).toBe("test-task-id");
        expect(result.data.deferredUntil).toEqual(deferredDate);
      }

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(
        TaskId.fromString("test-task-id")
      );
      expect(mockTask.defer).toHaveBeenCalledWith(deferredDate);
    });

    it("should return error for invalid task ID format", async () => {
      const request: DeferTaskRequest = {
        taskId: "",
        deferredUntil: new Date("2024-12-31"),
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
        expect(result.error.message).toContain("Invalid task ID format");
      }
    });

    it("should return error for invalid deferral date", async () => {
      const request: DeferTaskRequest = {
        taskId: "test-task-id",
        deferredUntil: new Date("invalid"),
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_DEFERRAL_DATE");
        expect(result.error.message).toContain("Invalid deferral date");
      }
    });

    it("should return error when task not found", async () => {
      (mockTaskRepository.findById as any).mockResolvedValue(null);

      const request: DeferTaskRequest = {
        taskId: "test-task-id",
        deferredUntil: new Date("2024-12-31"),
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("TASK_NOT_FOUND");
        expect(result.error.message).toContain("Task not found");
      }
    });

    it("should trigger sync after successful deferral", async () => {
      const mockTask = createMockTask();
      const deferredDate = new Date("2024-12-31");

      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockTaskRepository.save as any).mockResolvedValue(undefined);
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: DeferTaskRequest = {
        taskId: "test-task-id",
        deferredUntil: deferredDate,
      };

      await useCase.execute(request);

      expect(mockDebouncedSyncService.triggerSync).toHaveBeenCalled();
    });

    it("should publish domain events", async () => {
      const mockEvent = { type: "TaskDeferred", taskId: "test-task-id" };
      const mockTask = createMockTask({
        defer: vi.fn().mockReturnValue([mockEvent]),
        getDomainEvents: vi.fn().mockReturnValue([mockEvent]),
      });
      const deferredDate = new Date("2024-12-31");

      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockTaskRepository.save as any).mockResolvedValue(undefined);
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: DeferTaskRequest = {
        taskId: "test-task-id",
        deferredUntil: deferredDate,
      };

      await useCase.execute(request);

      expect(mockEventBus.publishAll).toHaveBeenCalled();
    });
  });
});
