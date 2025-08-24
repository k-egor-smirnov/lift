import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSync } from "../useSync";

// Мокаем DI контейнер для синхронизации
vi.mock("../../../infrastructure/di/syncContainer", () => {
  const mockSyncService = {
    performSync: vi.fn(),
    performBackgroundSync: vi.fn(),
    forcePushLocalChanges: vi.fn(),
    getSyncStatus: vi.fn(),
  };

  const mockRealtimeService = {
    subscribeToTaskChanges: vi.fn(),
    unsubscribeFromTaskChanges: vi.fn(),
    isConnected: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    getSyncService: vi.fn().mockReturnValue(mockSyncService),
    getRealtimeService: vi.fn().mockReturnValue(mockRealtimeService),
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
  let mockSyncService: any;
  let mockRealtimeService: any;

  beforeAll(() => {
    const module = vi.mocked(
      require("../../../infrastructure/di/syncContainer")
    );
    mockSyncService = module.mockSyncService;
    mockRealtimeService = module.mockRealtimeService;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Устанавливаем дефолтные возвращаемые значения
    mockSyncService.getSyncStatus.mockResolvedValue({
      lastSyncAt: new Date(),
      error: null,
    });

    mockRealtimeService.isConnected.mockReturnValue(false);
    mockRealtimeService.getConnectionStatus = vi.fn().mockReturnValue({
      isConnected: false,
      activeSubscriptions: 0,
      subscribedUsers: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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

  describe("periodic status updates", () => {
    it("should update sync status periodically", async () => {
      // Arrange
      const mockStatus = {
        lastSyncAt: new Date("2024-01-01T12:00:00Z"),
        error: null,
      };
      mockSyncService.getSyncStatus.mockResolvedValue(mockStatus);

      const { result } = renderHook(() => useSync());

      // Act - симулируем прохождение времени
      await act(async () => {
        vi.advanceTimersByTime(30000); // 30 секунд
        await vi.runAllTimersAsync();
      });

      // Assert
      expect(mockSyncService.getSyncStatus).toHaveBeenCalled();
      expect(result.current.lastSyncAt).toEqual(mockStatus.lastSyncAt);
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

      // Act - симулируем прохождение времени
      await act(async () => {
        vi.advanceTimersByTime(30000); // 30 секунд
        await vi.runAllTimersAsync();
      });

      // Assert
      expect(result.current.realtimeStatus).toEqual(mockStatus);
    });
  });
});
