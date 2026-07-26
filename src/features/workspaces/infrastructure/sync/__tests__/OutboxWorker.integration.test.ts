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
      `lift.c1.${changeHash}.0`,
      `lift.c1.${changeHash}.0`,
    ]);
    expect([...acceptedLogicalHashes]).toEqual([changeHash]);
    expect(await database.syncOutbox.get(rowId)).toMatchObject({
      state: "acknowledged",
      authEpoch: 1,
      attemptCount: 1,
      matrixEventIds: ["$same-logical-event"],
    });
  });
});
