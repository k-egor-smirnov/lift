import { afterEach, describe, expect, it } from "vitest";

import type { EncryptedTransport } from "../../../application/ports/EncryptedTransport";
import { ProcessOutboxUseCase } from "../../../application/use-cases/ProcessOutboxUseCase";
import { DexieSyncOutbox } from "../../database/DexieSyncOutbox";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { PayloadFragmenter } from "../PayloadFragmenter";
import { retryDelay } from "../RetryPolicy";

const databases: LiftSecureDatabase[] = [];
const changeHash = "ab".repeat(32);

const openDatabase = async (): Promise<LiftSecureDatabase> => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    })
  );
});

const seed = async (database: LiftSecureDatabase): Promise<string> => {
  const id = `ws_1\0target_1\0${changeHash}`;
  await database.workspaceChanges.add({
    workspaceId: "ws_1",
    changeHash,
    bytes: new Uint8Array([1, 2, 3]),
    dependencies: [],
    origin: "local",
    createdAt: 0,
  });
  await database.syncTargets.add({
    id: "target_1",
    workspaceId: "ws_1",
    serverProfileId: "primary",
    roomId: "!room:test",
    mode: "active",
    state: "active",
    createdAt: 0,
    updatedAt: 0,
  });
  await database.aclCheckpoints.add({
    workspaceId: "ws_1",
    authEpoch: 1,
    hash: "cd".repeat(32),
    previousHash: null,
    bytes: new Uint8Array([1]),
    createdAt: 0,
  });
  await database.syncOutbox.add({
    id,
    workspaceId: "ws_1",
    targetId: "target_1",
    changeHash,
    innerType: "dev.lift.crdt.change.v1",
    authEpoch: 0,
    state: "pending",
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    matrixTxnId: id,
    matrixEventIds: [],
    nextFragmentIndex: 0,
  });
  return id;
};

