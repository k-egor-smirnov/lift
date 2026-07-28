import type { MatrixClient } from "matrix-js-sdk/lib/client.js";

type RemoteReadbackClient = Pick<
  MatrixClient,
  "fetchRoomEvent" | "getEventMapper" | "decryptEventIfNeeded"
>;

export const readRemoteWorkspaceEvent = async (
  client: RemoteReadbackClient,
  roomId: string,
  eventId: string
): Promise<{
  readonly wireType: string;
  readonly clearType: string;
  readonly content: unknown;
}> => {
  const raw = await client.fetchRoomEvent(roomId, eventId);
  if (raw.event_id !== eventId)
    throw new Error("Matrix homeserver returned the wrong workspace event");
  const event = client.getEventMapper()({ ...raw, room_id: roomId });
  const wireType = event.getWireType();
  await client.decryptEventIfNeeded(event);
  return {
    wireType,
    clearType: event.getType(),
    content: event.getContent(),
  };
};
