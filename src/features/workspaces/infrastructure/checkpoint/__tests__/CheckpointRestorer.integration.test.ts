import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceAclCheckpoint } from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { CheckpointCodec } from "../CheckpointCodec";
import { CheckpointRestorer } from "../CheckpointRestorer";

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

describe("CheckpointRestorer", () => {
  it("restores causally complete checkpoints at the accepted ACL epoch, not a newer timestamp alone", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace("ws_restore", "UTC", "04:00"),
      "aa".repeat(16)
    );
    const rootHeads = [...document.heads()];
    const rootSnapshot = document.save();
    document.change("first checkpoint", (draft) => {
      draft.settings.startOfDay = "05:00";
    });
    const firstSnapshot = document.save();
    document.change("second checkpoint", (draft) => {
      draft.settings.startOfDay = "06:00";
    });
    const secondSnapshot = document.save();
    const codec = new CheckpointCodec();
    const first = await codec.create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: firstSnapshot,
    });
    const second = await codec.create({
      workspaceId: "ws_restore",
      authEpoch: 1,
      snapshot: secondSnapshot,
    });
    const acl: WorkspaceAclCheckpoint = {
      workspaceId: "ws_restore",
      authEpoch: 1,
      previousHash: null,
      members: { "@owner:test": WorkspaceRole.Owner },
      revokedUsers: [],
      revokedDevices: [],
      acceptedHeads: rootHeads,
      sender: {
        userId: "@owner:test",
        deviceId: "OWNER",
        ed25519Key: "ed",
        curve25519Key: "curve",
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
    await database.verifiedCheckpoints.bulkAdd([
      {
        hash: first.hash,
        workspaceId: "ws_restore",
        schemaVersion: 1,
        authEpoch: 1,
        heads: [...first.heads],
        coveredChangeHashes: [...first.coveredChangeHashes],
        compressedSnapshot: first.compressedSnapshot,
        matrixEventIds: ["$first"],
        verifiedAt: 100,
      },
      {
        hash: second.hash,
        workspaceId: "ws_restore",
        schemaVersion: 1,
        authEpoch: 1,
        heads: [...second.heads],
        coveredChangeHashes: [...second.coveredChangeHashes],
        compressedSnapshot: second.compressedSnapshot,
        matrixEventIds: ["$second"],
        verifiedAt: 10,
      },
    ]);
    const rebuilt = vi.fn(async () => undefined);
    let snapshotReadWasTransactional = false;
    database.workspaceSnapshots.hook("reading", (record) => {
      if (record?.workspaceId === "ws_restore") {
        snapshotReadWasTransactional ||= Dexie.currentTransaction !== null;
      }
      return record;
    });

    const result = await new CheckpointRestorer(
      database,
      "bb".repeat(16),
      rebuilt,
      undefined,
      () => 200
    ).restoreLatest("ws_restore");

    expect(result.checkpointHashes).toEqual([first.hash, second.hash].sort());
    const snapshot = await database.workspaceSnapshots.get("ws_restore");
    expect(
      AutomergeWorkspaceDocument.load(
        new Uint8Array([...snapshot!.bytes]),
        "cc".repeat(16)
      ).value().settings.startOfDay
    ).toBe("06:00");
    expect(snapshotReadWasTransactional).toBe(true);
    expect(rebuilt).toHaveBeenCalledWith("ws_restore");
  });
});
