import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSyncService,
  getRealtimeService,
} from "../../infrastructure/di/syncContainer";
import { SyncService } from "../../application/services/SyncService";
import { SupabaseRealtimeService } from "../../infrastructure/services/SupabaseRealtimeService";
import {
  SyncResult,
  SyncError,
} from "../../domain/repositories/SyncRepository";

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: SyncError | null;
  isRealtimeConnected: boolean;
}

export interface UseSyncReturn {
  // Состояние
  isOnline: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSyncAt: Date | null;
  error: SyncError | null;
  realtimeStatus: "connected" | "disconnected" | "connecting";

  // Методы
  performSync: () => Promise<void>;
  forcePushLocalChanges: () => Promise<void>;
  enableAutoSync: (enabled: boolean) => Promise<void>;
  enableRealtime: (enabled: boolean) => Promise<void>;

  // Внутреннее состояние для совместимости
  status: SyncStatus;
  sync: () => Promise<SyncResult>;
  forcePush: () => Promise<SyncResult>;
}

/**
 * Хук для работы с синхронизацией данных
 * Предоставляет состояние синхронизации и методы управления
 */
export function useSync(): UseSyncReturn {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    isRealtimeConnected: false,
  });

  const syncServiceRef = useRef<SyncService | null>(null);
  const realtimeServiceRef = useRef<SupabaseRealtimeService | null>(null);
  const autoSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Инициализация сервисов
  useEffect(() => {
    try {
      syncServiceRef.current = getSyncService();
      realtimeServiceRef.current = getRealtimeService();
    } catch (error) {
      console.error("Failed to initialize sync services:", error);
      setStatus((prev) => ({
        ...prev,
        error: {
          code: "INITIALIZATION_ERROR",
          message: "Не удалось инициализировать сервисы синхронизации",
          details: error,
        },
      }));
    }
  }, []);

  // Обновление статуса подключения к интернету
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true, error: null }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Периодическая проверка статуса
  useEffect(() => {
    const checkStatus = async () => {
      if (!syncServiceRef.current || !realtimeServiceRef.current) return;

      try {
        const syncStatus = await syncServiceRef.current.getSyncStatus();
        const isRealtimeConnected = realtimeServiceRef.current.isConnected();

        setStatus((prev) => ({
          ...prev,
          lastSyncAt: syncStatus.lastSyncAt,
          isRealtimeConnected,
          error: syncStatus.error || null,
        }));
      } catch (error) {
        console.error("Error checking sync status:", error);
      }
    };

    // Проверяем статус каждые 30 секунд
    statusCheckIntervalRef.current = setInterval(checkStatus, 30000);

    // Первоначальная проверка
    checkStatus();

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  // Ручная синхронизация
  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!syncServiceRef.current) {
      throw new Error("Sync service not initialized");
    }

    setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await syncServiceRef.current.performSync();

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
        error: result.error || null,
      }));

      return result;
    } catch (error) {
      const syncError: SyncError = {
        code: "SYNC_ERROR",
        message: "Ошибка синхронизации",
        details: error,
      };

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: syncError,
      }));

      return {
        success: false,
        error: syncError,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
      };
    }
  }, []);

  // Принудительная отправка локальных изменений
  const forcePush = useCallback(async (): Promise<SyncResult> => {
    if (!syncServiceRef.current) {
      throw new Error("Sync service not initialized");
    }

    setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await syncServiceRef.current.forcePushLocalChanges();

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
        error: result.error || null,
      }));

      return result;
    } catch (error) {
      const syncError: SyncError = {
        code: "PUSH_ERROR",
        message: "Ошибка отправки данных",
        details: error,
      };

      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: syncError,
      }));

      return {
        success: false,
        error: syncError,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
      };
    }
  }, []);

  // Включение автоматической синхронизации
  const enableAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
    }

    // Автосинхронизация каждые 5 минут
    autoSyncIntervalRef.current = setInterval(
      async () => {
        if (status.isOnline && !status.isSyncing && syncServiceRef.current) {
          try {
            await syncServiceRef.current.performBackgroundSync();
          } catch (error) {
            console.error("Background sync error:", error);
          }
        }
      },
      5 * 60 * 1000
    );
  }, [status.isOnline, status.isSyncing]);

  // Отключение автоматической синхронизации
  const disableAutoSync = useCallback(() => {
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }
  }, []);

  // Включение real-time подписок
  const enableRealtime = useCallback(async () => {
    if (!realtimeServiceRef.current) return;

    try {
      await realtimeServiceRef.current.subscribeToTaskChanges();
      setStatus((prev) => ({ ...prev, isRealtimeConnected: true }));
    } catch (error) {
      console.error("Failed to enable realtime:", error);

      let errorMessage = "Не удалось включить real-time обновления";
      let errorCode = "REALTIME_ERROR";

      // Проверяем специфичные ошибки
      if (error && typeof error === "object" && "message" in error) {
        const errorStr = String(error.message);
        if (errorStr.includes("Unable to subscribe to changes")) {
          errorMessage =
            "Realtime не включен для таблицы в Supabase. Выполните миграцию 002_enable_realtime.sql";
          errorCode = "REALTIME_NOT_ENABLED";
        } else if (errorStr.includes("postgres_changes")) {
          errorMessage =
            "Ошибка подписки на изменения PostgreSQL. Проверьте настройки Realtime в Supabase";
          errorCode = "POSTGRES_CHANGES_ERROR";
        }
      }

      setStatus((prev) => ({
        ...prev,
        error: {
          code: errorCode,
          message: errorMessage,
          details: error,
        },
      }));
    }
  }, []);

  // Отключение real-time подписок
  const disableRealtime = useCallback(async () => {
    if (!realtimeServiceRef.current) return;

    try {
      await realtimeServiceRef.current.unsubscribeFromTaskChanges();
      setStatus((prev) => ({ ...prev, isRealtimeConnected: false }));
    } catch (error) {
      console.error("Failed to disable realtime:", error);
    }
  }, []);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
      }
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  // Определяем syncStatus на основе состояния
  const getSyncStatus = (): "idle" | "syncing" | "synced" | "error" => {
    if (status.isSyncing) return "syncing";
    if (status.error) return "error";
    if (status.lastSyncAt) return "synced";
    return "idle";
  };

  // Определяем realtimeStatus
  const getRealtimeStatus = (): "connected" | "disconnected" | "connecting" => {
    return status.isRealtimeConnected ? "connected" : "disconnected";
  };

  // Обертки для методов с правильными сигнатурами
  const performSync = useCallback(async () => {
    await sync();
  }, [sync]);

  const forcePushLocalChanges = useCallback(async () => {
    await forcePush();
  }, [forcePush]);

  const enableAutoSyncWrapper = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        enableAutoSync();
      } else {
        disableAutoSync();
      }
    },
    [enableAutoSync, disableAutoSync]
  );

  const enableRealtimeWrapper = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enableRealtime();
      } else {
        await disableRealtime();
      }
    },
    [enableRealtime, disableRealtime]
  );

  return {
    // Отдельные поля для совместимости
    isOnline: status.isOnline,
    syncStatus: getSyncStatus(),
    lastSyncAt: status.lastSyncAt,
    error: status.error,
    realtimeStatus: getRealtimeStatus(),

    // Методы с правильными сигнатурами
    performSync,
    forcePushLocalChanges,
    enableAutoSync: enableAutoSyncWrapper,
    enableRealtime: enableRealtimeWrapper,

    // Внутреннее состояние для совместимости
    status,
    sync,
    forcePush,
  };
}
