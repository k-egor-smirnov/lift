import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceWriteAuthorization } from "../../../application/ports/WorkspaceWriteAuthorization";
import type { WorkspaceAclCheckpoint } from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../../matrix/MatrixSdkFacade";
import { MatrixCheckpointPublisher } from "../MatrixCheckpointPublisher";

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

const fakeMatrix = (
  mutateReadBack?: (
    content: Readonly<Record<string, unknown>>
  ) => Readonly<Record<string, unknown>>
) => {
  const sent: Array<{
    eventId: string;
    type: string;
    content: Readonly<Record<string, unknown>>;
    transactionId: string;
  }> = [];
  const client = {
    signWorkspaceContent: async (
      content: Readonly<Record<string, unknown>>
    ) => ({ ...content, signatures: { test: true } }),
    sendEncryptedWorkspaceEvent: async (
      _roomId: string,
      type: string,
      content: Readonly<Record<string, unknown>>,
      transactionId: string
    ) => {
      const eventId = `$checkpoint-${sent.length}`;
      sent.push({ eventId, type, content, transactionId });
      return eventId;
    },
    readWorkspaceEvent: async (_roomId: string, eventId: string) => {
      const event = sent.find((item) => item.eventId === eventId);
      if (event === undefined) throw new Error("missing sent event");
      return {
        wireType: "m.room.encrypted",
        clearType: event.type,
        content:
          mutateReadBack === undefined
            ? event.content
            : mutateReadBack(event.content),
      };
    },
  } as unknown as MatrixWorkspaceClient;
  return { client, sent };
};

describe("MatrixCheckpointPublisher", () => {
  it("publishes, reads back and records a deterministic encrypted checkpoint", async () => {
    const database = await seed();
    const matrix = fakeMatrix();
    const authorization: WorkspaceWriteAuthorization = {
      requireEdit: async () => undefined,
    };
    const publisher = new MatrixCheckpointPublisher(
      database,
      matrix.client,
      authorization,
      undefined,
      undefined,
      () => 10
    );

    const first = await publisher.publish("ws_checkpoint");
    const second = await publisher.publish("ws_checkpoint");

    expect(second.hash).toBe(first.hash);
    expect(matrix.sent).toHaveLength(1);
    expect(matrix.sent[0]).toMatchObject({
      type: "dev.lift.checkpoint.v1",
      transactionId: `lift.cp1.${first.hash}.0`,
    });
    expect(matrix.sent[0]?.content).not.toHaveProperty("compressedSnapshot");
    expect(await database.verifiedCheckpoints.get(first.hash)).toMatchObject({
      workspaceId: "ws_checkpoint",
      authEpoch: 1,
      heads: first.heads,
      matrixEventIds: ["$checkpoint-0"],
      verifiedAt: 10,
    });
  });

  it("does not record a checkpoint whose encrypted read-back mismatches", async () => {
    const database = await seed();
    const matrix = fakeMatrix((content) => ({
      ...content,
      payload: { mode: "inline", bytes: "different" },
    }));
    const publisher = new MatrixCheckpointPublisher(
      database,
      matrix.client,
      { requireEdit: async () => undefined },
      undefined,
      undefined,
      () => 10
    );

    await expect(publisher.publish("ws_checkpoint")).rejects.toThrow(
      "read-back"
    );
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("rechecks write authorization after binding the checkpoint ACL epoch", async () => {
    const database = await seed();
    const matrix = fakeMatrix();
    let checks = 0;
    const publisher = new MatrixCheckpointPublisher(database, matrix.client, {
      requireEdit: async () => {
        checks += 1;
        if (checks > 1) throw new Error("Workspace is read-only");
      },
    });

    await expect(publisher.publish("ws_checkpoint")).rejects.toThrow(
      "read-only"
    );
    expect(checks).toBe(2);
    expect(matrix.sent).toHaveLength(0);
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });
});
