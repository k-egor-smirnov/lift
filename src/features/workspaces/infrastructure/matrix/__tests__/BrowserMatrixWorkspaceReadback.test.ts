import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk/lib/client.js";

import { readRemoteWorkspaceEvent } from "../MatrixRemoteReadback";

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
