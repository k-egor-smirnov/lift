import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { container } from "tsyringe";
import { SyncService } from "../../../application/services/SyncService";
import { TaskRepository } from "../../../domain/repositories/TaskRepository";
import type { SyncRepository } from "../../../domain/repositories/SyncRepository";
import { TaskLogService } from "../../../application/services/TaskLogService";
import { Task } from "../../../domain/entities/Task";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../domain/value-objects/NonEmptyTitle";
import * as tokens from "../../di/tokens";

// Мокаем зависимости
const mockTaskRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findOverdue: vi.fn(),
  findDeleted: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  exists: vi.fn(),
};

const mockSyncRepository = {
  initializeUser: vi.fn(),
  syncTasks: vi.fn(),
  pushTasks: vi.fn(),
  pullTasks: vi.fn(),
  resolveConflict: vi.fn(),
  isOnline: vi.fn(),
  getLastSyncTimestamp: vi.fn(),
  setLastSyncTimestamp: vi.fn(),
};

const mockLogService = {
  logSystem: vi.fn(),
  logUserAction: vi.fn(),
};

describe("SyncService", () => {
  let syncService: SyncService;

  beforeEach(() => {
    // Очищаем контейнер
    container.clearInstances();

    // Регистрируем моки
    container.registerInstance(
      tokens.TASK_REPOSITORY_TOKEN,
      mockTaskRepository
    );
    container.registerInstance(
      tokens.SYNC_REPOSITORY_TOKEN,
      mockSyncRepository
    );
    container.registerInstance(tokens.LOG_SERVICE_TOKEN, mockLogService);

    // Создаем экземпляр сервиса
    syncService = container.resolve(SyncService);

    // Сбрасываем все моки
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.clearInstances();
  });

  describe("performSync", () => {
    it("should perform successful sync", async () => {
      // Arrange
      const mockResult = {
        success: true,
        pushedCount: 2,
        pulledCount: 3,
        conflictsResolved: 1,
        error: null,
      };

      mockSyncRepository.isOnline.mockResolvedValue(true);
      mockSyncRepository.syncTasks.mockResolvedValue(mockResult);

      // Act
      const result = await syncService.performSync();

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockSyncRepository.isOnline).toHaveBeenCalled();
      expect(mockSyncRepository.syncTasks).toHaveBeenCalled();
      // Логирование системных событий удалено
    });

    it("should handle offline state", async () => {
      // Arrange
      mockSyncRepository.isOnline.mockResolvedValue(false);

      // Act
      const result = await syncService.performSync();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("OFFLINE");
      expect(mockSyncRepository.syncTasks).not.toHaveBeenCalled();
    });

    it("should handle sync errors", async () => {
      // Arrange
      const mockError = new Error("Network error");
      mockSyncRepository.isOnline.mockResolvedValue(true);
      mockSyncRepository.syncTasks.mockRejectedValue(mockError);

      // Act
      const result = await syncService.performSync();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SYNC_ERROR");
      expect(result.error?.details).toBe(mockError);
    });
  });

  describe("performBackgroundSync", () => {
    it("should perform background sync when online", async () => {
      // Arrange
      const mockResult = {
        success: true,
        pushedCount: 1,
        pulledCount: 2,
        conflictsResolved: 0,
        error: null,
      };

      mockSyncRepository.isOnline.mockResolvedValue(true);
      mockSyncRepository.syncTasks.mockResolvedValue(mockResult);

      // Act
      const result = await syncService.performBackgroundSync();

      // Assert
      expect(result).toEqual(mockResult);
      // Логирование системных событий удалено
    });

    it("should skip background sync when offline", async () => {
      // Arrange
      mockSyncRepository.isOnline.mockResolvedValue(false);

      // Act
      const result = await syncService.performBackgroundSync();

      // Assert
      expect(result.success).toBe(true);
      expect(result.pushedCount).toBe(0);
      expect(result.pulledCount).toBe(0);
      expect(mockSyncRepository.syncTasks).not.toHaveBeenCalled();
    });
  });

  describe("forcePushLocalChanges", () => {
    it("should push local changes successfully", async () => {
      // Arrange
      const mockTasks = [
        new Task(
          new TaskId("1"),
          new NonEmptyTitle("Test Task"),
          "inbox",
          "active",
          0,
          new Date(),
          new Date()
        ),
      ];

      const mockResult = {
        success: true,
        pushedCount: 1,
        pulledCount: 0,
        conflictsResolved: 0,
        error: null,
      };

      mockSyncRepository.isOnline.mockResolvedValue(true);
      mockTaskRepository.findAll.mockResolvedValue(mockTasks);
      mockSyncRepository.pushTasks.mockResolvedValue(mockResult);

      // Act
      const result = await syncService.forcePushLocalChanges();

      // Assert
      expect(result).toEqual(mockResult);
      expect(mockTaskRepository.findAll).toHaveBeenCalled();
      expect(mockSyncRepository.pushTasks).toHaveBeenCalledWith(mockTasks);
    });

    it("should handle push errors", async () => {
      // Arrange
      const mockError = new Error("Push failed");
      mockSyncRepository.isOnline.mockResolvedValue(true);
      mockTaskRepository.findAll.mockResolvedValue([]);
      mockSyncRepository.pushTasks.mockRejectedValue(mockError);

      // Act
      const result = await syncService.forcePushLocalChanges();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PUSH_ERROR");
    });
  });

  describe("getSyncStatus", () => {
    it("should return sync status", async () => {
      // Arrange
      const mockTimestamp = new Date();
      mockSyncRepository.getLastSyncTimestamp.mockResolvedValue(mockTimestamp);

      // Act
      const status = await syncService.getSyncStatus();

      // Assert
      expect(status.lastSyncAt).toBe(mockTimestamp);
      expect(status.error).toBeNull();
    });

    it("should handle status errors", async () => {
      // Arrange
      const mockError = new Error("Status error");
      mockSyncRepository.getLastSyncTimestamp.mockRejectedValue(mockError);

      // Act
      const status = await syncService.getSyncStatus();

      // Assert
      expect(status.lastSyncAt).toBeNull();
      expect(status.error?.code).toBe("STATUS_ERROR");
    });
  });
});
