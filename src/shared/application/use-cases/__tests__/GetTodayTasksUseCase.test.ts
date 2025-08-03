import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GetTodayTasksUseCase,
  GetTodayTasksRequest,
} from "../GetTodayTasksUseCase";
import {
  DailySelectionRepository,
  DailySelectionEntry,
} from "../../../domain/repositories/DailySelectionRepository";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import { DateOnly } from "../../../domain/value-objects/DateOnly";
import { TaskCategory, TaskStatus } from "../../../domain/types";
import { ResultUtils } from "../../../domain/Result";

// Mock implementations
const mockDailySelectionRepository: DailySelectionRepository = {
  addTaskToDay: vi.fn(),
  removeTaskFromDay: vi.fn(),
  getTasksForDay: vi.fn(),
  getTaskIdsForDay: vi.fn(),
  isTaskSelectedForDay: vi.fn(),
  markTaskCompleted: vi.fn(),
  getTaskCompletionStatus: vi.fn(),
  getDailySelectionsForRange: vi.fn(),
  clearDay: vi.fn(),
  countTasksForDay: vi.fn(),
  getLastSelectionDateForTask: vi.fn(),
};

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

describe("GetTodayTasksUseCase", () => {
  let useCase: GetTodayTasksUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GetTodayTasksUseCase(
      mockDailySelectionRepository,
      mockTaskRepository
    );
  });

  describe("execute", () => {
    it("should get today's tasks successfully", async () => {
      // Arrange
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const task1 = new Task(
        taskId1,
        NonEmptyTitle.fromString("Task 1"),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE
      );
      const task2 = new Task(
        taskId2,
        NonEmptyTitle.fromString("Task 2"),
        TaskCategory.FOCUS,
        TaskStatus.ACTIVE
      );

      const selectionEntries: DailySelectionEntry[] = [
        {
          date: DateOnly.today(),
          taskId: taskId1,
          completedFlag: false,
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          date: DateOnly.today(),
          taskId: taskId2,
          completedFlag: true,
          createdAt: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      const request: GetTodayTasksRequest = {};

      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        selectionEntries
      );
      vi.mocked(mockTaskRepository.findById)
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        const response = result.data;
        expect(response.tasks).toHaveLength(2);
        expect(response.totalCount).toBe(2);
        expect(response.completedCount).toBe(1);
        expect(response.activeCount).toBe(1);
        expect(response.date).toBe(DateOnly.today().value);

        // Check sorting (most recent first)
        expect(response.tasks[0].task.id.value).toBe(taskId2.value);
        expect(response.tasks[0].completedInSelection).toBe(true);
        expect(response.tasks[1].task.id.value).toBe(taskId1.value);
        expect(response.tasks[1].completedInSelection).toBe(false);
      }

      expect(mockDailySelectionRepository.getTasksForDay).toHaveBeenCalledWith(
        DateOnly.today()
      );
      expect(mockTaskRepository.findById).toHaveBeenCalledTimes(2);
    });

    it("should get tasks for specific date", async () => {
      // Arrange
      const specificDate = "2024-01-15";
      const taskId = TaskId.generate();
      const task = new Task(
        taskId,
        NonEmptyTitle.fromString("Task"),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE
      );

      const selectionEntries: DailySelectionEntry[] = [
        {
          date: DateOnly.fromString(specificDate),
          taskId,
          completedFlag: false,
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      const request: GetTodayTasksRequest = {
        date: specificDate,
      };

      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        selectionEntries
      );
      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.date).toBe(specificDate);
        expect(result.data.tasks).toHaveLength(1);
      }

      expect(mockDailySelectionRepository.getTasksForDay).toHaveBeenCalledWith(
        DateOnly.fromString(specificDate)
      );
    });

    it("should filter out completed tasks when requested", async () => {
      // Arrange
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const task1 = new Task(
        taskId1,
        NonEmptyTitle.fromString("Active Task"),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE
      );
      const task2 = new Task(
        taskId2,
        NonEmptyTitle.fromString("Completed Task"),
        TaskCategory.FOCUS,
        TaskStatus.ACTIVE
      );

      const selectionEntries: DailySelectionEntry[] = [
        {
          date: DateOnly.today(),
          taskId: taskId1,
          completedFlag: false,
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          date: DateOnly.today(),
          taskId: taskId2,
          completedFlag: true,
          createdAt: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      const request: GetTodayTasksRequest = {
        includeCompleted: false,
      };

      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        selectionEntries
      );
      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.tasks).toHaveLength(1);
        expect(result.data.tasks[0].completedInSelection).toBe(false);
        expect(result.data.totalCount).toBe(1);
        expect(result.data.completedCount).toBe(0);
        expect(result.data.activeCount).toBe(1);
      }

      // Should only call findById for the active task
      expect(mockTaskRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId1);
    });

    it("should handle deleted tasks gracefully", async () => {
      // Arrange
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const task1 = new Task(
        taskId1,
        NonEmptyTitle.fromString("Active Task"),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE
      );
      const deletedTask = new Task(
        taskId2,
        NonEmptyTitle.fromString("Deleted Task"),
        TaskCategory.FOCUS,
        TaskStatus.ACTIVE
      );
      deletedTask.softDelete(); // Mark as deleted

      const selectionEntries: DailySelectionEntry[] = [
        {
          date: DateOnly.today(),
          taskId: taskId1,
          completedFlag: false,
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          date: DateOnly.today(),
          taskId: taskId2,
          completedFlag: false,
          createdAt: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        selectionEntries
      );
      vi.mocked(mockTaskRepository.findById)
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(deletedTask);

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        // Should only include the non-deleted task
        expect(result.data.tasks).toHaveLength(1);
        expect(result.data.tasks[0].task.id.value).toBe(taskId1.value);
      }
    });

    it("should handle missing tasks gracefully", async () => {
      // Arrange
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const task1 = new Task(
        taskId1,
        NonEmptyTitle.fromString("Existing Task"),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE
      );

      const selectionEntries: DailySelectionEntry[] = [
        {
          date: DateOnly.today(),
          taskId: taskId1,
          completedFlag: false,
          createdAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          date: DateOnly.today(),
          taskId: taskId2,
          completedFlag: false,
          createdAt: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        selectionEntries
      );
      vi.mocked(mockTaskRepository.findById)
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(null); // Task not found

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        // Should only include the existing task
        expect(result.data.tasks).toHaveLength(1);
        expect(result.data.tasks[0].task.id.value).toBe(taskId1.value);
      }
    });

    it("should return empty result when no tasks selected", async () => {
      // Arrange
      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockResolvedValue(
        []
      );

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      if (ResultUtils.isSuccess(result)) {
        expect(result.data.tasks).toHaveLength(0);
        expect(result.data.totalCount).toBe(0);
        expect(result.data.completedCount).toBe(0);
        expect(result.data.activeCount).toBe(0);
      }

      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
    });

    it("should fail with invalid date format", async () => {
      // Arrange
      const request: GetTodayTasksRequest = {
        date: "invalid-date",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_DATE");
      }

      expect(
        mockDailySelectionRepository.getTasksForDay
      ).not.toHaveBeenCalled();
    });

    it("should handle repository failure", async () => {
      // Arrange
      vi.mocked(mockDailySelectionRepository.getTasksForDay).mockRejectedValue(
        new Error("Database error")
      );

      // Act
      const result = await useCase.execute();

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("GET_FAILED");
        expect(result.error.message).toContain("Database error");
      }
    });
  });
});