describe("durable outbox worker", () => {
  it("reuses the deterministic transaction ID after a lost ACK", async () => {
    const database = await openDatabase();
    const rowId = await seed(database);
    let now = 0;
    let first = true;
    const transactionIds: string[] = [];
    const acceptedLogicalHashes = new Set<string>();
    const transport: EncryptedTransport = {
      send: async ({ transactionId, content }) => {
        transactionIds.push(transactionId);
        acceptedLogicalHashes.add(String(content.changeHash));
        if (first) {
          first = false;
          throw new Error("simulated connection reset after server acceptance");
        }
        return { eventId: "$same-logical-event" };
      },
    };
    const process = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database),
      transport,
      new PayloadFragmenter(),
      { now: () => now },
      (attempt) => retryDelay(attempt, () => 1)
    );

    await process.runOnce();
    now = 1_000;
    await process.runOnce();

    expect(transactionIds).toEqual([
      `lift.c1.${changeHash}.1.0`,
      `lift.c1.${changeHash}.1.0`,
    ]);
    expect([...acceptedLogicalHashes]).toEqual([changeHash]);
    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "acknowledged",
      authEpoch: 1,
      attemptCount: 1,
      matrixEventIds: ["$same-logical-event"],
    });
  });

  it("resumes an encrypted checkpoint after a lost ACK and verifies it only after durable acknowledgement", async () => {
    const database = await openDatabase();
    const checkpointHash = "ef".repeat(32);
    const rowId = `ws_1\0target_1\0checkpoint\0${checkpointHash}`;
    await database.syncTargets.add({
      id: "target_1",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!room:test",
      mode: "active",
      state: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    await database.aclCheckpoints.add({
      workspaceId: "ws_1",
      authEpoch: 1,
      hash: "cd".repeat(32),
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 0,
    });
    await database.checkpointPublications.add({
      id: rowId,
      hash: checkpointHash,
      workspaceId: "ws_1",
      targetId: "target_1",
      schemaVersion: 1,
      authEpoch: 1,
      heads: ["ab".repeat(32)],
      coveredChangeHashes: ["ab".repeat(32)],
      compressedSnapshot: new Uint8Array([1, 2, 3]),
      createdAt: 0,
    });
    await database.syncOutbox.add({
      id: rowId,
      workspaceId: "ws_1",
      targetId: "target_1",
      changeHash: checkpointHash,
      innerType: "dev.lift.checkpoint.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: rowId,
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    let now = 0;
    let first = true;
    const transactionIds: string[] = [];
    const transport: EncryptedTransport = {
      send: async ({ transactionId, innerType, content }) => {
        expect(innerType).toBe("dev.lift.checkpoint.v1");
        expect(content).toMatchObject({
          checkpointHash,
          authEpoch: 1,
          payload: { mode: "inline" },
        });
        transactionIds.push(transactionId);
        if (first) {
          first = false;
          throw new Error("simulated connection reset after server acceptance");
        }
        return { eventId: "$checkpoint" };
      },
    };
    const process = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database, () => now),
      transport,
      new PayloadFragmenter(),
      { now: () => now },
      () => 1
    );

    await process.runOnce();
    expect(await database.verifiedCheckpoints.count()).toBe(0);
    now = 1;
    await process.runOnce();

    expect(transactionIds).toEqual([
      `lift.cp1.${checkpointHash}.0`,
      `lift.cp1.${checkpointHash}.0`,
    ]);
    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "acknowledged",
      matrixEventIds: ["$checkpoint"],
      attemptCount: 1,
    });
    expect(
      await database.verifiedCheckpoints.get(checkpointHash)
    ).toMatchObject({
      authEpoch: 1,
      matrixEventIds: ["$checkpoint"],
      verifiedAt: 1,
    });
    expect(await database.checkpointPublications.get(rowId)).toBeUndefined();
  });

  it("discards a pending checkpoint payload when the accepted ACL epoch advances", async () => {
    const database = await openDatabase();
    const checkpointHash = "ef".repeat(32);
    const rowId = `ws_1\0target_1\0checkpoint\0${checkpointHash}`;
    await database.syncTargets.add({
      id: "target_1",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!room:test",
      mode: "active",
      state: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    await database.aclCheckpoints.add({
      workspaceId: "ws_1",
      authEpoch: 2,
      hash: "cd".repeat(32),
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 0,
    });
    await database.checkpointPublications.add({
      id: rowId,
      hash: checkpointHash,
      workspaceId: "ws_1",
      targetId: "target_1",
      schemaVersion: 1,
      authEpoch: 1,
      heads: ["ab".repeat(32)],
      coveredChangeHashes: ["ab".repeat(32)],
      compressedSnapshot: new Uint8Array([1]),
      createdAt: 0,
    });
    await database.syncOutbox.add({
      id: rowId,
      workspaceId: "ws_1",
      targetId: "target_1",
      changeHash: checkpointHash,
      innerType: "dev.lift.checkpoint.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: rowId,
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    await database.payloadFragments.add({
      direction: "outbound",
      transferId: checkpointHash,
      index: 0,
      count: 1,
      workspaceId: "ws_1",
      changeHash: checkpointHash,
      fragmentHash: "ab".repeat(32),
      bytes: new Uint8Array([1]),
      matrixEventId: null,
    });
    const process = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database),
      { send: async () => ({ eventId: "$never" }) },
      new PayloadFragmenter(),
      { now: () => 0 },
      () => 1
    );

    await expect(process.runOnce()).resolves.toBe(false);
    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "paused-auth",
      lastError: "checkpoint-acl-epoch-changed",
    });
    expect(await database.checkpointPublications.get(rowId)).toBeUndefined();
    expect(await database.payloadFragments.count()).toBe(0);
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("does not promote a checkpoint when the ACL epoch advances during delivery", async () => {
    const database = await openDatabase();
    const checkpointHash = "ef".repeat(32);
    const rowId = `ws_1\0target_1\0checkpoint\0${checkpointHash}`;
    await database.syncTargets.add({
      id: "target_1",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!room:test",
      mode: "active",
      state: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    await database.aclCheckpoints.add({
      workspaceId: "ws_1",
      authEpoch: 1,
      hash: "cd".repeat(32),
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 0,
    });
    await database.checkpointPublications.add({
      id: rowId,
      hash: checkpointHash,
      workspaceId: "ws_1",
      targetId: "target_1",
      schemaVersion: 1,
      authEpoch: 1,
      heads: ["ab".repeat(32)],
      coveredChangeHashes: ["ab".repeat(32)],
      compressedSnapshot: new Uint8Array([1, 2, 3]),
      createdAt: 0,
    });
    await database.syncOutbox.add({
      id: rowId,
      workspaceId: "ws_1",
      targetId: "target_1",
      changeHash: checkpointHash,
      innerType: "dev.lift.checkpoint.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: rowId,
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    const process = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database),
      {
        send: async () => {
          await database.aclCheckpoints.add({
            workspaceId: "ws_1",
            authEpoch: 2,
            hash: "dc".repeat(32),
            previousHash: "cd".repeat(32),
            bytes: new Uint8Array([2]),
            createdAt: 1,
          });
          return { eventId: "$accepted-under-old-epoch" };
        },
      },
      new PayloadFragmenter(),
      { now: () => 1 },
      () => 1
    );

    await expect(process.runOnce()).resolves.toBe(true);

    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "paused-auth",
      lastError: "checkpoint-acl-epoch-changed",
    });
    expect(await database.checkpointPublications.get(rowId)).toBeUndefined();
    expect(await database.verifiedCheckpoints.count()).toBe(0);
  });

  it("resumes a fragmented checkpoint from the first unacknowledged fragment after reopen", async () => {
    const database = await openDatabase();
    const checkpointHash = "ef".repeat(32);
    const rowId = `ws_1\0target_1\0checkpoint\0${checkpointHash}`;
    await database.syncTargets.add({
      id: "target_1",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!room:test",
      mode: "active",
      state: "active",
      createdAt: 0,
      updatedAt: 0,
    });
    await database.aclCheckpoints.add({
      workspaceId: "ws_1",
      authEpoch: 1,
      hash: "cd".repeat(32),
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 0,
    });
    await database.checkpointPublications.add({
      id: rowId,
      hash: checkpointHash,
      workspaceId: "ws_1",
      targetId: "target_1",
      schemaVersion: 1,
      authEpoch: 1,
      heads: ["ab".repeat(32)],
      coveredChangeHashes: ["ab".repeat(32)],
      compressedSnapshot: new Uint8Array(40_000).fill(7),
      createdAt: 0,
    });
    await database.syncOutbox.add({
      id: rowId,
      workspaceId: "ws_1",
      targetId: "target_1",
      changeHash: checkpointHash,
      innerType: "dev.lift.checkpoint.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: rowId,
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    let now = 0;
    const sentIndexes: number[] = [];
    let interruptSecond = true;
    const transport: EncryptedTransport = {
      send: async ({ content }) => {
        const payload = content.payload as { index: number };
        sentIndexes.push(payload.index);
        if (payload.index === 1 && interruptSecond) {
          interruptSecond = false;
          throw new Error("tab crashed during fragment two");
        }
        return { eventId: `$fragment-${payload.index}` };
      },
    };
    const firstProcess = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database, () => now),
      transport,
      new PayloadFragmenter(),
      { now: () => now },
      () => 1
    );

    await firstProcess.runOnce();
    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "pending",
      nextFragmentIndex: 1,
      matrixEventIds: ["$fragment-0"],
    });

    now = 1;
    const reopenedProcess = new ProcessOutboxUseCase(
      new DexieSyncOutbox(database, () => now),
      transport,
      new PayloadFragmenter(),
      { now: () => now },
      () => 1
    );
    await reopenedProcess.runOnce();

    expect(sentIndexes).toEqual([0, 1, 1]);
    expect(
      await database.verifiedCheckpoints.get(checkpointHash)
    ).toMatchObject({
      matrixEventIds: ["$fragment-0", "$fragment-1"],
    });
    expect(await database.payloadFragments.count()).toBe(0);
  });
});
