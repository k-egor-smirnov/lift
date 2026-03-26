import { ConnectedDevice, DevicePlatform } from "./types";

const STORAGE_KEY = "lift.sync.connected-devices";

export class DeviceRegistry {
  constructor(private currentDeviceId: string) {}

  list(): ConnectedDevice[] {
    return this.load().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  add(
    label: string,
    platform: DevicePlatform,
    identityKey: string
  ): ConnectedDevice {
    const next: ConnectedDevice = {
      id: crypto.randomUUID(),
      label,
      platform,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      identityKey,
      isCurrent: false,
      isRevoked: false,
    };

    const devices = this.load();
    devices.push(next);
    this.save(devices);

    return next;
  }

  remove(deviceId: string): void {
    const devices = this.load().map((device) =>
      device.id === deviceId
        ? { ...device, isRevoked: true, lastSeenAt: new Date().toISOString() }
        : device
    );

    this.save(devices);
  }

  ensureCurrent(label: string, platform: DevicePlatform): ConnectedDevice {
    const devices = this.load();
    const existing = devices.find(
      (device) => device.id === this.currentDeviceId
    );

    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      existing.isCurrent = true;
      this.save(devices);
      return existing;
    }

    const current: ConnectedDevice = {
      id: this.currentDeviceId,
      label,
      platform,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      identityKey: crypto.randomUUID().replace(/-/g, ""),
      isCurrent: true,
      isRevoked: false,
    };

    devices.push(current);
    this.save(devices);
    return current;
  }

  private load(): ConnectedDevice[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      return JSON.parse(raw) as ConnectedDevice[];
    } catch {
      return [];
    }
  }

  private save(devices: ConnectedDevice[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  }
}
