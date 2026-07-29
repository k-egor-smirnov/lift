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

export const readRemoteWorkspaceState = async (
  client: Pick<MatrixClient, "roomState">,
  roomId: string,
  eventType: string
): Promise<{
  readonly eventId: string;
  readonly content: Readonly<Record<string, unknown>>;
}> => {
  const state = await client.roomState(roomId);
  const event = state.find(
    (candidate) => candidate.type === eventType && candidate.state_key === ""
  );
  if (
    event === undefined ||
    typeof event.event_id !== "string" ||
    typeof event.content !== "object" ||
    event.content === null ||
    Array.isArray(event.content)
  ) {
    throw new Error(`Matrix state ${eventType} is unavailable`);
  }
  return {
    eventId: event.event_id,
    content: event.content as Readonly<Record<string, unknown>>,
  };
};

export const readRemoteWorkspaceAccess = async (
  client: Pick<MatrixClient, "roomState">,
  roomId: string,
  userIds: readonly string[]
): Promise<{
  readonly userPowerLevels: Readonly<Record<string, number>>;
  readonly memberships: Readonly<Record<string, string>>;
}> => {
  const state = await client.roomState(roomId);
  const power = state.find(
    (candidate) =>
      candidate.type === "m.room.power_levels" && candidate.state_key === ""
  );
  const users =
    typeof power?.content === "object" &&
    power.content !== null &&
    !Array.isArray(power.content) &&
    typeof power.content.users === "object" &&
    power.content.users !== null &&
    !Array.isArray(power.content.users)
      ? power.content.users
      : null;
  if (users === null) {
    throw new Error("Matrix power-level state is unavailable");
  }
  const userPowerLevels: Record<string, number> = {};
  const memberships: Record<string, string> = {};
  for (const userId of [...new Set(userIds)].sort()) {
    const level = (users as Record<string, unknown>)[userId];
    if (typeof level !== "number" || !Number.isSafeInteger(level)) {
      throw new Error(`Matrix power level is unavailable for ${userId}`);
    }
    const membership = state.find(
      (candidate) =>
        candidate.type === "m.room.member" && candidate.state_key === userId
    )?.content?.membership;
    if (typeof membership !== "string") {
      throw new Error(`Matrix membership is unavailable for ${userId}`);
    }
    userPowerLevels[userId] = level;
    memberships[userId] = membership;
  }
  return { userPowerLevels, memberships };
};
