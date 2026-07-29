import { WorkspaceRole } from "../../domain/WorkspaceRole";
import type { WorkspaceAclCheckpoint } from "../../domain/WorkspaceAcl";
import { AclChainValidator } from "../acl/AclChainValidator";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type { MatrixSessionManager } from "./MatrixSessionManager";

const ACL_EVENT_TYPE = "dev.lift.acl.v1";
const ACL_HEAD_TYPE = "dev.lift.acl.head.v1";

const targetId = (workspaceId: string, profileId: string): string =>
  `matrix:${encodeURIComponent(workspaceId)}:${encodeURIComponent(profileId)}`;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const fromBase64Url = (value: unknown): Uint8Array => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid ACL payload encoding");
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid ACL event content");
  return value as Record<string, unknown>;
};

export interface EnsureWorkspaceRoomInput {
  readonly workspaceId: string;
  readonly profileId: string;
  readonly ownerUserId: string;
  readonly ownerDeviceId: string;
  readonly acceptedHeads: readonly string[];
  readonly bootstrapSnapshot: Uint8Array;
}

export interface WorkspaceRoomBinding {
  readonly targetId: string;
  readonly roomId: string;
  readonly aclHash: string;
  readonly authEpoch: 1;
}

export class MatrixWorkspaceRoom {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly sessions: Pick<
      MatrixSessionManager,
      "requireAuthenticatedClient"
    >,
    private readonly codec = new CanonicalAclCodec(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async ensureRoot(
    input: EnsureWorkspaceRoomInput
  ): Promise<WorkspaceRoomBinding> {
    const id = targetId(input.workspaceId, input.profileId);
    const persistedTarget = await this.database.syncTargets.get(id);
    const persistedAcl = await this.database.aclCheckpoints.get([
      input.workspaceId,
      1,
    ]);
    if (persistedTarget?.mode === "active" && persistedAcl !== undefined) {
      return {
        targetId: id,
        roomId: persistedTarget.roomId,
        aclHash: persistedAcl.hash,
        authEpoch: 1,
      };
    }

    const client = this.sessions.requireAuthenticatedClient();
    const roomId =
      persistedTarget?.roomId ??
      (await client.createEncryptedWorkspaceRoom(input.ownerUserId));
    const timestamp = this.now();
    if (persistedTarget === undefined) {
      await this.database.syncTargets.put({
        id,
        workspaceId: input.workspaceId,
        serverProfileId: input.profileId,
        roomId,
        mode: "candidate",
        state: "paused",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const keys = await client.ownDeviceKeys();
    const root: WorkspaceAclCheckpoint = {
      workspaceId: input.workspaceId,
      authEpoch: 1,
      previousHash: null,
      members: { [input.ownerUserId]: WorkspaceRole.Owner },
      revokedUsers: [],
      revokedDevices: [],
      acceptedHeads: [...input.acceptedHeads],
      sender: {
        userId: input.ownerUserId,
        deviceId: input.ownerDeviceId,
        ed25519Key: keys.ed25519,
        curve25519Key: keys.curve25519,
      },
    };
    const accepted = await new AclChainValidator(this.codec).accept(root);
    const bootstrapHash = await this.codec.hash(input.bootstrapSnapshot);
    const signedAcl = await client.signWorkspaceContent({
      schemaVersion: 1,
      hash: accepted.hash,
      bytes: toBase64Url(accepted.bytes),
      bootstrap: {
        hash: bootstrapHash,
        bytes: toBase64Url(input.bootstrapSnapshot),
      },
    });
    const eventId = await client.sendEncryptedWorkspaceEvent(
      roomId,
      ACL_EVENT_TYPE,
      signedAcl,
      `lift.acl.${accepted.hash}`
    );
    const readBack = await client.readWorkspaceEvent(roomId, eventId);
    if (readBack.wireType !== "m.room.encrypted")
      throw new Error("Workspace ACL was not encrypted on the wire");
    if (readBack.clearType !== ACL_EVENT_TYPE)
      throw new Error("Invalid workspace ACL event type");
    const content = record(readBack.content);
    if (content.schemaVersion !== 1 || content.hash !== accepted.hash)
      throw new Error("Workspace ACL read-back mismatch");
    const bootstrap = record(content.bootstrap);
    const bootstrapBytes = fromBase64Url(bootstrap.bytes);
    if (
      bootstrap.hash !== bootstrapHash ||
      (await this.codec.hash(bootstrapBytes)) !== bootstrapHash
    ) {
      throw new Error("Workspace bootstrap snapshot read-back mismatch");
    }
    const decodedBytes = fromBase64Url(content.bytes);
    if ((await this.codec.hash(decodedBytes)) !== accepted.hash)
      throw new Error("Workspace ACL read-back hash mismatch");
    const readBackAccepted = await new AclChainValidator(this.codec).accept(
      this.codec.decode(decodedBytes)
    );
    if (readBackAccepted.hash !== accepted.hash)
      throw new Error("Workspace ACL canonical read-back mismatch");

    await client.publishWorkspaceState(roomId, ACL_HEAD_TYPE, {
      authEpoch: 1,
      hash: accepted.hash,
    });
    await this.database.transaction(
      "rw",
      this.database.aclCheckpoints,
      this.database.syncTargets,
      async () => {
        await this.database.aclCheckpoints.put({
          workspaceId: input.workspaceId,
          authEpoch: 1,
          hash: accepted.hash,
          previousHash: null,
          bytes: accepted.bytes,
          createdAt: timestamp,
        });
        await this.database.syncTargets.put({
          id,
          workspaceId: input.workspaceId,
          serverProfileId: input.profileId,
          roomId,
          mode: "active",
          state: "active",
          createdAt: persistedTarget?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });
      }
    );
    return {
      targetId: id,
      roomId,
      aclHash: accepted.hash,
      authEpoch: 1,
    };
  }
}
