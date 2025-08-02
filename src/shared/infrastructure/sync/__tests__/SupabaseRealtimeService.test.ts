import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { container } from "tsyringe";
import { SupabaseRealtimeService } from "../../services/SupabaseRealtimeService";
import { SupabaseClientFactory } from "../../database/SupabaseClient";
import { TaskLogService } from "../../../application/services/TaskLogService";
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
};

const mockSupabaseClientFactory = {
  getClient: vi.fn().mockReturnValue(mockSupabaseClient),
};

const mockLogService = {
  logSystem: vi.fn(),
  logUserAction: vi.fn(),
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
    container.registerInstance(tokens.LOG_SERVICE_TOKEN, mockLogService);

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

  describe("subscribeToTasks", () => {
    it("should subscribe to task changes successfully", async () => {
      // Arrange
      const userId = "user123";
      mockChannel.subscribe.mockReturnValue({ error: null });

      // Act
      const result = await realtimeService.subscribeToTasks(
        userId,
        mockCallback
      );

      // Assert
      expect(result.success).toBe(true);
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        `tasks:user_id=eq.${userId}`
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
      // Логирование системных событий удалено
    });

    it("should handle subscription errors", async () => {
      // Arrange
      const userId = "user123";
      const mockError = { message: "Subscription failed" };
      mockChannel.subscribe.mockReturnValue({ error: mockError });

      // Act
      const result = await realtimeService.subscribeToTasks(
        userId,
        mockCallback
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SUBSCRIPTION_ERROR");
      expect(result.error?.details).toBe(mockError);
    });

    it("should handle callback execution", async () => {
      // Arrange
      const userId = "user123";
      let capturedCallback: Function;

      mockChannel.on.mockImplementation((event, config, callback) => {
        capturedCallback = callback;
        return mockChannel;
      });
      mockChannel.subscribe.mockReturnValue({ error: null });

      // Act
      await realtimeService.subscribeToTasks(userId, mockCallback);

      // Simulate a change event
      const mockPayload = {
        eventType: "INSERT",
        new: { id: "1", title: "New Task", user_id: userId },
        old: null,
      };
      capturedCallback(mockPayload);

      // Assert
      expect(mockCallback).toHaveBeenCalledWith({
        type: "INSERT",
        record: mockPayload.new,
        oldRecord: null,
      });
    });
  });

  describe("unsubscribeFromTasks", () => {
    it("should unsubscribe successfully", async () => {
      // Arrange
      const userId = "user123";

      // Сначала подписываемся
      mockChannel.subscribe.mockReturnValue({ error: null });
      await realtimeService.subscribeToTasks(userId, mockCallback);

      // Мокаем успешную отписку
      mockChannel.unsubscribe.mockResolvedValue({ error: null });

      // Act
      const result = await realtimeService.unsubscribeFromTasks(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockChannel.unsubscribe).toHaveBeenCalled();
      // Логирование системных событий удалено
    });

    it("should handle unsubscribe errors", async () => {
      // Arrange
      const userId = "user123";
      const mockError = { message: "Unsubscribe failed" };

      // Сначала подписываемся
      mockChannel.subscribe.mockReturnValue({ error: null });
      await realtimeService.subscribeToTasks(userId, mockCallback);

      // Мокаем ошибку отписки
      mockChannel.unsubscribe.mockResolvedValue({ error: mockError });

      // Act
      const result = await realtimeService.unsubscribeFromTasks(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("UNSUBSCRIBE_ERROR");
      expect(result.error?.details).toBe(mockError);
    });

    it("should handle unsubscribe when not subscribed", async () => {
      // Arrange
      const userId = "user123";

      // Act
      const result = await realtimeService.unsubscribeFromTasks(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockChannel.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should disconnect all channels successfully", async () => {
      // Arrange
      const userId1 = "user123";
      const userId2 = "user456";

      // Подписываемся на несколько каналов
      mockChannel.subscribe.mockReturnValue({ error: null });
      await realtimeService.subscribeToTasks(userId1, mockCallback);
      await realtimeService.subscribeToTasks(userId2, mockCallback);

      // Мокаем успешное отключение
      mockSupabaseClient.removeAllChannels.mockResolvedValue({ error: null });

      // Act
      const result = await realtimeService.disconnect();

      // Assert
      expect(result.success).toBe(true);
      expect(mockSupabaseClient.removeAllChannels).toHaveBeenCalled();
      // Логирование системных событий удалено
    });

    it("should handle disconnect errors", async () => {
      // Arrange
      const mockError = { message: "Disconnect failed" };
      mockSupabaseClient.removeAllChannels.mockResolvedValue({
        error: mockError,
      });

      // Act
      const result = await realtimeService.disconnect();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("DISCONNECT_ERROR");
      expect(result.error?.details).toBe(mockError);
    });
  });

  describe("getConnectionStatus", () => {
    it("should return connection status", () => {
      // Arrange
      const userId1 = "user123";
      const userId2 = "user456";

      // Act - изначально нет подключений
      let status = realtimeService.getConnectionStatus();
      expect(status.isConnected).toBe(false);
      expect(status.activeSubscriptions).toBe(0);
      expect(status.subscribedUsers).toEqual([]);

      // Подписываемся
      mockChannel.subscribe.mockReturnValue({ error: null });
      realtimeService.subscribeToTasks(userId1, mockCallback);
      realtimeService.subscribeToTasks(userId2, mockCallback);

      // Act - после подписки
      status = realtimeService.getConnectionStatus();

      // Assert
      expect(status.isConnected).toBe(true);
      expect(status.activeSubscriptions).toBe(2);
      expect(status.subscribedUsers).toContain(userId1);
      expect(status.subscribedUsers).toContain(userId2);
    });
  });
});
