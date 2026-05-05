import { describe, expect, it } from "vitest";
import { MlsGroupSessionManager } from "../MlsGroupSessionManager";
import {
  ConnectedDevice,
  MlsCornerCaseCode,
  MlsCornerCaseError,
} from "../types";

const baseDevice: ConnectedDevice = {
  id: "device-1",
  label: "Current",
  platform: "web",
  createdAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  identityKey: "a".repeat(32),
  isCurrent: true,
  isRevoked: false,
};

describe("MlsGroupSessionManager", () => {
  it("increments epoch when adding/removing device", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);

    manager.addDevice({
      ...baseDevice,
      id: "device-2",
      label: "Tablet",
      isCurrent: false,
      identityKey: "b".repeat(32),
    });

    manager.removeDevice("device-2", "device-1");

    expect(manager.getSnapshot().epoch).toBe(3);
  });

  it("throws self remove corner case", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);

    try {
      manager.removeDevice("device-1", "device-1");
    } catch (error) {
      expect(error).toBeInstanceOf(MlsCornerCaseError);
      expect((error as MlsCornerCaseError).code).toBe(
        MlsCornerCaseCode.SELF_REMOVE_FORBIDDEN
      );
      return;
    }

    throw new Error("Expected MLS corner case error");
  });

  it("throws stale epoch on outdated commit", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);

    expect(() => manager.applyCommit(1)).toThrowError(MlsCornerCaseError);
    expect(() => manager.applyCommit(1)).toThrowError(/stale/);
  });

  it("throws duplicate device error", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);

    expect(() =>
      manager.addDevice({ ...baseDevice, isCurrent: false })
    ).toThrow(MlsCornerCaseError);
    try {
      manager.addDevice({ ...baseDevice, isCurrent: false });
    } catch (error) {
      expect((error as MlsCornerCaseError).code).toBe(
        MlsCornerCaseCode.DUPLICATE_DEVICE
      );
    }
  });

  it("throws pending commit required on add with pending commit", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);
    manager.stageCommit();

    try {
      manager.addDevice({
        ...baseDevice,
        id: "device-3",
        identityKey: "c".repeat(32),
        isCurrent: false,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MlsCornerCaseError);
      expect((error as MlsCornerCaseError).code).toBe(
        MlsCornerCaseCode.PENDING_COMMIT_REQUIRED
      );
      return;
    }

    throw new Error("Expected pending commit corner case error");
  });

  it("does not bump epoch on repeated revoke", () => {
    const manager = new MlsGroupSessionManager("group", [baseDevice]);
    manager.addDevice({
      ...baseDevice,
      id: "device-2",
      label: "Tablet",
      isCurrent: false,
      identityKey: "b".repeat(32),
    });

    manager.removeDevice("device-2", "device-1");
    const firstRevokeEpoch = manager.getSnapshot().epoch;
    manager.removeDevice("device-2", "device-1");

    expect(manager.getSnapshot().epoch).toBe(firstRevokeEpoch);
  });
});
