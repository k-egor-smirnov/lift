import { describe, expect, it } from "vitest";

import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { CheckpointCodec } from "../CheckpointCodec";

describe("CheckpointCodec", () => {
  it("creates a deterministic gzip checkpoint and verifies exact Automerge heads", async () => {
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace("ws_checkpoint", "Europe/Moscow", "06:00"),
      "aa".repeat(16)
    );
    document.change("checkpoint state", (draft) => {
      draft.settings.startOfDay = "07:00";
    });
    const codec = new CheckpointCodec();

    const first = await codec.create({
      workspaceId: "ws_checkpoint",
      authEpoch: 3,
      snapshot: document.save(),
    });
    const second = await codec.create({
      workspaceId: "ws_checkpoint",
      authEpoch: 3,
      snapshot: document.save(),
    });

    expect(second).toEqual(first);
    const verified = await codec.decodeAndVerify(first, "bb".repeat(16));
    expect(verified.workspaceId).toBe("ws_checkpoint");
    expect(verified.authEpoch).toBe(3);
    expect(verified.heads).toEqual([...document.heads()]);
    expect(
      AutomergeWorkspaceDocument.load(
        verified.snapshot,
        "cc".repeat(16)
      ).value().settings.startOfDay
    ).toBe("07:00");
  });

  it("rejects tampered compressed bytes before attempting restore", async () => {
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace("ws_tamper", "UTC", "04:00"),
      "aa".repeat(16)
    );
    const codec = new CheckpointCodec();
    const encoded = await codec.create({
      workspaceId: "ws_tamper",
      authEpoch: 1,
      snapshot: document.save(),
    });
    const corrupted = encoded.compressedSnapshot.slice();
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;

    await expect(
      codec.decodeAndVerify(
        { ...encoded, compressedSnapshot: corrupted },
        "bb".repeat(16)
      )
    ).rejects.toThrow("checkpoint hash");
  });

  it("rejects a snapshot belonging to another workspace", async () => {
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace("ws_actual", "UTC", "04:00"),
      "aa".repeat(16)
    );

    await expect(
      new CheckpointCodec().create({
        workspaceId: "ws_declared",
        authEpoch: 1,
        snapshot: document.save(),
      })
    ).rejects.toThrow("workspace");
  });
});
