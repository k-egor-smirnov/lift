import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EncryptedTransport } from "../../../application/ports/EncryptedTransport";
import type { WorkspaceWriteAuthorization } from "../../../application/ports/WorkspaceWriteAuthorization";
import { ProcessOutboxUseCase } from "../../../application/use-cases/ProcessOutboxUseCase";
import type { WorkspaceAclCheckpoint } from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { DexieSyncOutbox } from "../../database/DexieSyncOutbox";
import { PayloadFragmenter } from "../../sync/PayloadFragmenter";
import { MatrixCheckpointPublisher } from "../MatrixCheckpointPublisher";

const databases: LiftSecureDatabase[] = [];

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

const seed = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  const document = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace("ws_checkpoint", "Europe/Moscow", "06:00"),
    "aa".repeat(16)
  );
  document.change("checkpoint task state", (draft) => {
    draft.settings.startOfDay = "07:00";
  });
  await database.workspaceSnapshots.add({
    workspaceId: "ws_checkpoint",
    schemaVersion: 1,
    bytes: document.save(),
    heads: [...document.heads()],
    savedAt: 1,
  });
  const acl: WorkspaceAclCheckpoint = {
    workspaceId: "ws_checkpoint",
    authEpoch: 1,
    previousHash: null,
    members: { "@owner:test": WorkspaceRole.Owner },
    revokedUsers: [],
    revokedDevices: [],
    acceptedHeads: [...document.heads()],
    sender: {
      userId: "@owner:test",
      deviceId: "OWNER",
      ed25519Key: "owner-ed25519",
      curve25519Key: "owner-curve25519",
    },
  };
  const codec = new CanonicalAclCodec();
  const aclBytes = codec.encode(acl);
  await database.aclCheckpoints.add({
    workspaceId: "ws_checkpoint",
    authEpoch: 1,
    hash: await codec.hash(aclBytes),
    previousHash: null,
    bytes: aclBytes,
    createdAt: 1,
  });
  await database.syncTargets.add({
    id: "target",
    workspaceId: "ws_checkpoint",
    serverProfileId: "primary",
    roomId: "!checkpoint:test",
    mode: "active",
    state: "active",
    createdAt: 1,
    updatedAt: 1,
  });
  return database;
};

const processFor = (
  database: LiftSecureDatabase,
  transport: EncryptedTransport,
  now: () => number
) =>
  new ProcessOutboxUseCase(
    new DexieSyncOutbox(database, now),
    transport,
    new PayloadFragmenter(),
    { now },
    () => 1
  );

describe("MatrixCheckpointPublisher", () => {
  it("durably enqueues, sends and records a deterministic checkpoint", async () => {
    const database = await seed();
    const sent: Array<{
      transactionId: string;
      content: Readonly<Record<string, unknown>>;
    }> = [];
    const process = processFor(
      database,
      {
        send: async ({ transactionId, content }) => {
          sent.push({ transactionId, content });
          return { eventId: "$checkpoint" };
        },
      },
      () => 10
    );
    const authorization: WorkspaceWriteAuthorization = {
      requireEdit: async () => undefined,
    };
    const publisher = new MatrixCheckpointPublisher(
      database,
      authorization,
      async () => {
        await process.runOnce();
      },
      undefined,
      () => 10
    );

    const first = await publisher.publish("ws_checkpoint");
    const second = await publisher.publish("ws_checkpoint");

    expect(second.hash).toBe(first.hash);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      transactionId: `lift.cp1.${first.hash}.0`,
      content: {
        type: "dev.lift.checkpoint.v1",
        checkpointHash: first.hash,
      },
    });
    expect(await database.verifiedCheckpoints.get(first.hash)).toMatchObject({
      workspaceId: "ws_checkpoint",
      authEpoch: 1,
      heads: first.heads,
      matrixEventIds: ["$checkpoint"],
      verifiedAt: 10,
    });
    expect(await database.checkpointPublications.count()).toBe(0);
  });

  it("leaves a durable pending publication after a process interruption and resumes it", async () => {
    const database = await seed();
    let now = 0;
    const authorization: WorkspaceWriteAuthorization = {
      requireEdit: async () => undefined,
    };
    const interrupted = new MatrixCheckpointPublisher(
      database,
      authorization,
      () => {
        throw new Error("tab closed before worker wake");
      },
      undefined,
      () => now,
      async () => {
        now += 1;
      },
      1
    );

    await expect(interrupted.publish("ws_checkpoint")).rejects.toThrow(
      "queued"
    );
    expect(await database.checkpointPublications.count()).toBe(1);
    expect(await database.syncOutbox.toCollection().first()).toMatchObject({
      state: "pending",
      innerType: "dev.lift.checkpoint.v1",
    });

    const transport: EncryptedTransport = {
      send: async () => ({ eventId: "$resumed-checkpoint" }),
    };
    const process = processFor(database, transport, () => now);
    const resumed = new MatrixCheckpointPublisher(
      database,
      authorization,
      async () => {
        await process.runOnce();
      },
      undefined,
      () => now
    );
    const checkpoint = await resumed.publish("ws_checkpoint");

    expect(
      await database.verifiedCheckpoints.get(checkpoint.hash)
    ).toMatchObject({
      matrixEventIds: ["$resumed-checkpoint"],
    });
    expect(await database.checkpointPublications.count()).toBe(0);
  });

  it("rechecks write authorization after binding the checkpoint ACL epoch", async () => {
    const database = await seed();
    let checks = 0;
    const signal = vi.fn();
    const publisher = new MatrixCheckpointPublisher(
      database,
      {
        requireEdit: async () => {
          checks += 1;
          if (checks > 1) throw new Error("Workspace is read-only");
        },
      },
      signal
    );

    await expect(publisher.publish("ws_checkpoint")).rejects.toThrow(
      "read-only"
    );
    expect(checks).toBe(2);
    expect(signal).not.toHaveBeenCalled();
    expect(await database.checkpointPublications.count()).toBe(0);
  });
});
