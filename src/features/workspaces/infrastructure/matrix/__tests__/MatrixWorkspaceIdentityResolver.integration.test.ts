import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { workspaceDeviceRef } from "../../../domain/WorkspaceAcl";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { MatrixWorkspaceIdentityResolver } from "../MatrixWorkspaceIdentityResolver";

const databases: LiftSecureDatabase[] = [];

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const createDatabase = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

const seedBoundWorkspace = async (
  database: LiftSecureDatabase,
  input: {
    readonly workspaceId: string;
    readonly profileId: string;
    readonly roomId: string;
    readonly userId: string;
    readonly revokedDeviceId?: string;
    readonly updatedAt: number;
  }
) => {
  await database.workspaceSnapshots.add({
    workspaceId: input.workspaceId,
    schemaVersion: 1,
    bytes: new Uint8Array([1]),
    heads: ["head"],
    savedAt: input.updatedAt,
  });
  const codec = new CanonicalAclCodec();
  const bytes = codec.encode({
    workspaceId: input.workspaceId,
    authEpoch: 1,
    previousHash: null,
    members: { [input.userId]: WorkspaceRole.Owner },
    revokedUsers: [],
    revokedDevices:
      input.revokedDeviceId === undefined
        ? []
        : [workspaceDeviceRef(input.userId, input.revokedDeviceId)],
    acceptedHeads: ["head"],
    sender: {
      userId: input.userId,
      deviceId: "GENESIS",
      ed25519Key: "ed25519",
      curve25519Key: "curve25519",
    },
  });
  await database.aclCheckpoints.add({
    workspaceId: input.workspaceId,
    authEpoch: 1,
    hash: await codec.hash(bytes),
    previousHash: null,
    bytes,
    createdAt: input.updatedAt,
  });
  await database.syncTargets.add({
    id: `${input.workspaceId}:${input.profileId}`,
    workspaceId: input.workspaceId,
    serverProfileId: input.profileId,
    roomId: input.roomId,
    mode: "active",
    state: "active",
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  });
};

describe("MatrixWorkspaceIdentityResolver", () => {
  it("never selects another Matrix account's local workspace", async () => {
    const database = await createDatabase();
    await seedBoundWorkspace(database, {
      workspaceId: "ws_alice",
      profileId: "primary",
      roomId: "!alice:test",
      userId: "@alice:test",
      updatedAt: 10,
    });
    await seedBoundWorkspace(database, {
      workspaceId: "ws_bob",
      profileId: "primary",
      roomId: "!bob:test",
      userId: "@bob:test",
      updatedAt: 20,
    });

    const resolver = new MatrixWorkspaceIdentityResolver(database);

    await expect(
      resolver.resolve({
        profileId: "primary",
        userId: "@bob:test",
        deviceId: "BOB",
      })
    ).resolves.toBe("ws_bob");
    await expect(
      resolver.resolve({
        profileId: "primary",
        userId: "@charlie:test",
        deviceId: "CHARLIE",
      })
    ).resolves.toBeNull();
  });

  it("rejects a revoked device and reports only truly offline workspaces", async () => {
    const database = await createDatabase();
    await seedBoundWorkspace(database, {
      workspaceId: "ws_bound",
      profileId: "primary",
      roomId: "!bound:test",
      userId: "@alice:test",
      revokedDeviceId: "REVOKED",
      updatedAt: 10,
    });
    await database.workspaceSnapshots.add({
      workspaceId: "ws_offline",
      schemaVersion: 1,
      bytes: new Uint8Array([2]),
      heads: ["offline-head"],
      savedAt: 5,
    });

    const resolver = new MatrixWorkspaceIdentityResolver(database);

    await expect(
      resolver.resolve({
        profileId: "primary",
        userId: "@alice:test",
        deviceId: "REVOKED",
      })
    ).resolves.toBeNull();
    await expect(resolver.listOfflineWorkspaceIds()).resolves.toEqual([
      "ws_offline",
    ]);
  });
});
