import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk/lib/client.js";

import {
  readRemoteWorkspaceAccess,
  readRemoteWorkspaceEvent,
  readRemoteWorkspaceState,
} from "../MatrixRemoteReadback";

describe("readRemoteWorkspaceEvent", () => {
  it("fetches the authoritative homeserver event instead of trusting a local echo", async () => {
    const fetchRoomEvent = vi.fn(async () => ({
      event_id: "$server",
      room_id: "!room:test",
      sender: "@alice:test",
      origin_server_ts: 1,
      type: "m.room.encrypted",
      content: { algorithm: "m.megolm.v1.aes-sha2" },
    }));
    const decryptEventIfNeeded = vi.fn(async (event: unknown) => {
      const matrixEvent = event as { decrypted: boolean };
      matrixEvent.decrypted = true;
    });
    const event = {
      decrypted: false,
      getWireType: () => "m.room.encrypted",
      getType: () => "dev.lift.workspace.v1",
      getContent: () => ({ checkpointHash: "ab".repeat(32) }),
    };
    const getEventMapper = vi.fn(() => () => event);

    const result = await readRemoteWorkspaceEvent(
      {
        fetchRoomEvent,
        getEventMapper:
          getEventMapper as unknown as MatrixClient["getEventMapper"],
        decryptEventIfNeeded,
      },
      "!room:test",
      "$server"
    );

    expect(fetchRoomEvent).toHaveBeenCalledWith("!room:test", "$server");
    expect(getEventMapper).toHaveBeenCalledOnce();
    expect(event.decrypted).toBe(true);
    expect(result).toEqual({
      wireType: "m.room.encrypted",
      clearType: "dev.lift.workspace.v1",
      content: { checkpointHash: "ab".repeat(32) },
    });
  });
});

describe("readRemoteWorkspaceAccess", () => {
  it("reads authoritative power levels and membership state for every mapped identity", async () => {
    const roomState = vi.fn(async () => [
      {
        event_id: "$power",
        room_id: "!room:test",
        sender: "@alice:test",
        origin_server_ts: 1,
        type: "m.room.power_levels",
        state_key: "",
        content: {
          users: { "@alice:test": 100, "@bob:test": 50 },
          users_default: 0,
        },
      },
      {
        event_id: "$alice-member",
        room_id: "!room:test",
        sender: "@alice:test",
        origin_server_ts: 1,
        type: "m.room.member",
        state_key: "@alice:test",
        content: { membership: "join" },
      },
      {
        event_id: "$bob-member",
        room_id: "!room:test",
        sender: "@alice:test",
        origin_server_ts: 1,
        type: "m.room.member",
        state_key: "@bob:test",
        content: { membership: "invite" },
      },
    ]);

    await expect(
      readRemoteWorkspaceAccess({ roomState }, "!room:test", [
        "@alice:test",
        "@bob:test",
      ])
    ).resolves.toEqual({
      userPowerLevels: { "@alice:test": 100, "@bob:test": 50 },
      memberships: {
        "@alice:test": "join",
        "@bob:test": "invite",
      },
    });
  });
});

describe("readRemoteWorkspaceState", () => {
  it("reads current state from the homeserver rather than waiting for local sync", async () => {
    const roomState = vi.fn(async () => [
      {
        event_id: "$head",
        room_id: "!room:test",
        sender: "@alice:test",
        origin_server_ts: 1,
        type: "dev.lift.acl.head.v1",
        state_key: "",
        content: { authEpoch: 2, hash: "ab".repeat(32) },
      },
    ]);

    const result = await readRemoteWorkspaceState(
      { roomState },
      "!room:test",
      "dev.lift.acl.head.v1"
    );

    expect(roomState).toHaveBeenCalledWith("!room:test");
    expect(result).toEqual({
      eventId: "$head",
      content: { authEpoch: 2, hash: "ab".repeat(32) },
    });
  });
});
