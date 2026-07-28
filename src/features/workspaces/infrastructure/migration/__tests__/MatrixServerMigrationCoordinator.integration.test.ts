import * as Automerge from "@automerge/automerge";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { CheckpointCodec } from "../../checkpoint/CheckpointCodec";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import {
  MatrixServerMigrationCoordinator,
  type MatrixServerMigrationGateway,
} from "../MatrixServerMigrationCoordinator";

const databases: LiftSecureDatabase[] = [];
const workspaceId = "ws_migration";
const sourceUserId = "@alice:primary.localhost";
const targetUserId = "@alice:secondary.localhost";

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const seed = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  const document = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace(workspaceId, "UTC", "04:00"),
    "aa".repeat(16)
  );
  const snapshot = document.save();
  const heads = [...document.heads()].sort();
  const sourceAcl = {
    workspaceId,
    authEpoch: 1,
    previousHash: null,
    members: { [sourceUserId]: WorkspaceRole.Owner },
    revokedUsers: [],
    revokedDevices: [],
    acceptedHeads: heads,
    sender: {
      userId: sourceUserId,
      deviceId: "SOURCE",
      ed25519Key: "source-ed25519",
      curve25519Key: "source-curve25519",
    },
  } as const;
  const aclCodec = new CanonicalAclCodec();
  const sourceAclBytes = aclCodec.encode(sourceAcl);
  const sourceAclHash = await aclCodec.hash(sourceAclBytes);
  await database.workspaceSnapshots.add({
    workspaceId,
    schemaVersion: 1,
    bytes: snapshot,
    heads,
    savedAt: 1,
  });
  await database.aclCheckpoints.add({
    workspaceId,
    authEpoch: 1,
    hash: sourceAclHash,
    previousHash: null,
    bytes: sourceAclBytes,
    createdAt: 1,
  });
  await database.serverProfiles.bulkAdd([
    {
      id: "local-primary",
      name: "Primary",
      baseUrl: "http://127.0.0.1:8008",
    },
    {
      id: "local-secondary",
      name: "Secondary",
      baseUrl: "http://127.0.0.1:8009",
    },
  ]);
  await database.syncTargets.add({
    id: "source-target",
    workspaceId,
    serverProfileId: "local-primary",
    roomId: "!source:primary.localhost",
    mode: "active",
    state: "active",
    createdAt: 1,
    updatedAt: 1,
  });
  return { database, snapshot, heads, sourceAclHash };
};

const gateway = async (
  snapshot: Uint8Array,
  heads: readonly string[],
  overrides: Partial<MatrixServerMigrationGateway> = {}
): Promise<MatrixServerMigrationGateway> => {
  const aclCodec = new CanonicalAclCodec();
  const targetAcl = {
    workspaceId,
    authEpoch: 1,
    previousHash: null,
    members: { [targetUserId]: WorkspaceRole.Owner },
    revokedUsers: [],
    revokedDevices: [],
    acceptedHeads: [...heads],
    sender: {
      userId: targetUserId,
      deviceId: "TARGET",
      ed25519Key: "target-ed25519",
      curve25519Key: "target-curve25519",
    },
  } as const;
  const targetAclBytes = aclCodec.encode(targetAcl);
  const targetAclHash = await aclCodec.hash(targetAclBytes);
  const checkpoint = await new CheckpointCodec().create({
    workspaceId,
    authEpoch: 1,
    snapshot,
  });
  return {
    prepareTarget: async () => ({
      targetId: "target-target",
      roomId: "!target:secondary.localhost",
      targetAclHash,
      targetAclBytes,
      checkpoint,
      checkpointEventIds: ["$target-checkpoint"],
      freshHeads: [...heads],
    }),
    publishCertificate: async ({ certificate }) => ({
      hash: certificate.hash,
      sourceEventId: "$source-certificate",
      targetEventId: "$target-certificate",
    }),
    activateTargetSession: async () => undefined,
    restoreSourceSession: async () => undefined,
    ...overrides,
  };
};

const input = {
  workspaceId,
  targetProfileId: "local-secondary",
  memberMappings: [{ sourceUserId, targetUserId }],
};

