import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { CheckpointCompactor } from "../CheckpointCompactor";

const databases: LiftSecureDatabase[] = [];
const hash = (value: string): string => value.repeat(64);

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const openDatabase = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  await database.workspaceSnapshots.add({
    workspaceId: "ws_1",
    schemaVersion: 1,
    bytes: new Uint8Array([1]),
    heads: [hash("c")],
    savedAt: 1,
  });
  await database.verifiedCheckpoints.add({
    hash: hash("f"),
    workspaceId: "ws_1",
    schemaVersion: 1,
    authEpoch: 1,
    heads: [hash("b")],
    coveredChangeHashes: [hash("a"), hash("b")],
    compressedSnapshot: new Uint8Array([2]),
    matrixEventIds: ["$checkpoint"],
    verifiedAt: 2,
  });
  return database;
};

describe("CheckpointCompactor", () => {
  it("deletes only covered unreferenced non-head change rows", async () => {
    const database = await openDatabase();
    await database.workspaceChanges.bulkAdd([
      {
        workspaceId: "ws_1",
        changeHash: hash("a"),
        bytes: new Uint8Array([1]),
        dependencies: [],
        origin: "remote",
        createdAt: 1,
      },
      {
        workspaceId: "ws_1",
        changeHash: hash("c"),
        bytes: new Uint8Array([3]),
        dependencies: [],
        origin: "local",
        createdAt: 3,
      },
    ]);

    const removed = await new CheckpointCompactor(database).compact(hash("f"));

    expect(removed).toEqual([hash("a")]);
    expect(
      await database.workspaceChanges.get(["ws_1", hash("a")])
    ).toBeUndefined();
    expect(
      await database.workspaceChanges.get(["ws_1", hash("c")])
    ).toBeDefined();
  });

  it("fails closed when a pending outbox or remaining dependency references a candidate", async () => {
    const database = await openDatabase();
    await database.workspaceChanges.bulkAdd([
      {
        workspaceId: "ws_1",
        changeHash: hash("a"),
        bytes: new Uint8Array([1]),
        dependencies: [],
        origin: "local",
        createdAt: 1,
      },
      {
        workspaceId: "ws_1",
        changeHash: hash("d"),
        bytes: new Uint8Array([4]),
        dependencies: [hash("a")],
        origin: "local",
        createdAt: 4,
      },
    ]);
    await database.syncOutbox.add({
      id: "pending",
      workspaceId: "ws_1",
      targetId: "target",
      changeHash: hash("a"),
      innerType: "dev.lift.crdt.change.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: "txn",
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });

    await expect(
      new CheckpointCompactor(database).compact(hash("f"))
    ).rejects.toThrow("referenced change");
    expect(
      await database.workspaceChanges.get(["ws_1", hash("a")])
    ).toBeDefined();
  });
});
