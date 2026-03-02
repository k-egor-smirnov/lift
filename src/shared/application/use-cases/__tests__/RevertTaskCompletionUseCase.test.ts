import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RevertTaskCompletionUseCase,
  RevertTaskCompletionRequest,
} from "../RevertTaskCompletionUseCase";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { EventBus } from "../../../domain/events/EventBus";
import { TodoDatabase } from "../../../infrastructure/database/TodoDatabase";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import { TaskCategory } from "../../../domain/types";
import { ResultUtils } from "../../../domain/Result";

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

// Helper to create mock task
const createMockTask = (overrides?: Partial<Task>): Task => {
  const task = {
    id: TaskId.fromString("test-task-id"),
    title: NonEmptyTitle.create("Test Task"),
    category: TaskCategory.INBOX,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    isDeleted: false,
    completedAt: new Date("2024-01-02"),
    deferredTo: null,
    note: null,
    revertCompletion: vi.fn().mockReturnValue([]),
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

describe("RevertTaskCompletionUseCase", () => {
  let useCase: RevertTaskCompletionUseCase;

  beforeEach(() => {
    vi.clearAllMocks();

    useCase = new RevertTaskCompletionUseCase(
      mockTaskRepository,
      mockEventBus,
      mockDatabase
    );
  });

  describe("execute", () => {
    it("should successfully revert task completion", async () => {
      const mockTask = createMockTask();

      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockTaskRepository.save as any).mockResolvedValue(undefined);
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: RevertTaskCompletionRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isSuccess(result)).toBe(true);

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(
        TaskId.fromString("test-task-id")
      );
      expect(mockTask.revertCompletion).toHaveBeenCalled();
      expect(mockTaskRepository.save).toHaveBeenCalledWith(mockTask);
    });

    it("should return error for invalid task ID format", async () => {
      const request: RevertTaskCompletionRequest = {
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
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: RevertTaskCompletionRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("TASK_NOT_FOUND");
        expect(result.error.message).toContain("Task not found");
      }
    });

    it("should publish domain events", async () => {
      const mockEvent = {
        type: "TaskCompletionReverted",
        taskId: "test-task-id",
      };
      const mockTask = createMockTask({
        revertCompletion: vi.fn().mockReturnValue([mockEvent]),
      });

      (mockTaskRepository.findById as any).mockResolvedValue(mockTask);
      (mockTaskRepository.save as any).mockResolvedValue(undefined);
      (mockDatabase.transaction as any).mockImplementation(
        async (_, __, callback) => {
          await callback();
        }
      );

      const request: RevertTaskCompletionRequest = {
        taskId: "test-task-id",
      };

      await useCase.execute(request);

      expect(mockEventBus.publishAll).toHaveBeenCalledWith([mockEvent]);
    });

    it("should handle transaction errors", async () => {
      (mockDatabase.transaction as any).mockRejectedValue(
        new Error("Transaction failed")
      );

      const request: RevertTaskCompletionRequest = {
        taskId: "test-task-id",
      };

      const result = await useCase.execute(request);

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("REVERT_FAILED");
        expect(result.error.message).toContain("Failed to revert task completion");
      }
    });
  });
});
