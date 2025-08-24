import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { container } from "tsyringe";
import { SupabaseRealtimeService } from "../../services/SupabaseRealtimeService";
import { taskEventBus } from "../../events/TaskEventBus";
import * as tokens from "../../di/tokens";

// Мокаем Supabase клиент
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  unsubscribe: vi.fn().mockResolvedValue({ error: null }),
};

const mockSupabaseClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeAllChannels: vi.fn().mockResolvedValue({ error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    }),
  },
};

const mockSupabaseClientFactory = {
  getClient: vi.fn().mockReturnValue(mockSupabaseClient),
};

const mockLogService = {
  logSystem: vi.fn(),
  logUserAction: vi.fn(),
};

const mockDailySelectionRepository = {
  getEntriesForDate: vi.fn(),
  addEntry: vi.fn(),
  removeEntry: vi.fn(),
};

const mockTaskRepository = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findById: vi.fn(),
  findByUserId: vi.fn(),
  findByUserIdAndStatus: vi.fn(),
  findByUserIdAndCategory: vi.fn(),
  findByUserIdAndDate: vi.fn(),
  findByUserIdAndDateRange: vi.fn(),
  findByUserIdAndFilters: vi.fn(),
  reorderTasks: vi.fn(),
  markAsCompleted: vi.fn(),
  markAsIncomplete: vi.fn(),
  defer: vi.fn(),
  undefer: vi.fn(),
};

