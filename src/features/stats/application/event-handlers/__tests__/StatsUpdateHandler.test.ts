import { describe, it, expect, beforeEach, vi } from "vitest";
import { StatsUpdateHandler } from "../StatsUpdateHandler";
import { TodoDatabase } from "../../../../../shared/infrastructure/database/TodoDatabase";
import { StatisticsService } from "../../services/StatisticsService";
import {
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskReviewedEvent,
} from "../../../../../shared/domain/events/TaskEvents";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";
import { TaskCategory } from "../../../../../shared/domain/types";

// Mock StatisticsService
vi.mock("../../services/StatisticsService");

const mockDatabase = {} as TodoDatabase;

describe("StatsUpdateHandler", () => {
  let handler: StatsUpdateHandler;
  let mockStatisticsService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new StatsUpdateHandler(mockDatabase);

    // Get the mocked StatisticsService instance
    mockStatisticsService = vi.mocked(StatisticsService).mock.instances[0];
    mockStatisticsService.recordTaskCompletion = vi.fn();
    mockStatisticsService.revertTaskCompletion = vi.fn();
    mockStatisticsService.recordInboxReview = vi.fn();
  });

  describe("handleTaskCompleted", () => {
    it("should record task completion in statistics", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

      await handler.handle(event);

      expect(mockStatisticsService.recordTaskCompletion).toHaveBeenCalledWith(
        taskId.value,
        TaskCategory.SIMPLE,
        new Date(event.createdAt)
      );
    });

    it("should handle statistics service errors gracefully", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

      mockStatisticsService.recordTaskCompletion.mockRejectedValue(
        new Error("Statistics service error")
      );

      // Should not throw
      await expect(handler.handle(event)).resolves.not.toThrow();

      expect(mockStatisticsService.recordTaskCompletion).toHaveBeenCalled();
    });
  });

  describe("handleTaskCompletionReverted", () => {
    it("should revert task completion in statistics", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletionRevertedEvent(taskId, TaskCategory.FOCUS);

      await handler.handle(event);

      expect(mockStatisticsService.revertTaskCompletion).toHaveBeenCalledWith(
        taskId.value,
        TaskCategory.FOCUS,
        new Date(event.createdAt)
      );
    });

    it("should handle statistics service errors gracefully", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletionRevertedEvent(taskId, TaskCategory.FOCUS);

      mockStatisticsService.revertTaskCompletion.mockRejectedValue(
        new Error("Statistics service error")
      );

      // Should not throw
      await expect(handler.handle(event)).resolves.not.toThrow();

      expect(mockStatisticsService.revertTaskCompletion).toHaveBeenCalled();
    });
  });

  describe("handleTaskReviewed", () => {
    it("should record inbox review in statistics", async () => {
      const taskId = TaskId.generate();
      const reviewedAt = new Date();
      const event = new TaskReviewedEvent(taskId, reviewedAt);

      await handler.handle(event);

      expect(mockStatisticsService.recordInboxReview).toHaveBeenCalledWith(
        taskId.value,
        new Date(event.createdAt)
      );
    });

    it("should handle statistics service errors gracefully", async () => {
      const taskId = TaskId.generate();
      const reviewedAt = new Date();
      const event = new TaskReviewedEvent(taskId, reviewedAt);

      mockStatisticsService.recordInboxReview.mockRejectedValue(
        new Error("Statistics service error")
      );

      // Should not throw
      await expect(handler.handle(event)).resolves.not.toThrow();

      expect(mockStatisticsService.recordInboxReview).toHaveBeenCalled();
    });
  });

  describe("error resilience", () => {
    it("should continue processing even if statistics update fails", async () => {
      const taskId = TaskId.generate();
      const event = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

      // Mock console.error to verify error logging
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockStatisticsService.recordTaskCompletion.mockRejectedValue(
        new Error("Database connection failed")
      );

      await handler.handle(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to update statistics for task completion:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("handler identification", () => {
    it("should have correct handler ID", () => {
      expect(handler.id).toBe("stats-update-handler");
    });
  });
});
