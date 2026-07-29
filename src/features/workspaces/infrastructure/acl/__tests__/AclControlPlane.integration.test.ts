import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import {
  workspaceDeviceRef,
  type WorkspaceAclCheckpoint,
} from "../../../domain/WorkspaceAcl";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../../matrix/MatrixSdkFacade";
import { AclControlPlane } from "../AclControlPlane";
import { CanonicalAclCodec } from "../CanonicalAclCodec";

const databases: LiftSecureDatabase[] = [];

const openDatabase = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const root = (
  members: Readonly<Record<string, WorkspaceRole>>
): WorkspaceAclCheckpoint => ({
  workspaceId: "ws_1",
  authEpoch: 1,
  previousHash: null,
  members,
  revokedUsers: [],
  revokedDevices: [],
  acceptedHeads: ["head-1"],
  sender: {
    userId: "@owner:test",
    deviceId: "OWNER",
    ed25519Key: "owner-ed25519",
    curve25519Key: "owner-curve25519",
  },
});

const seed = async (
  database: LiftSecureDatabase,
  checkpoint: WorkspaceAclCheckpoint
) => {
  const codec = new CanonicalAclCodec();
  const bytes = codec.encode(checkpoint);
  const hash = await codec.hash(bytes);
  await database.aclCheckpoints.add({
    workspaceId: checkpoint.workspaceId,
    authEpoch: 1,
    hash,
    previousHash: null,
    bytes,
    createdAt: 1,
  });
  await database.workspaceSnapshots.add({
    workspaceId: checkpoint.workspaceId,
    schemaVersion: 1,
    bytes: new Uint8Array([1]),
    heads: ["head-2"],
    savedAt: 1,
  });
  await database.syncTargets.add({
    id: "target-1",
    workspaceId: checkpoint.workspaceId,
    serverProfileId: "primary",
    roomId: "!room:test",
    mode: "active",
    state: "active",
    createdAt: 1,
    updatedAt: 1,
  });
};

const fakeClient = (identity: { userId: string; deviceId: string }) => {
  const order: string[] = [];
  let sent: Readonly<Record<string, unknown>> = {};
  let state = {
    eventId: "$none",
    content: {} as Readonly<Record<string, unknown>>,
  };
  const client = {
    workspaceIdentity: () => identity,
    ownDeviceKeys: async () => ({
      ed25519: `${identity.deviceId}-ed25519`,
      curve25519: `${identity.deviceId}-curve25519`,
    }),
    signWorkspaceContent: async (content: Readonly<Record<string, unknown>>) =>
      content,
    sendEncryptedWorkspaceEvent: async (
      _roomId: string,
      _type: string,
      content: Readonly<Record<string, unknown>>
    ) => {
      order.push("encrypted-acl");
      sent = content;
      return "$acl";
    },
    readWorkspaceEvent: async () => ({
      wireType: "m.room.encrypted",
      clearType: "dev.lift.acl.v1",
      content: sent,
    }),
    publishWorkspaceState: async (
      _roomId: string,
      _type: string,
      content: Readonly<Record<string, unknown>>
    ) => {
      order.push("acl-head");
      state = { eventId: "$head", content };
      return "$head";
    },
    readWorkspaceState: async () => state,
    applyWorkspaceAccess: async () => {
      order.push("matrix-access");
    },
    forceDiscardWorkspaceSession: async () => {
      order.push("discard-megolm");
    },
  } as unknown as MatrixWorkspaceClient;
  return { client, order };
};