describe("SupabaseRealtimeService", () => {
  let realtimeService: SupabaseRealtimeService;
  let mockCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Очищаем контейнер
    container.clearInstances();

    // Регистрируем моки
    container.registerInstance(
      tokens.SUPABASE_CLIENT_FACTORY_TOKEN,
      mockSupabaseClientFactory
    );
    container.registerInstance(tokens.LLM_SERVICE_TOKEN, mockLogService);
    container.registerInstance(
      tokens.DAILY_SELECTION_REPOSITORY_TOKEN,
      mockDailySelectionRepository
    );
    container.registerInstance(
      tokens.TASK_REPOSITORY_TOKEN,
      mockTaskRepository
    );

    // Создаем экземпляр сервиса
    realtimeService = container.resolve(SupabaseRealtimeService);

    // Создаем мок колбэка
    mockCallback = vi.fn();

    // Сбрасываем все моки
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.clearInstances();
  });

  describe("subscribeToTaskChanges", () => {
    it("should subscribe to task changes successfully", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act
      await realtimeService.subscribeToTaskChanges();

      // Assert
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        `tasks_${userId}`
      );
      expect(mockChannel.on).toHaveBeenCalledWith(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `user_id=eq.${userId}`,
        },
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
      expect(realtimeService.isTasksConnected()).toBe(true);
    });

    it("should handle subscription errors", async () => {
      // Arrange
      const userId = "user123";
      const mockError = { message: "Subscription failed" };
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("CHANNEL_ERROR", mockError);
        return mockChannel;
      });

      // Act & Assert
      await expect(realtimeService.subscribeToTaskChanges()).rejects.toThrow();
    });

    it("should not subscribe if already subscribed", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act - первая подписка
      await realtimeService.subscribeToTaskChanges();

      // Сбрасываем моки
      vi.clearAllMocks();

      // Act - вторая подписка
      await realtimeService.subscribeToTaskChanges();

      // Assert - второй раз не должен вызываться
      expect(mockSupabaseClient.channel).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToDailySelectionChanges", () => {
    it("should subscribe to daily selection changes successfully", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act
      await realtimeService.subscribeToDailySelectionChanges();

      // Assert
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        `daily_selection_${userId}`
      );
      expect(mockChannel.on).toHaveBeenCalledWith(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_selection_entries",
          filter: `user_id=eq.${userId}`,
        },
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
      expect(realtimeService.isDailySelectionConnected()).toBe(true);
    });

    it("should not subscribe if already subscribed", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act - первая подписка
      await realtimeService.subscribeToDailySelectionChanges();

      // Сбрасываем моки
      vi.clearAllMocks();

      // Act - вторая подписка
      await realtimeService.subscribeToDailySelectionChanges();

      // Assert - второй раз не должен вызываться
      expect(mockSupabaseClient.channel).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToAllChanges", () => {
    it("should subscribe to both tasks and daily selection changes", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act
      await realtimeService.subscribeToAllChanges();

      // Assert
      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        `tasks_${userId}`
      );
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        `daily_selection_${userId}`
      );
      expect(realtimeService.isTasksConnected()).toBe(true);
      expect(realtimeService.isDailySelectionConnected()).toBe(true);
      expect(realtimeService.isConnected()).toBe(true);
    });
  });

  describe("unsubscribeFromTaskChanges", () => {
    it("should unsubscribe successfully", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      // Сначала подписываемся
      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });
      await realtimeService.subscribeToTaskChanges();

      // Act
      await realtimeService.unsubscribeFromTaskChanges();

      // Assert
      expect(mockChannel.unsubscribe).toHaveBeenCalled();
      expect(realtimeService.isTasksConnected()).toBe(false);
    });

    it("should handle unsubscribe when not subscribed", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      // Act
      await realtimeService.unsubscribeFromTaskChanges();

      // Assert
      expect(mockChannel.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe("unsubscribeFromAllChanges", () => {
    it("should unsubscribe from all channels", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      // Сначала подписываемся
      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });
      await realtimeService.subscribeToAllChanges();

      // Act
      await realtimeService.unsubscribeFromAllChanges();

      // Assert
      expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(2);
      expect(realtimeService.isTasksConnected()).toBe(false);
      expect(realtimeService.isDailySelectionConnected()).toBe(false);
      expect(realtimeService.isConnected()).toBe(false);
    });
  });

  describe("handleDailySelectionChange", () => {
    beforeEach(() => {
      // Подписываемся на все события через taskEventBus
      taskEventBus.subscribeToAll(mockCallback);
    });

    it("should handle INSERT event for current date", () => {
      // Arrange
      const today = "2023-12-01"; // Use mocked date from test setup
      const payload = {
        eventType: "INSERT" as const,
        new: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        old: {},
        errors: null,
      };

      // Act
      (realtimeService as any).handleDailySelectionChange(payload);

      // Debug: Check if callback was called at all
      console.log("mockCallback call count:", mockCallback.mock.calls.length);
      if (mockCallback.mock.calls.length > 0) {
        console.log("mockCallback calls:", mockCallback.mock.calls);
      }

      // Assert
      expect(mockCallback).toHaveBeenCalledWith({
        type: "TASK_ADDED_TO_TODAY",
        taskId: "task-1",
        timestamp: expect.any(Date),
        data: {
          date: today,
        },
      });
    });

    it("should handle UPDATE event for current date", () => {
      // Arrange
      const today = "2023-12-01"; // Use mocked date from test setup
      const payload = {
        eventType: "UPDATE" as const,
        new: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: true,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        old: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        errors: null,
      };

      // Act
      (realtimeService as any).handleDailySelectionChange(payload);

      // Assert
      expect(mockCallback).toHaveBeenCalledWith({
        type: "TASK_ADDED_TO_TODAY",
        taskId: "task-1",
        timestamp: expect.any(Date),
        data: {
          date: today,
        },
      });
    });

    it("should handle soft delete (UPDATE with deleted_at) as DELETE event", () => {
      // Arrange
      const today = "2023-12-01"; // Use mocked date from test setup
      const payload = {
        eventType: "UPDATE" as const,
        new: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
        },
        old: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        errors: null,
      };

      // Act
      (realtimeService as any).handleDailySelectionChange(payload);

      // Assert
      expect(mockCallback).toHaveBeenCalledWith({
        type: "TASK_REMOVED_FROM_TODAY",
        taskId: "task-1",
        timestamp: expect.any(Date),
        data: {
          date: today,
        },
      });
    });

    it("should ignore soft-deleted records for INSERT events", () => {
      // Arrange
      const today = "2023-12-01"; // Use mocked date from test setup
      const payload = {
        eventType: "INSERT" as const,
        new: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(), // Уже удалена
        },
        old: {},
        errors: null,
      };

      // Act
      (realtimeService as any).handleDailySelectionChange(payload);

      // Assert
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("should ignore events for different dates", () => {
      // Arrange
      const yesterday = "2023-11-30"; // Use mocked yesterday from test setup
      const payload = {
        eventType: "INSERT" as const,
        new: {
          id: "1",
          date: yesterday,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        old: {},
        errors: null,
      };

      // Act
      (realtimeService as any).handleDailySelectionChange(payload);

      // Assert
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("should handle DELETE event for current date", async () => {
      // Arrange
      const today = "2023-12-01"; // Use mocked date from test setup
      const payload = {
        eventType: "DELETE" as const,
        new: {},
        old: {
          id: "1",
          date: today,
          task_id: "task-1",
          completed_flag: false,
          user_id: "user-1",
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        errors: null,
      };

      // Act
      try {
        console.log("About to call handleDailySelectionChange");
        await (realtimeService as any).handleDailySelectionChange(payload);
        console.log("handleDailySelectionChange completed");
      } catch (error) {
        console.error("Error in handleDailySelectionChange:", error);
        throw error;
      }

      // Assert
      expect(mockCallback).toHaveBeenCalledWith({
        type: "TASK_REMOVED_FROM_TODAY",
        taskId: "task-1",
        timestamp: expect.any(Date),
        data: {
          date: today,
        },
      });
    });
  });

  describe("connection status", () => {
    it("should return correct connection status", async () => {
      // Arrange
      const userId = "user123";
      realtimeService.setUserId(userId);

      mockChannel.subscribe.mockImplementation((callback) => {
        callback("SUBSCRIBED", null);
        return mockChannel;
      });

      // Act - изначально нет подключений
      expect(realtimeService.isConnected()).toBe(false);
      expect(realtimeService.isTasksConnected()).toBe(false);
      expect(realtimeService.isDailySelectionConnected()).toBe(false);

      // Подписываемся только на задачи
      await realtimeService.subscribeToTaskChanges();

      // Assert - подключены только задачи
      expect(realtimeService.isConnected()).toBe(true);
      expect(realtimeService.isTasksConnected()).toBe(true);
      expect(realtimeService.isDailySelectionConnected()).toBe(false);

      // Подписываемся на ежедневный выбор
      await realtimeService.subscribeToDailySelectionChanges();

      // Assert - подключены оба канала
      expect(realtimeService.isConnected()).toBe(true);
      expect(realtimeService.isTasksConnected()).toBe(true);
      expect(realtimeService.isDailySelectionConnected()).toBe(true);

      // Отписываемся от задач
      await realtimeService.unsubscribeFromTaskChanges();

      // Assert - подключен только ежедневный выбор
      expect(realtimeService.isConnected()).toBe(true);
      expect(realtimeService.isTasksConnected()).toBe(false);
      expect(realtimeService.isDailySelectionConnected()).toBe(true);

      // Отписываемся от всего
      await realtimeService.unsubscribeFromDailySelectionChanges();

      // Assert - ничего не подключено
      expect(realtimeService.isConnected()).toBe(false);
      expect(realtimeService.isTasksConnected()).toBe(false);
      expect(realtimeService.isDailySelectionConnected()).toBe(false);
    });
  });
});