describe("MatrixServerMigrationCoordinator", () => {
  it("switches targets only after exact target reconstruction and dual certificate read-back", async () => {
    const { database, snapshot, heads, sourceAclHash } = await seed();
    const coordinator = new MatrixServerMigrationCoordinator(
      database,
      await gateway(snapshot, heads),
      "bb".repeat(16),
      () => 10
    );

    const result = await coordinator.migrate(input);

    expect(result).toMatchObject({
      sourceTargetId: "source-target",
      targetTargetId: "target-target",
      sourceAclHash,
      targetHeads: heads,
    });
    expect(await database.syncTargets.get("source-target")).toMatchObject({
      mode: "read-only",
      state: "active",
    });
    expect(await database.syncTargets.get("target-target")).toMatchObject({
      mode: "active",
      state: "active",
    });
    expect(
      await database.aclCheckpoints
        .where("workspaceId")
        .equals(workspaceId)
        .count()
    ).toBe(1);
    expect(
      await database.verifiedCheckpoints.get(result.checkpointHash)
    ).toMatchObject({
      matrixEventIds: ["$target-checkpoint"],
      heads,
    });
    expect(
      await database.migrationCertificates.get(result.certificateHash)
    ).toMatchObject({
      sourceEventId: "$source-certificate",
      targetEventId: "$target-certificate",
    });
  });

  it("keeps the source active and the target preparing when certificate publication fails", async () => {
    const { database, snapshot, heads } = await seed();
    const restoreCalls: string[] = [];
    const coordinator = new MatrixServerMigrationCoordinator(
      database,
      await gateway(snapshot, heads, {
        publishCertificate: async () => {
          throw new Error("target read-back failed");
        },
        restoreSourceSession: async () => {
          restoreCalls.push("restore");
        },
      }),
      "bb".repeat(16)
    );

    await expect(coordinator.migrate(input)).rejects.toThrow(
      "target read-back failed"
    );

    expect(await database.syncTargets.get("source-target")).toMatchObject({
      mode: "active",
      state: "active",
    });
    expect(await database.syncTargets.get("target-target")).toMatchObject({
      mode: "preparing",
      state: "paused",
    });
    expect(restoreCalls).toEqual(["restore"]);
  });

  it("rejects a target with different heads without switching the source", async () => {
    const { database, snapshot, heads } = await seed();
    const different = Automerge.change(
      Automerge.load<Record<string, unknown>>(snapshot),
      (document) => {
        document.extra = true;
      }
    );
    const differentHeads = Automerge.getHeads(different).sort();
    const coordinator = new MatrixServerMigrationCoordinator(
      database,
      await gateway(snapshot, heads, {
        prepareTarget: async () => ({
          ...(await (
            await gateway(snapshot, heads)
          ).prepareTarget({
            workspaceId,
            targetProfileId: "local-secondary",
            sourceTargetId: "source-target",
            sourceRoomId: "!source:primary.localhost",
            sourceAclHash: "ab".repeat(32),
            sourceAclEpoch: 1,
            sourceSnapshot: snapshot,
            sourceHeads: heads,
            memberMappings: input.memberMappings,
            targetMembers: { [targetUserId]: WorkspaceRole.Owner },
          })),
          freshHeads: differentHeads,
        }),
      }),
      "bb".repeat(16)
    );

    await expect(coordinator.migrate(input)).rejects.toThrow(
      "Target heads do not match source heads"
    );
    expect(await database.syncTargets.get("source-target")).toMatchObject({
      mode: "active",
    });
    expect(await database.syncTargets.get("target-target")).toMatchObject({
      mode: "preparing",
    });
  });

  it("requires one explicit target identity for every retained source member", async () => {
    const { database, snapshot, heads } = await seed();
    const prepareCalls: string[] = [];
    const fake = await gateway(snapshot, heads, {
      prepareTarget: async () => {
        prepareCalls.push("prepare");
        throw new Error("unexpected");
      },
    });
    const coordinator = new MatrixServerMigrationCoordinator(
      database,
      fake,
      "bb".repeat(16)
    );

    await expect(
      coordinator.migrate({ ...input, memberMappings: [] })
    ).rejects.toThrow("explicit target mapping");
    expect(prepareCalls).toEqual([]);
  });
});
