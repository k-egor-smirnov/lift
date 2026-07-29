import { describe, expect, it } from "vitest";
import { validateAclTransition } from "../AclTransitionPolicy";
import type { WorkspaceAclCheckpoint } from "../WorkspaceAcl";
import { WorkspaceRole } from "../WorkspaceRole";
import { workspaceDeviceRef } from "../WorkspaceAcl";

const checkpoint = (
  overrides: Partial<WorkspaceAclCheckpoint> = {}
): WorkspaceAclCheckpoint => ({
  workspaceId: "ws_1",
  authEpoch: 1,
  previousHash: null,
  members: {
    "@owner:test": WorkspaceRole.Owner,
    "@admin:test": WorkspaceRole.Admin,
    "@editor:test": WorkspaceRole.Editor,
  },
  revokedUsers: [],
  revokedDevices: [],
  acceptedHeads: ["head-a"],
  sender: {
    userId: "@owner:test",
    deviceId: "OWNER_DEVICE",
    ed25519Key: "owner-ed25519",
    curve25519Key: "owner-curve25519",
  },
  ...overrides,
});

const next = (
  previous: WorkspaceAclCheckpoint,
  overrides: Partial<WorkspaceAclCheckpoint> = {}
): WorkspaceAclCheckpoint => ({
  ...previous,
  authEpoch: previous.authEpoch + 1,
  previousHash: "a".repeat(64),
  ...overrides,
});

describe("ACL transition policy", () => {
  it("requires exactly the next epoch", () => {
    const root = checkpoint();
    expect(() =>
      validateAclTransition(root, next(root, { authEpoch: 3 }))
    ).toThrow("increment by one");
  });

  it("allows only an Owner to transfer ownership", () => {
    const root = checkpoint();
    expect(() =>
      validateAclTransition(
        root,
        next(root, {
          sender: { ...root.sender, userId: "@admin:test" },
          members: {
            ...root.members,
            "@owner:test": WorkspaceRole.Admin,
            "@admin:test": WorkspaceRole.Owner,
          },
        })
      )
    ).toThrow("assign-owner");
  });

  it("prevents an Admin from assigning Admin", () => {
    const root = checkpoint();
    expect(() =>
      validateAclTransition(
        root,
        next(root, {
          sender: { ...root.sender, userId: "@admin:test" },
          members: {
            ...root.members,
            "@editor:test": WorkspaceRole.Admin,
          },
        })
      )
    ).toThrow("assign-admin");
  });

  it("protects the last Owner", () => {
    const root = checkpoint();
    expect(() =>
      validateAclTransition(
        root,
        next(root, {
          members: {
            "@owner:test": WorkspaceRole.Admin,
            "@admin:test": WorkspaceRole.Admin,
            "@editor:test": WorkspaceRole.Editor,
          },
        })
      )
    ).toThrow("last Owner");
  });

  it("makes user/device revocation and accepted heads monotonic", () => {
    const root = checkpoint({
      revokedUsers: ["@gone:test"],
      revokedDevices: [workspaceDeviceRef("@gone:test", "OLD_DEVICE")],
      acceptedHeads: ["head-a", "head-b"],
    });
    expect(() =>
      validateAclTransition(root, next(root, { revokedUsers: [] }))
    ).toThrow("Revoked users cannot shrink");
    expect(() =>
      validateAclTransition(root, next(root, { revokedDevices: [] }))
    ).toThrow("Revoked devices cannot shrink");
    expect(() =>
      validateAclTransition(root, next(root, { acceptedHeads: ["head-b"] }))
    ).toThrow("Accepted causal heads cannot shrink");
  });

  it("rejects an ACL epoch or device revocation authored by an Editor", () => {
    const root = checkpoint();
    expect(() =>
      validateAclTransition(
        root,
        next(root, {
          sender: { ...root.sender, userId: "@editor:test" },
        })
      )
    ).toThrow("requires administration");
  });
});
