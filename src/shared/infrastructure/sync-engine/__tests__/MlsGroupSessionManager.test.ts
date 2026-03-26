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
});
