import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RemoveTaskFromTodayUseCase,
  RemoveTaskFromTodayRequest,
} from "../RemoveTaskFromTodayUseCase";
import { DailySelectionRepository } from "../../../domain/repositories/DailySelectionRepository";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { DateOnly } from "../../../domain/value-objects/DateOnly";
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

describe("RemoveTaskFromTodayUseCase", () => {
  let useCase: RemoveTaskFromTodayUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new RemoveTaskFromTodayUseCase(mockDailySelectionRepository);
  });

  describe("execute", () => {
    it("should remove task from today successfully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: RemoveTaskFromTodayRequest = {
        taskId: taskId.value,
      };

      vi.mocked(
        mockDailySelectionRepository.removeTaskFromDay
      ).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(
        mockDailySelectionRepository.removeTaskFromDay
      ).toHaveBeenCalledWith(DateOnly.today(), taskId);
    });

    it("should remove task from specific date successfully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const specificDate = "2024-01-15";
      const request: RemoveTaskFromTodayRequest = {
        taskId: taskId.value,
        date: specificDate,
      };

      vi.mocked(
        mockDailySelectionRepository.removeTaskFromDay
      ).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(
        mockDailySelectionRepository.removeTaskFromDay
      ).toHaveBeenCalledWith(DateOnly.fromString(specificDate), taskId);
    });

    it("should fail with invalid task ID", async () => {
      // Arrange
      const request: RemoveTaskFromTodayRequest = {
        taskId: "invalid-id",
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("INVALID_TASK_ID");
      }

      expect(
        mockDailySelectionRepository.removeTaskFromDay
      ).not.toHaveBeenCalled();
    });

    it("should fail with invalid date format", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: RemoveTaskFromTodayRequest = {
        taskId: taskId.value,
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
        mockDailySelectionRepository.removeTaskFromDay
      ).not.toHaveBeenCalled();
    });

    it("should handle repository failure", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: RemoveTaskFromTodayRequest = {
        taskId: taskId.value,
      };

      vi.mocked(
        mockDailySelectionRepository.removeTaskFromDay
      ).mockRejectedValue(new Error("Database error"));

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe("REMOVE_FAILED");
        expect(result.error.message).toContain("Database error");
      }

      expect(
        mockDailySelectionRepository.removeTaskFromDay
      ).toHaveBeenCalledTimes(1);
    });

    it("should handle non-existent task gracefully", async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: RemoveTaskFromTodayRequest = {
        taskId: taskId.value,
      };

      // Repository doesn't throw for non-existent entries
      vi.mocked(
        mockDailySelectionRepository.removeTaskFromDay
      ).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(
        mockDailySelectionRepository.removeTaskFromDay
      ).toHaveBeenCalledWith(DateOnly.today(), taskId);
    });
  });
});
