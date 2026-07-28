import type {
  WorkspaceAccessControl,
  WorkspaceAccessIntent,
} from "../../application/ports/WorkspaceAccessControl";
import type { WorkspaceWriteAuthorization } from "../../application/ports/WorkspaceWriteAuthorization";
import {
  workspaceDeviceRef,
  type WorkspaceAclCheckpoint,
} from "../../domain/WorkspaceAcl";
import {
  can,
  matrixPowerLevel,
  WorkspaceRole,
} from "../../domain/WorkspaceRole";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../matrix/MatrixSdkFacade";
import { withMatrixRateLimitRetry } from "../matrix/MatrixControlRetry";
import { AclChainValidator } from "./AclChainValidator";
import { CanonicalAclCodec } from "./CanonicalAclCodec";

const ACL_EVENT_TYPE = "dev.lift.acl.v1";
const ACL_HEAD_TYPE = "dev.lift.acl.head.v1";

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const requireNonEmpty = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} is required`);
  return normalized;
};

const requireMethod = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) throw new Error(`Matrix client lacks ${label}`);
  return value;
};

/**
 * Serialized security control-plane for one local device.
 *
 * The sync target is paused before the encrypted ACL candidate is emitted and
 * remains paused on any partial failure. Thus ordinary application changes
 * cannot be newly claimed while ACL, Matrix membership and Megolm rotation are
 * temporarily inconsistent.
 */
export class AclControlPlane
  implements WorkspaceAccessControl, WorkspaceWriteAuthorization
{
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly clientSource:
      MatrixWorkspaceClient | (() => MatrixWorkspaceClient),
    private readonly codec = new CanonicalAclCodec(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async current(workspaceId: string): Promise<WorkspaceAclCheckpoint> {
    const chain = await this.loadChain(workspaceId);
    const current = chain.at(-1);
    if (current === undefined) throw new Error("Workspace ACL is unavailable");
    return structuredClone(current.checkpoint);
  }

  async requireEdit(workspaceId: string): Promise<void> {
    const activeTarget = await this.database.syncTargets
      .filter(
        ({ workspaceId: targetWorkspaceId, mode, state }) =>
          targetWorkspaceId === workspaceId &&
          mode === "active" &&
          state === "active"
      )
      .first();
    if (activeTarget === undefined) {
      throw new Error("Matrix workspace membership is revoked");
    }
    const client = this.matrixClient();
    const identity = requireMethod(
      client.workspaceIdentity,
      "workspace identity"
    ).call(client);
    const acl = await this.current(workspaceId);
    if (
      acl.revokedUsers.includes(identity.userId) ||
      acl.revokedDevices.includes(
        workspaceDeviceRef(identity.userId, identity.deviceId)
      )
    ) {
      throw new Error("Workspace write identity is revoked");
    }
    const role = acl.members[identity.userId];
    if (role === undefined || !can(role, "edit")) {
      throw new Error("Workspace is read-only for this Matrix identity");
    }
  }

  apply(
    workspaceId: string,
    intent: WorkspaceAccessIntent
  ): Promise<WorkspaceAclCheckpoint> {
    const operation = this.tail.then(() =>
      this.applySerialized(workspaceId, intent)
    );
    this.tail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async applySerialized(
    workspaceId: string,
    intent: WorkspaceAccessIntent
  ): Promise<WorkspaceAclCheckpoint> {
    const client = this.matrixClient();
    const identity = requireMethod(
      client.workspaceIdentity,
      "workspace identity"
    ).call(client);
    const target = await this.database.syncTargets
      .filter(
        (row) =>
          row.workspaceId === workspaceId &&
          row.mode === "active" &&
          row.state === "active"
      )
      .first();
    if (target === undefined)
      throw new Error("Active Matrix workspace target is unavailable");

    const chain = await this.loadChain(workspaceId);
    const current = chain.at(-1);
    if (current === undefined) throw new Error("Workspace ACL is unavailable");
    const candidate = await this.buildCandidate(
      current.checkpoint,
      current.hash,
      identity,
      intent,
      client
    );
    const validator = new AclChainValidator(this.codec);
    for (const item of chain) await validator.accept(item.checkpoint);
    const accepted = await validator.accept(candidate);

    // Validate the complete intent before changing runtime state. Once a valid
    // security transition begins, keep ordinary transport fail-closed until
    // ACL, Matrix access and any required Megolm rotation all agree.
    await this.database.syncTargets.update(target.id, {
      state: "paused",
      updatedAt: this.now(),
    });

    const signed = await client.signWorkspaceContent({
      schemaVersion: 1,
      hash: accepted.hash,
      bytes: toBase64Url(accepted.bytes),
    });
    const eventId = await withMatrixRateLimitRetry(() =>
      client.sendEncryptedWorkspaceEvent(
        target.roomId,
        ACL_EVENT_TYPE,
        signed,
        `lift.acl.${accepted.hash}`
      )
    );
    const readBack = await client.readWorkspaceEvent(target.roomId, eventId);
    if (
      readBack.wireType !== "m.room.encrypted" ||
      readBack.clearType !== ACL_EVENT_TYPE ||
      typeof readBack.content !== "object" ||
      readBack.content === null ||
      Reflect.get(readBack.content, "hash") !== accepted.hash
    ) {
      throw new Error("Encrypted ACL read-back mismatch");
    }

    const headEventId = await withMatrixRateLimitRetry(() =>
      client.publishWorkspaceState(target.roomId, ACL_HEAD_TYPE, {
        authEpoch: candidate.authEpoch,
        hash: accepted.hash,
      })
    );
    await this.waitForHead(
      client,
      target.roomId,
      headEventId,
      candidate.authEpoch,
      accepted.hash
    );

    const timestamp = this.now();
    await this.database.aclCheckpoints.put({
      workspaceId,
      authEpoch: candidate.authEpoch,
      hash: accepted.hash,
      previousHash: candidate.previousHash,
      bytes: accepted.bytes,
      createdAt: timestamp,
    });

    const previousMembers = current.checkpoint.members;
    const invited = Object.keys(candidate.members).filter(
      (userId) => previousMembers[userId] === undefined
    );
    const removed = Object.keys(previousMembers).filter(
      (userId) => candidate.members[userId] === undefined
    );
    const levels = Object.fromEntries(
      Object.entries(candidate.members).map(([userId, role]) => [
        userId,
        matrixPowerLevel[role],
      ])
    );
    const applyWorkspaceAccess = requireMethod(
      client.applyWorkspaceAccess,
      "workspace access updates"
    );
    await withMatrixRateLimitRetry(() =>
      applyWorkspaceAccess.call(client, target.roomId, levels, invited, removed)
    );

    if (
      intent.kind === "invite-member" ||
      intent.kind === "remove-member" ||
      intent.kind === "revoke-device"
    ) {
      await requireMethod(
        client.forceDiscardWorkspaceSession,
        "Megolm session rotation"
      ).call(client, target.roomId);
      const rotatedContent =
        intent.kind === "invite-member"
          ? await (async () => {
              const snapshot =
                await this.database.workspaceSnapshots.get(workspaceId);
              if (snapshot === undefined)
                throw new Error("Workspace snapshot is unavailable");
              return client.signWorkspaceContent({
                schemaVersion: 1,
                hash: accepted.hash,
                bytes: toBase64Url(accepted.bytes),
                aclChain: [
                  ...chain.map((item) => ({
                    hash: item.hash,
                    bytes: toBase64Url(item.bytes),
                  })),
                  {
                    hash: accepted.hash,
                    bytes: toBase64Url(accepted.bytes),
                  },
                ],
                bootstrap: {
                  hash: await this.codec.hash(snapshot.bytes),
                  bytes: toBase64Url(snapshot.bytes),
                  heads: [...snapshot.heads].sort(),
                },
              });
            })()
          : signed;
      const rekeyEventId = await withMatrixRateLimitRetry(() =>
        client.sendEncryptedWorkspaceEvent(
          target.roomId,
          ACL_EVENT_TYPE,
          rotatedContent,
          `lift.acl.rekey.${accepted.hash}`
        )
      );
      const rekeyReadBack = await client.readWorkspaceEvent(
        target.roomId,
        rekeyEventId
      );
      if (
        rekeyReadBack.wireType !== "m.room.encrypted" ||
        rekeyReadBack.clearType !== ACL_EVENT_TYPE ||
        typeof rekeyReadBack.content !== "object" ||
        rekeyReadBack.content === null ||
        Reflect.get(rekeyReadBack.content, "hash") !== accepted.hash
      ) {
        throw new Error("Rotated ACL read-back mismatch");
      }
    }

    await this.database.transaction(
      "rw",
      this.database.syncTargets,
      this.database.syncOutbox,
      async () => {
        await this.database.syncTargets.update(target.id, {
          state: "active",
          updatedAt: timestamp,
        });
        const localRole = candidate.members[identity.userId];
        const authorized =
          localRole !== undefined &&
          localRole !== WorkspaceRole.Viewer &&
          !candidate.revokedUsers.includes(identity.userId) &&
          !candidate.revokedDevices.includes(
            workspaceDeviceRef(identity.userId, identity.deviceId)
          );
        const rows = await this.database.syncOutbox
          .filter(
            (row) =>
              row.workspaceId === workspaceId &&
              (authorized
                ? row.innerType === "dev.lift.crdt.change.v1" &&
                  row.state === "paused-auth"
                : row.state === "pending" || row.state === "sending")
          )
          .toArray();
        await this.database.syncOutbox.bulkUpdate(
          rows.map(({ id }) => ({
            key: id,
            changes: authorized
              ? {
                  state: "pending" as const,
                  authEpoch: candidate.authEpoch,
                  nextAttemptAt: timestamp,
                  lastError: null,
                }
              : {
                  state: "paused-auth" as const,
                  lastError: "workspace-role-or-device-revoked",
                },
          }))
        );
      }
    );
    return structuredClone(candidate);
  }

  private async loadChain(workspaceId: string) {
    const records = (
      await this.database.aclCheckpoints
        .filter((row) => row.workspaceId === workspaceId)
        .toArray()
    ).sort((left, right) => left.authEpoch - right.authEpoch);
    return records.map((record) => ({
      checkpoint: this.codec.decode(record.bytes),
      hash: record.hash,
      bytes: record.bytes,
    }));
  }

  private async buildCandidate(
    current: WorkspaceAclCheckpoint,
    previousHash: string,
    identity: { readonly userId: string; readonly deviceId: string },
    intent: WorkspaceAccessIntent,
    client: MatrixWorkspaceClient
  ): Promise<WorkspaceAclCheckpoint> {
    const members = { ...current.members };
    const revokedUsers = new Set(current.revokedUsers);
    const revokedDevices = new Set(current.revokedDevices);
    switch (intent.kind) {
      case "invite-member": {
        const userId = requireNonEmpty(intent.userId, "Matrix user ID");
        if (members[userId] !== undefined)
          throw new Error("Member already exists");
        if (revokedUsers.has(userId))
          throw new Error("A revoked user cannot be re-added");
        members[userId] = intent.role;
        break;
      }
      case "change-role": {
        const userId = requireNonEmpty(intent.userId, "Matrix user ID");
        if (members[userId] === undefined) throw new Error("Member is missing");
        members[userId] = intent.role;
        break;
      }
      case "transfer-ownership": {
        const nextOwner = requireNonEmpty(
          intent.nextOwnerUserId,
          "Next Owner user ID"
        );
        if (members[nextOwner] === undefined)
          throw new Error("Member is missing");
        members[nextOwner] = WorkspaceRole.Owner;
        members[identity.userId] = WorkspaceRole.Admin;
        break;
      }
      case "remove-member": {
        const userId = requireNonEmpty(intent.userId, "Matrix user ID");
        if (members[userId] === undefined) throw new Error("Member is missing");
        delete members[userId];
        revokedUsers.add(userId);
        break;
      }
      case "revoke-device":
        requireNonEmpty(intent.userId, "Matrix user ID");
        requireNonEmpty(intent.deviceId, "Matrix device ID");
        revokedDevices.add(workspaceDeviceRef(intent.userId, intent.deviceId));
        break;
    }
    const keys = await client.ownDeviceKeys();
    const snapshot = await this.database.workspaceSnapshots.get(
      current.workspaceId
    );
    if (snapshot === undefined)
      throw new Error("Workspace snapshot is unavailable");
    return {
      workspaceId: current.workspaceId,
      authEpoch: current.authEpoch + 1,
      previousHash,
      members,
      revokedUsers: [...revokedUsers].sort(),
      revokedDevices: [...revokedDevices].sort(),
      acceptedHeads: [
        ...new Set([...current.acceptedHeads, ...snapshot.heads]),
      ].sort(),
      sender: {
        userId: identity.userId,
        deviceId: identity.deviceId,
        ed25519Key: keys.ed25519,
        curve25519Key: keys.curve25519,
      },
    };
  }

  private async waitForHead(
    client: MatrixWorkspaceClient,
    roomId: string,
    eventId: string,
    authEpoch: number,
    hash: string
  ): Promise<void> {
    const read = requireMethod(client.readWorkspaceState, "state read-back");
    const deadline = this.now() + 15_000;
    let state = await read.call(client, roomId, ACL_HEAD_TYPE);
    while (
      state.eventId !== eventId ||
      state.content.authEpoch !== authEpoch ||
      state.content.hash !== hash
    ) {
      if (this.now() >= deadline)
        throw new Error("ACL head arbitration read-back timed out");
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      state = await read.call(client, roomId, ACL_HEAD_TYPE);
    }
  }

  private matrixClient(): MatrixWorkspaceClient {
    return typeof this.clientSource === "function"
      ? this.clientSource()
      : this.clientSource;
  }
}
