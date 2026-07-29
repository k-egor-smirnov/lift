import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { CheckpointScheduler } from "../CheckpointScheduler";

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

describe("CheckpointScheduler", () => {
  it("publishes changed state after a quiet period and suppresses duplicates or pending work", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    await database.workspaceSnapshots.add({
      workspaceId: "ws",
      schemaVersion: 1,
      bytes: new Uint8Array([1]),
      heads: ["ab".repeat(32)],
      savedAt: 0,
    });
    await database.workspaceChanges.add({
      workspaceId: "ws",
      changeHash: "ab".repeat(32),
      bytes: new Uint8Array([1]),
      dependencies: [],
      origin: "local",
      createdAt: 0,
    });
    let now = 29;
    const publish = vi.fn(async () => ({
      hash: "cd".repeat(32),
      workspaceId: "ws",
      authEpoch: 1,
      heads: ["ab".repeat(32)],
    }));
    const scheduler = new CheckpointScheduler(
      database,
      { publish },
      () => "ws",
      () => now,
      { quietPeriodMs: 30, maxIntervalMs: 300, changeThreshold: 25 }
    );

    await expect(scheduler.runOnce()).resolves.toBe(false);
    now = 30;
    await expect(scheduler.runOnce()).resolves.toBe(true);
    expect(publish).toHaveBeenCalledOnce();

    await database.checkpointPublications.add({
      id: "pending",
      hash: "cd".repeat(32),
      workspaceId: "ws",
      targetId: "target",
      schemaVersion: 1,
      authEpoch: 1,
      heads: ["ab".repeat(32)],
      coveredChangeHashes: ["ab".repeat(32)],
      compressedSnapshot: new Uint8Array([1]),
      createdAt: 30,
    });
    await expect(scheduler.runOnce()).resolves.toBe(false);
    expect(publish).toHaveBeenCalledOnce();
  });
});
