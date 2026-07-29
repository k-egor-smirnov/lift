import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceAclCheckpoint } from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type { DecryptedMatrixWorkspaceEvent } from "../../matrix/MatrixSdkFacade";
import { CheckpointCodec } from "../CheckpointCodec";
import { MatrixCheckpointReceiver } from "../MatrixCheckpointReceiver";

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

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

const setup = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  const document = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace("ws_restore", "Europe/Moscow", "06:00"),
    "aa".repeat(16)
  );
  const rootSnapshot = document.save();
  const rootHeads = [...document.heads()];
  document.change("new checkpoint state", (draft) => {
    draft.settings.startOfDay = "08:00";
  });
  const currentSnapshot = document.save();
  const currentHeads = [...document.heads()];
  const acl: WorkspaceAclCheckpoint = {
    workspaceId: "ws_restore",
    authEpoch: 1,
    previousHash: null,
    members: {
      "@owner:test": WorkspaceRole.Owner,
      "@viewer:test": WorkspaceRole.Viewer,
    },
    revokedUsers: [],
    revokedDevices: [],
    acceptedHeads: rootHeads,
    sender: {
      userId: "@owner:test",
      deviceId: "OWNER",
      ed25519Key: "owner-ed25519",
      curve25519Key: "owner-curve25519",
    },
  };
  const aclCodec = new CanonicalAclCodec();
  const aclBytes = aclCodec.encode(acl);
  await database.aclCheckpoints.add({
    workspaceId: "ws_restore",
    authEpoch: 1,
    hash: await aclCodec.hash(aclBytes),
    previousHash: null,
    bytes: aclBytes,
    createdAt: 1,
  });
  await database.workspaceSnapshots.add({
    workspaceId: "ws_restore",
    schemaVersion: 1,
    bytes: rootSnapshot,
    heads: rootHeads,
    savedAt: 1,
  });
  await database.syncTargets.add({
    id: "target",
    workspaceId: "ws_restore",
    serverProfileId: "primary",
    roomId: "!restore:test",
    mode: "active",
    state: "active",
    createdAt: 1,
    updatedAt: 1,
  });
  return {
    database,
    rootSnapshot,
    rootHeads,
    currentSnapshot,
    currentHeads,
  };
};

const advanceAcl = async (
  database: LiftSecureDatabase,
  acceptedHeads: readonly string[]
) => {
  const previous = await database.aclCheckpoints.get(["ws_restore", 1]);
  const checkpoint: WorkspaceAclCheckpoint = {
    workspaceId: "ws_restore",
    authEpoch: 2,
    previousHash: previous!.hash,
    members: { "@owner:test": WorkspaceRole.Owner },
    revokedUsers: ["@viewer:test"],
    revokedDevices: [],
    acceptedHeads: [...acceptedHeads],
    sender: {
      userId: "@owner:test",
      deviceId: "OWNER",
      ed25519Key: "owner-ed25519",
      curve25519Key: "owner-curve25519",
    },
  };
  const codec = new CanonicalAclCodec();
  const bytes = codec.encode(checkpoint);
  await database.aclCheckpoints.add({
    workspaceId: "ws_restore",
    authEpoch: 2,
    hash: await codec.hash(bytes),
    previousHash: previous!.hash,
    bytes,
    createdAt: 2,
  });
};

const eventFor = (
  checkpoint: Awaited<ReturnType<CheckpointCodec["create"]>>,
  senderUserId = "@owner:test"
): DecryptedMatrixWorkspaceEvent => ({
  eventId: "$checkpoint",
  roomId: "!restore:test",
  clearType: "dev.lift.checkpoint.v1",
  content: {
    type: "dev.lift.checkpoint.v1",
    schemaVersion: 1,
    compression: "gzip",
    workspaceId: checkpoint.workspaceId,
    authEpoch: checkpoint.authEpoch,
    checkpointHash: checkpoint.hash,
    heads: checkpoint.heads,
    coveredChangeHashes: checkpoint.coveredChangeHashes,
    payload: {
      mode: "inline",
      bytes: base64Url(checkpoint.compressedSnapshot),
    },
  },
  senderUserId,
  senderDeviceId: senderUserId === "@owner:test" ? "OWNER" : "VIEWER",
  senderCurve25519Key: "curve25519",
  claimedEd25519Key: "ed25519",
  deviceCrossSigned: true,
  shield: "none",
  applicationSignatureVerified: true,
  verified: true,
});