describe("AclControlPlane", () => {
  it("allows Editor writes and rejects Viewer or revoked-device writes", async () => {
    const database = await openDatabase();
    const checkpoint = {
      ...root({
        "@owner:test": WorkspaceRole.Owner,
        "@editor:test": WorkspaceRole.Editor,
        "@viewer:test": WorkspaceRole.Viewer,
      }),
      revokedDevices: [workspaceDeviceRef("@editor:test", "REVOKED")],
    };
    await seed(database, checkpoint);

    await expect(
      new AclControlPlane(
        database,
        fakeClient({ userId: "@editor:test", deviceId: "EDITOR" }).client
      ).requireEdit("ws_1")
    ).resolves.toBeUndefined();
    await expect(
      new AclControlPlane(
        database,
        fakeClient({ userId: "@viewer:test", deviceId: "VIEWER" }).client
      ).requireEdit("ws_1")
    ).rejects.toThrow("read-only");
    await expect(
      new AclControlPlane(
        database,
        fakeClient({ userId: "@editor:test", deviceId: "REVOKED" }).client
      ).requireEdit("ws_1")
    ).rejects.toThrow("revoked");

    await database.syncTargets.update("target-1", {
      mode: "read-only",
      state: "paused",
    });
    await expect(
      new AclControlPlane(
        database,
        fakeClient({ userId: "@editor:test", deviceId: "EDITOR" }).client
      ).requireEdit("ws_1")
    ).rejects.toThrow("membership is revoked");
  });

  it("lets an Admin add Editor/Viewer but not grant Admin", async () => {
    const database = await openDatabase();
    await seed(
      database,
      root({
        "@owner:test": WorkspaceRole.Owner,
        "@admin:test": WorkspaceRole.Admin,
      })
    );
    const fake = fakeClient({ userId: "@admin:test", deviceId: "ADMIN" });
    const control = new AclControlPlane(database, fake.client);

    const accepted = await control.apply("ws_1", {
      kind: "invite-member",
      userId: "@editor:test",
      role: WorkspaceRole.Editor,
    });
    expect(accepted.members["@editor:test"]).toBe(WorkspaceRole.Editor);
    await expect(
      control.apply("ws_1", {
        kind: "change-role",
        userId: "@editor:test",
        role: WorkspaceRole.Admin,
      })
    ).rejects.toThrow("assign-admin");
    expect((await database.syncTargets.get("target-1"))?.state).toBe("active");
    expect(fake.order).toEqual([
      "encrypted-acl",
      "acl-head",
      "matrix-access",
      "discard-megolm",
      "encrypted-acl",
    ]);
  });

  it("transfers ownership atomically and aligns explicit Matrix levels", async () => {
    const database = await openDatabase();
    await seed(
      database,
      root({
        "@owner:test": WorkspaceRole.Owner,
        "@next:test": WorkspaceRole.Editor,
      })
    );
    const fake = fakeClient({ userId: "@owner:test", deviceId: "OWNER" });
    const access = vi.spyOn(fake.client, "applyWorkspaceAccess");
    const accepted = await new AclControlPlane(database, fake.client).apply(
      "ws_1",
      { kind: "transfer-ownership", nextOwnerUserId: "@next:test" }
    );

    expect(accepted.members).toEqual({
      "@owner:test": WorkspaceRole.Admin,
      "@next:test": WorkspaceRole.Owner,
    });
    expect(access).toHaveBeenCalledWith(
      "!room:test",
      { "@owner:test": 75, "@next:test": 100 },
      [],
      []
    );
  });

  it("publishes revocation before membership update and Megolm discard", async () => {
    const database = await openDatabase();
    await seed(
      database,
      root({
        "@owner:test": WorkspaceRole.Owner,
        "@editor:test": WorkspaceRole.Editor,
      })
    );
    const fake = fakeClient({ userId: "@owner:test", deviceId: "OWNER" });
    const accepted = await new AclControlPlane(database, fake.client).apply(
      "ws_1",
      { kind: "remove-member", userId: "@editor:test" }
    );

    expect(accepted.revokedUsers).toContain("@editor:test");
    expect(fake.order).toEqual([
      "encrypted-acl",
      "acl-head",
      "matrix-access",
      "discard-megolm",
      "encrypted-acl",
    ]);
    expect((await database.syncTargets.get("target-1"))?.state).toBe("active");
  });

  it("rotates Megolm and republishes the accepted ACL after an invitation", async () => {
    const database = await openDatabase();
    await seed(
      database,
      root({
        "@owner:test": WorkspaceRole.Owner,
      })
    );
    const fake = fakeClient({ userId: "@owner:test", deviceId: "OWNER" });

    const accepted = await new AclControlPlane(database, fake.client).apply(
      "ws_1",
      {
        kind: "invite-member",
        userId: "@editor:test",
        role: WorkspaceRole.Editor,
      }
    );

    expect(accepted.members["@editor:test"]).toBe(WorkspaceRole.Editor);
    expect(fake.order).toEqual([
      "encrypted-acl",
      "acl-head",
      "matrix-access",
      "discard-megolm",
      "encrypted-acl",
    ]);
  });
});
