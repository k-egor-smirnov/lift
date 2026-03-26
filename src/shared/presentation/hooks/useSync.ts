import { useCallback, useEffect, useState } from "react";
import { relaySyncClient } from "@/shared/infrastructure/sync-engine/RelaySyncClient";
import {
  SyncError,
  SyncResult,
} from "../../domain/repositories/SyncRepository";

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: SyncError | null;
  isRealtimeConnected: boolean;
}

export interface UseSyncReturn {
  isOnline: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSyncAt: Date | null;
  error: SyncError | null;
  realtimeStatus: "connected" | "disconnected" | "connecting";
  performSync: () => Promise<void>;
  forcePushLocalChanges: () => Promise<void>;
  enableAutoSync: (enabled: boolean) => Promise<void>;
  enableRealtime: (enabled: boolean) => Promise<void>;
  status: SyncStatus;
  sync: () => Promise<SyncResult>;
  forcePush: () => Promise<SyncResult>;
}

function resultFromError(error: unknown, code = "SYNC_ERROR"): SyncResult {
  return {
    success: false,
    pushedCount: 0,
    pulledCount: 0,
    conflictsResolved: 0,
    error: {
      code,
      message: error instanceof Error ? error.message : "Sync failed",
      details: error,
    },
  };
}

export function useSync(): UseSyncReturn {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    isRealtimeConnected: relaySyncClient.isConnected(),
  });

  useEffect(() => {
    const onOnline = () => setStatus((prev) => ({ ...prev, isOnline: true }));
    const onOffline = () => setStatus((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const sync = useCallback(async (): Promise<SyncResult> => {
    setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      const connected = await relaySyncClient.probe();
      if (!connected) {
        const error: SyncError = {
          code: "RELAY_UNAVAILABLE",
          message: "Relay server is unavailable",
        };
        setStatus((prev) => ({
          ...prev,
          isSyncing: false,
          isRealtimeConnected: false,
          error,
        }));

        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          conflictsResolved: 0,
          error,
        };
      }

      const now = new Date();
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        isRealtimeConnected: true,
        lastSyncAt: now,
      }));

      return {
        success: true,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
      };
    } catch (error) {
      const result = resultFromError(error);
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: result.error || null,
      }));
      return result;
    }
  }, []);

  const forcePush = useCallback(async (): Promise<SyncResult> => {
    const result = await sync();
    if (!result.success) {
      return resultFromError(result.error, "PUSH_ERROR");
    }

    return {
      success: true,
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
    };
  }, [sync]);

  const enableAutoSync = useCallback(async () => {
    setStatus((prev) => ({
      ...prev,
      isRealtimeConnected: relaySyncClient.isConnected(),
    }));
  }, []);

  const enableRealtime = useCallback(async () => {
    setStatus((prev) => ({
      ...prev,
      isRealtimeConnected: relaySyncClient.isConnected(),
    }));
  }, []);

  return {
    isOnline: status.isOnline,
    syncStatus: status.error
      ? "error"
      : status.isSyncing
        ? "syncing"
        : status.lastSyncAt
          ? "synced"
          : "idle",
    lastSyncAt: status.lastSyncAt,
    error: status.error,
    realtimeStatus: status.isRealtimeConnected ? "connected" : "disconnected",
    performSync: async () => {
      await sync();
    },
    forcePushLocalChanges: async () => {
      await forcePush();
    },
    enableAutoSync,
    enableRealtime,
    status,
    sync,
    forcePush,
  };
}