const fragmentEventFor = async (
  checkpoint: Awaited<ReturnType<CheckpointCodec["create"]>>,
  index: number,
  count: number,
  bytes: Uint8Array
): Promise<DecryptedMatrixWorkspaceEvent> => ({
  ...eventFor(checkpoint),
  eventId: `$checkpoint-${index}`,
  content: {
    type: "dev.lift.checkpoint.v1",
    schemaVersion: 1,
    compression: "gzip",
    workspaceId: checkpoint.workspaceId,
    authEpoch: checkpoint.authEpoch,
    checkpointHash: checkpoint.hash,
    heads: checkpoint.heads,
    coveredChangeHashes: checkpoint.coveredChangeHashes,
    payload: {
      mode: "fragment",
      transferId: checkpoint.hash,
      index,
      count,
      fragmentHash: await sha256(bytes),
      bytes: base64Url(bytes),
    },
  },
});

describe("MatrixCheckpointReceiver", () => {
  it("verifies and merges a newer checkpoint before rebuilding projections", async () => {
    const { database, currentSnapshot, currentHeads } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });
    const restored = vi.fn(async () => undefined);
    const receiver = new MatrixCheckpointReceiver(
      database,
      "bb".repeat(16),
      restored,
      undefined,
      () => 10
    );

    await expect(receiver.accept(eventFor(checkpoint))).resolves.toBe(true);

    expect(
      await database.verifiedCheckpoints.get(checkpoint.hash)
    ).toMatchObject({
      heads: currentHeads,
      matrixEventIds: ["$checkpoint"],
      verifiedAt: 10,
    });
    const snapshot = await database.workspaceSnapshots.get("ws_restore");
    expect(snapshot?.heads).toEqual(currentHeads);
    expect(
      AutomergeWorkspaceDocument.load(
        new Uint8Array([...snapshot!.bytes]),
        "cc".repeat(16)
      ).value().settings.startOfDay
    ).toBe("08:00");
    expect(restored).toHaveBeenCalledWith("ws_restore");
  });

  it("keeps a newer local frontier when an older valid checkpoint arrives", async () => {
    const { database, rootSnapshot, currentSnapshot, currentHeads } =
      await setup();
    await database.workspaceSnapshots.put({
      workspaceId: "ws_restore",
      schemaVersion: 1,
      bytes: currentSnapshot,
      heads: currentHeads,
      savedAt: 2,
    });
    const oldCheckpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: rootSnapshot,
    });

    await new MatrixCheckpointReceiver(
      database,
      "bb".repeat(16),
      () => undefined
    ).accept(eventFor(oldCheckpoint));

    expect(
      (await database.workspaceSnapshots.get("ws_restore"))?.heads
    ).toEqual(currentHeads);
  });

  it("rejects a checkpoint authored by a Viewer", async () => {
    const { database, currentSnapshot } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });

    await expect(
      new MatrixCheckpointReceiver(
        database,
        "bb".repeat(16),
        () => undefined
      ).accept(eventFor(checkpoint, "@viewer:test"))
    ).rejects.toMatchObject({ code: "checkpoint-unauthorized" });
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("rejects a checkpoint delivered through a non-active target", async () => {
    const { database, currentSnapshot } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });
    await database.syncTargets.update("target", {
      mode: "candidate",
      state: "paused",
    });

    await expect(
      new MatrixCheckpointReceiver(
        database,
        "bb".repeat(16),
        () => undefined
      ).accept(eventFor(checkpoint))
    ).rejects.toMatchObject({ code: "wrong-room" });
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("rejects a checkpoint bound to a stale ACL epoch", async () => {
    const { database, currentSnapshot, currentHeads } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });
    await advanceAcl(database, currentHeads);

    await expect(
      new MatrixCheckpointReceiver(
        database,
        "bb".repeat(16),
        () => undefined
      ).accept(eventFor(checkpoint))
    ).rejects.toMatchObject({ code: "checkpoint-acl-binding" });
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("rejects a current-epoch checkpoint that omits the ACL causal frontier", async () => {
    const { database, rootSnapshot, currentHeads } = await setup();
    await advanceAcl(database, currentHeads);
    const truncated = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 2,
      snapshot: rootSnapshot,
    });

    await expect(
      new MatrixCheckpointReceiver(
        database,
        "bb".repeat(16),
        () => undefined
      ).accept(eventFor(truncated))
    ).rejects.toMatchObject({ code: "checkpoint-truncated-frontier" });
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("assembles individually hashed encrypted-event fragments before accepting a checkpoint", async () => {
    const { database, currentSnapshot, currentHeads } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });
    const midpoint = Math.ceil(checkpoint.compressedSnapshot.length / 2);
    const fragments = [
      checkpoint.compressedSnapshot.slice(0, midpoint),
      checkpoint.compressedSnapshot.slice(midpoint),
    ];
    const restored = vi.fn(async () => undefined);
    const receiver = new MatrixCheckpointReceiver(
      database,
      "bb".repeat(16),
      restored,
      undefined,
      () => 20
    );

    await expect(
      receiver.accept(await fragmentEventFor(checkpoint, 0, 2, fragments[0]))
    ).resolves.toBe(false);
    expect(await database.verifiedCheckpoints.count()).toBe(0);
    expect(await database.payloadFragments.count()).toBe(1);

    await expect(
      receiver.accept(await fragmentEventFor(checkpoint, 1, 2, fragments[1]))
    ).resolves.toBe(true);

    expect(
      await database.verifiedCheckpoints.get(checkpoint.hash)
    ).toMatchObject({
      heads: currentHeads,
      matrixEventIds: ["$checkpoint-0", "$checkpoint-1"],
      verifiedAt: 20,
    });
    expect(await database.payloadFragments.count()).toBe(0);
    expect(restored).toHaveBeenCalledOnce();
  });

  it("keeps the inbox retryable until projection rebuilding succeeds", async () => {
    const { database, currentSnapshot } = await setup();
    const checkpoint = await new CheckpointCodec().create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: currentSnapshot,
    });
    await database.syncInbox.add({
      eventId: "$checkpoint",
      workspaceId: "ws_restore",
      roomId: "!restore:test",
      wireEvent: "{}",
      state: "ready",
      receivedAt: 1,
      lastError: null,
    });
    const crash = new Error("projection rebuild crashed");

    await expect(
      new MatrixCheckpointReceiver(database, "bb".repeat(16), () => {
        throw crash;
      }).accept(eventFor(checkpoint))
    ).rejects.toBe(crash);
    expect(
      await database.verifiedCheckpoints.get(checkpoint.hash)
    ).toBeDefined();
    expect(await database.syncInbox.get("$checkpoint")).toMatchObject({
      state: "ready",
      lastError: null,
    });
    expect(await database.matrixEventIndex.get("$checkpoint")).toBeUndefined();

    await expect(
      new MatrixCheckpointReceiver(
        database,
        "bb".repeat(16),
        () => undefined
      ).accept(eventFor(checkpoint))
    ).resolves.toBe(true);
    expect(await database.syncInbox.get("$checkpoint")).toMatchObject({
      state: "handled",
      lastError: null,
    });
    expect(await database.matrixEventIndex.get("$checkpoint")).toBeDefined();
  });
});
