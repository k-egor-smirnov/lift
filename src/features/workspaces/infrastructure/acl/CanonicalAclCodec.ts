import { WorkspaceRole } from "../../domain/WorkspaceRole";
import type { WorkspaceAclCheckpoint } from "../../domain/WorkspaceAcl";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const HASH = /^[0-9a-f]{64}$/;

const canonicalObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalObject);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalObject(Reflect.get(value, key))])
  );
};

const sortedUnique = (values: readonly string[]): readonly string[] =>
  [...values].sort((left, right) => left.localeCompare(right));

const normalize = (checkpoint: WorkspaceAclCheckpoint): unknown =>
  canonicalObject({
    ...checkpoint,
    members: Object.fromEntries(
      Object.entries(checkpoint.members).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    revokedUsers: sortedUnique(checkpoint.revokedUsers),
    revokedDevices: sortedUnique(checkpoint.revokedDevices),
    acceptedHeads: sortedUnique(checkpoint.acceptedHeads),
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Invalid ACL ${label}`);
  return value;
};

const requireStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`Invalid ACL ${label}`);
  return value.map((item) => requireString(item, label));
};

export class CanonicalAclCodec {
  encode(checkpoint: WorkspaceAclCheckpoint): Uint8Array {
    return encoder.encode(JSON.stringify(normalize(checkpoint)));
  }

  decode(bytes: Uint8Array): WorkspaceAclCheckpoint {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    if (!isRecord(value) || !isRecord(value.members) || !isRecord(value.sender))
      throw new Error("Invalid ACL checkpoint");
    const members: Record<string, WorkspaceRole> = {};
    for (const [userId, role] of Object.entries(value.members)) {
      if (!Object.values(WorkspaceRole).includes(role as WorkspaceRole))
        throw new Error("Invalid ACL role");
      members[requireString(userId, "member")] = role as WorkspaceRole;
    }
    const authEpoch = value.authEpoch;
    if (!Number.isSafeInteger(authEpoch) || (authEpoch as number) < 1)
      throw new Error("Invalid ACL epoch");
    const previousHash = value.previousHash;
    if (
      previousHash !== null &&
      (typeof previousHash !== "string" || !HASH.test(previousHash))
    )
      throw new Error("Invalid ACL previous hash");
    return {
      workspaceId: requireString(value.workspaceId, "workspace"),
      authEpoch: authEpoch as number,
      previousHash,
      members,
      revokedUsers: requireStringArray(value.revokedUsers, "revoked users"),
      revokedDevices: requireStringArray(
        value.revokedDevices,
        "revoked devices"
      ),
      acceptedHeads: requireStringArray(value.acceptedHeads, "accepted heads"),
      sender: {
        userId: requireString(value.sender.userId, "sender user"),
        deviceId: requireString(value.sender.deviceId, "sender device"),
        ed25519Key: requireString(
          value.sender.ed25519Key,
          "sender ed25519 key"
        ),
        curve25519Key: requireString(
          value.sender.curve25519Key,
          "sender curve25519 key"
        ),
      },
    };
  }

  async hash(bytes: Uint8Array): Promise<string> {
    const input = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(input).set(bytes);
    const digest = await crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
  }
}
