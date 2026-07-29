import { describe, expect, it, vi } from "vitest";
import type {
  MatrixSession,
  MatrixSessionSnapshot,
} from "../../ports/MatrixSession";
import { CreateWorkspaceUseCase } from "../CreateWorkspaceUseCase";

const session = (snapshot: MatrixSessionSnapshot): MatrixSession =>
  ({ snapshot: () => snapshot }) as MatrixSession;

const ready: MatrixSessionSnapshot = {
  phase: "ready",
  profileId: "primary",
  userId: "@alice:test",
  deviceId: "ALICE_DEVICE",
  errorCode: null,
  recoveryKeyForDisplay: null,
  confirmationGroup: null,
};

describe("CreateWorkspaceUseCase", () => {
  it("provisions the encrypted room with the exact local causal heads", async () => {
    const ensureRoot = vi.fn().mockResolvedValue(undefined);
    const useCase = new CreateWorkspaceUseCase(
      session(ready),
      {
        getOrCreate: async () => ({
          workspaceId: "ws_1",
          heads: ["head-b", "head-a"],
          snapshotBytes: new Uint8Array([1, 2, 3]),
        }),
      },
      { ensureRoot }
    );

    await expect(
      useCase.execute({ timezone: "Europe/Moscow", startOfDay: "06:00" })
    ).resolves.toBe("ws_1");
    expect(ensureRoot).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      profileId: "primary",
      ownerUserId: "@alice:test",
      ownerDeviceId: "ALICE_DEVICE",
      acceptedHeads: ["head-b", "head-a"],
      bootstrapSnapshot: new Uint8Array([1, 2, 3]),
    });
  });

  it("does not provision or create before recovery acknowledgement", async () => {
    const getOrCreate = vi.fn();
    const ensureRoot = vi.fn();
    const useCase = new CreateWorkspaceUseCase(
      session({ ...ready, phase: "initializing-crypto" }),
      { getOrCreate },
      { ensureRoot }
    );
    await expect(
      useCase.execute({ timezone: "UTC", startOfDay: "00:00" })
    ).rejects.toThrow("recovery must be acknowledged");
    expect(getOrCreate).not.toHaveBeenCalled();
    expect(ensureRoot).not.toHaveBeenCalled();
  });
});
