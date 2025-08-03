import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSync } from "../useSync";
import { syncInitializer } from "../../../infrastructure/sync/SyncInitializer";

// Мокаем SyncInitializer
vi.mock("../../../infrastructure/sync/SyncInitializer", () => {
  const mockSyncService = {
    performSync: vi.fn(),
    performBackgroundSync: vi.fn(),
    forcePushLocalChanges: vi.fn(),
    getSyncStatus: vi.fn(),
  };

  const mockRealtimeService = {
    subscribeToTasks: vi.fn(),
    unsubscribeFromTasks: vi.fn(),
    getConnectionStatus: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockSyncInitializer = {
    getSyncService: vi.fn().mockReturnValue(mockSyncService),
    getRealtimeService: vi.fn().mockReturnValue(mockRealtimeService),
    enableAutoSync: vi.fn(),
    disableAutoSync: vi.fn(),
    enableRealtimeSubscriptions: vi.fn(),
    disableRealtimeSubscriptions: vi.fn(),
    getStatus: vi.fn(),
  };

  return {
    syncInitializer: mockSyncInitializer,
    mockSyncService,
    mockRealtimeService,
  };
});

// Мокаем navigator.onLine
Object.defineProperty(navigator, "onLine", {
  writable: true,
  value: true,
});

// Мокаем window события
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
Object.defineProperty(window, "addEventListener", {
  value: mockAddEventListener,
});
Object.defineProperty(window, "removeEventListener", {
  value: mockRemoveEventListener,
});

describe("useSync", () => {
  const { mockSyncService, mockRealtimeService } = vi.mocked(
    await import("../../../infrastructure/sync/SyncInitializer")
  );

  beforeEach(() => {
    vi.clearAllMocks();

    // Устанавливаем дефолтные возвращаемые значения
    mockSyncService.getSyncStatus.mockResolvedValue({
      lastSyncAt: new Date(),
      error: null,
    });

    mockRealtimeService.getConnectionStatus.mockReturnValue({
      isConnected: false,
      activeSubscriptions: 0,
      subscribedUsers: [],
    });

    vi.mocked(syncInitializer.getStatus).mockReturnValue({
      isInitialized: true,
      autoSyncEnabled: false,
      realtimeEnabled: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with default state", () => {
      // Act
      const { result } = renderHook(() => useSync());

      // Assert
      expect(result.current.isOnline).toBe(true);
      expect(result.current.syncStatus).toBe("idle");
      expect(result.current.lastSyncAt).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.realtimeStatus).toEqual({
        isConnected: false,
        activeSubscriptions: 0,
        subscribedUsers: [],
      });
    });

    it("should setup online/offline listeners", () => {
      // Act
      renderHook(() => useSync());

      // Assert
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      );
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "offline",
        expect.any(Function)
      );
    });

    it("should cleanup listeners on unmount", () => {
      // Act
      const { unmount } = renderHook(() => useSync());
      unmount();

      // Assert
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "online",
        expect.any(Function)
      );
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "offline",
        expect.any(Function)
      );
    });
  });

  describe("sync operations", () => {
    it("should perform manual sync successfully", async () => {
      // Arrange
      const mockResult = {
        success: true,
        pushedCount: 2,
        pulledCount: 3,
        conflictsResolved: 1,
        error: null,
      };
      mockSyncService.performSync.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.performSync();
      });

      // Assert
      expect(mockSyncService.performSync).toHaveBeenCalled();
      expect(result.current.syncStatus).toBe("idle");
    });

    it("should handle sync errors", async () => {
      // Arrange
      const mockResult = {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
        error: {
          code: "NETWORK_ERROR",
          message: "Network failed",
          details: new Error("Connection timeout"),
        },
      };
      mockSyncService.performSync.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.performSync();
      });

      // Assert
      expect(result.current.error).toEqual(mockResult.error);
      expect(result.current.syncStatus).toBe("idle");
    });

    it("should force push local changes", async () => {
      // Arrange
      const mockResult = {
        success: true,
        pushedCount: 5,
        pulledCount: 0,
        conflictsResolved: 0,
        error: null,
      };
      mockSyncService.forcePushLocalChanges.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.forcePushLocalChanges();
      });

      // Assert
      expect(mockSyncService.forcePushLocalChanges).toHaveBeenCalled();
    });
  });

  describe("auto sync control", () => {
    it("should enable auto sync", async () => {
      // Arrange
      vi.mocked(syncInitializer.enableAutoSync).mockResolvedValue({
        success: true,
        error: null,
      });

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.enableAutoSync();
      });

      // Assert
      expect(syncInitializer.enableAutoSync).toHaveBeenCalled();
    });

    it("should disable auto sync", async () => {
      // Arrange
      vi.mocked(syncInitializer.disableAutoSync).mockResolvedValue({
        success: true,
        error: null,
      });

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.disableAutoSync();
      });

      // Assert
      expect(syncInitializer.disableAutoSync).toHaveBeenCalled();
    });
  });

  describe("realtime control", () => {
    it("should enable realtime subscriptions", async () => {
      // Arrange
      vi.mocked(syncInitializer.enableRealtimeSubscriptions).mockResolvedValue({
        success: true,
        error: null,
      });

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.enableRealtime();
      });

      // Assert
      expect(syncInitializer.enableRealtimeSubscriptions).toHaveBeenCalled();
    });

    it("should disable realtime subscriptions", async () => {
      // Arrange
      vi.mocked(syncInitializer.disableRealtimeSubscriptions).mockResolvedValue(
        {
          success: true,
          error: null,
        }
      );

      const { result } = renderHook(() => useSync());

      // Act
      await act(async () => {
        await result.current.disableRealtime();
      });

      // Assert
      expect(syncInitializer.disableRealtimeSubscriptions).toHaveBeenCalled();
    });
  });

  describe("online/offline handling", () => {
    it("should update online status when going offline", () => {
      // Arrange
      const { result } = renderHook(() => useSync());
      expect(result.current.isOnline).toBe(true);

      // Act - симулируем offline событие
      act(() => {
        Object.defineProperty(navigator, "onLine", { value: false });
        const offlineHandler = mockAddEventListener.mock.calls.find(
          (call) => call[0] === "offline"
        )?.[1];
        offlineHandler?.();
      });

      // Assert
      expect(result.current.isOnline).toBe(false);
    });

    it("should update online status when going online", () => {
      // Arrange
      Object.defineProperty(navigator, "onLine", { value: false });
      const { result } = renderHook(() => useSync());
      expect(result.current.isOnline).toBe(false);

      // Act - симулируем online событие
      act(() => {
        Object.defineProperty(navigator, "onLine", { value: true });
        const onlineHandler = mockAddEventListener.mock.calls.find(
          (call) => call[0] === "online"
        )?.[1];
        onlineHandler?.();
      });

      // Assert
      expect(result.current.isOnline).toBe(true);
    });
  });

  describe("status updates", () => {
    it("should update sync status periodically", async () => {
      // Arrange
      const mockStatus = {
        lastSyncAt: new Date("2024-01-01T12:00:00Z"),
        error: null,
      };
      mockSyncService.getSyncStatus.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useSync());

      // Act - ждем обновления статуса
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Assert
      expect(mockSyncService.getSyncStatus).toHaveBeenCalled();
    });

    it("should update realtime status periodically", async () => {
      // Arrange
      const mockStatus = {
        isConnected: true,
        activeSubscriptions: 2,
        subscribedUsers: ["user1", "user2"],
      };
      mockRealtimeService.getConnectionStatus.mockReturnValue(mockStatus);

      const { result } = renderHook(() => useSync());

      // Act - ждем обновления статуса
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Assert
      expect(result.current.realtimeStatus).toEqual(mockStatus);
    });
  });
});
