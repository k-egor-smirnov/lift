import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeviceRegistry } from "@/shared/infrastructure/sync-engine/DeviceRegistry";
import { MlsGroupSessionManager } from "@/shared/infrastructure/sync-engine/MlsGroupSessionManager";
import {
  ConnectedDevice,
  DevicePlatform,
  MlsCornerCaseError,
} from "@/shared/infrastructure/sync-engine/types";

const getCurrentDeviceStorageKey = (userId: string) =>
  `lift.sync.current-device-id:${userId}`;

const guessPlatform = (): DevicePlatform => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac") || ua.includes("win") || ua.includes("linux")) {
    return "desktop";
  }
  return "web";
};

export function useDeviceSyncManagement(userId = "anonymous") {
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  const currentDeviceId = useMemo(() => {
    const key = getCurrentDeviceStorageKey(userId);
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  }, [userId]);

  const registry = useMemo(
    () => new DeviceRegistry(currentDeviceId, userId),
    [currentDeviceId, userId]
  );

  const sessionManagerRef = useRef<MlsGroupSessionManager | null>(null);

  const reload = useCallback(() => {
    const current = registry.ensureCurrent("This device", guessPlatform());
    const all = registry.list();
    setDevices(all);

    if (!sessionManagerRef.current) {
      sessionManagerRef.current = new MlsGroupSessionManager(
        "lift-primary-group",
        [current, ...all.filter((device) => device.id !== current.id)]
      );
    } else {
      sessionManagerRef.current.updateDevices(all);
    }
  }, [registry]);

  const addDevice = useCallback(
    (platform: DevicePlatform = "unknown") => {
      try {
        setError(null);

        const manager = sessionManagerRef.current;
        if (!manager) return;

        const next = registry.add(
          deviceName || `Device ${devices.length + 1}`,
          platform,
          crypto.randomUUID().replace(/-/g, "")
        );
        manager.addDevice(next);
        setDeviceName("");
        reload();
      } catch (err) {
        if (err instanceof MlsCornerCaseError) {
          setError(`${err.code}: ${err.message}`);
          return;
        }
        setError("Unable to add device");
      }
    },
    [deviceName, devices.length, registry, reload]
  );

  const revokeDevice = useCallback(
    (deviceId: string) => {
      try {
        setError(null);
        const manager = sessionManagerRef.current;
        if (!manager) return;

        manager.removeDevice(deviceId, currentDeviceId);
        registry.remove(deviceId);
        reload();
      } catch (err) {
        if (err instanceof MlsCornerCaseError) {
          setError(`${err.code}: ${err.message}`);
          return;
        }
        setError("Unable to revoke device");
      }
    },
    [currentDeviceId, registry, reload]
  );

  useEffect(() => {
    sessionManagerRef.current = null;
    reload();
  }, [reload, userId]);

  return {
    devices,
    error,
    deviceName,
    setDeviceName,
    addDevice,
    revokeDevice,
    mlsState: sessionManagerRef.current?.getSnapshot() ?? null,
  };
}
