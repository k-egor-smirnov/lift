const CANONICAL_AUTOMERGE_ACTOR_ID = /^(?:[0-9a-f]{2})+$/;

const requireIdentityComponent = (name: string, value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.includes("\0")
  ) {
    throw new Error(`Invalid ${name}: expected a non-empty NUL-free string`);
  }

  return value;
};

/** Validates the canonical hexadecimal actor form required by Automerge. */
export const requireAutomergeActorId = (value: unknown): string => {
  if (typeof value !== "string" || !CANONICAL_AUTOMERGE_ACTOR_ID.test(value)) {
    throw new Error(
      "Invalid Automerge actor ID: expected non-empty even-length lowercase hex"
    );
  }

  return value;
};

/** Derives a stable actor without exposing a Matrix device ID as the actor. */
export class ActorIdFactory {
  async create(
    serverProfileId: unknown,
    matrixUserId: unknown,
    matrixDeviceId: unknown
  ): Promise<string> {
    const profile = requireIdentityComponent(
      "serverProfileId",
      serverProfileId
    );
    const user = requireIdentityComponent("matrixUserId", matrixUserId);
    const device = requireIdentityComponent("matrixDeviceId", matrixDeviceId);
    const input = new TextEncoder().encode(`${profile}\0${user}\0${device}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }
}
