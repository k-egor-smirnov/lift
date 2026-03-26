import { useEffect, useMemo, useState } from "react";
import { DeviceRegistry } from "@/shared/infrastructure/sync-engine/DeviceRegistry";
import { MlsGroupSessionManager } from "@/shared/infrastructure/sync-engine/MlsGroupSessionManager";
import {
  ConnectedDevice,
  DevicePlatform,
  MlsCornerCaseError,
} from "@/shared/infrastructure/sync-engine/types";

const CURRENT_DEVICE_KEY = "lift.sync.current-device-id";

const guessPlatform = (): DevicePlatform => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac") || ua.includes("win") || ua.includes("linux"))
    return "desktop";
  return "web";
};

export function useDeviceSyncManagement() {
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);

  const currentDeviceId = useMemo(() => {
    const existing = localStorage.getItem(CURRENT_DEVICE_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(CURRENT_DEVICE_KEY, next);
    return next;
  }, []);

  const registry = useMemo(
    () => new DeviceRegistry(currentDeviceId),
    [currentDeviceId]
  );

  const [sessionManager, setSessionManager] =
    useState<MlsGroupSessionManager | null>(null);

  const reload = () => {
    const current = registry.ensureCurrent("This device", guessPlatform());
    const all = registry.list();
    setDevices(all);
    setSessionManager(
      new MlsGroupSessionManager("lift-primary-group", [
        current,
        ...all.filter((device) => device.id !== current.id),
      ])
    );
  };

  const addDevice = (platform: DevicePlatform = "unknown") => {
    try {
      setError(null);
      const manager = sessionManager;
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
  };

  const revokeDevice = (deviceId: string) => {
    try {
      setError(null);
      if (!sessionManager) return;
      sessionManager.removeDevice(deviceId, currentDeviceId);
      registry.remove(deviceId);
      reload();
    } catch (err) {
      if (err instanceof MlsCornerCaseError) {
        setError(`${err.code}: ${err.message}`);
        return;
      }
      setError("Unable to revoke device");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return {
    devices,
    error,
    deviceName,
    setDeviceName,
    addDevice,
    revokeDevice,
    mlsState: sessionManager?.getSnapshot() ?? null,
  };
}
