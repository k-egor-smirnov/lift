import { z } from "zod";

import type { DecryptedMatrixWorkspaceEvent } from "../matrix/MatrixSdkFacade";
import { workspaceDeviceRef } from "../../domain/WorkspaceAcl";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import { AclChainValidator } from "./AclChainValidator";
import { CanonicalAclCodec } from "./CanonicalAclCodec";
import { RejectedInboxEventError } from "../../application/use-cases/ProcessInboxUseCase";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const encodedBytes = z.string().regex(/^[A-Za-z0-9_-]+$/);
const rootEnvelope = z.strictObject({
  schemaVersion: z.literal(1),
  hash,
  bytes: encodedBytes,
  bootstrap: z.strictObject({ hash, bytes: encodedBytes }).optional(),
});

const decode = (value: string): Uint8Array => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const equal = (left: readonly string[], right: readonly string[]): boolean => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const targetId = (workspaceId: string, profileId: string): string =>
  `matrix:${encodeURIComponent(workspaceId)}:${encodeURIComponent(profileId)}`;

const reject = (code: string): never => {
  throw new RejectedInboxEventError(code);
};

export class MatrixAclBootstrapper {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly profileId: () => string,
    private readonly onWorkspace: (workspaceId: string) => void,
    private readonly codec = new CanonicalAclCodec(),
    private readonly now: () => number = () => Date.now(),
    private readonly localIdentity: () => {
      readonly userId: string | null;
      readonly deviceId: string | null;
    } = () => ({ userId: null, deviceId: null })
  ) {}

  async acceptRoot(event: DecryptedMatrixWorkspaceEvent): Promise<string> {
    if (event.senderDeviceId === null) reject("acl-device-key-unmapped");
    if (!event.deviceCrossSigned) reject("acl-device-not-cross-signed");
    if (!event.applicationSignatureVerified)
      reject("acl-device-signature-invalid");
    if (event.shield === "red" || event.shield === "missing")
      reject(`acl-shield-${event.shield}`);

    const parsed = rootEnvelope.safeParse(event.content);
    const envelope = parsed.success
      ? parsed.data
      : reject("acl-invalid-schema");
    const aclBytes = decode(envelope.bytes);
    if ((await this.codec.hash(aclBytes)) !== envelope.hash)
      reject("acl-hash-mismatch");
    const checkpoint = (() => {
      try {
        return this.codec.decode(aclBytes);
      } catch {
        return reject("acl-invalid-chain");
      }
    })();
    if (
      checkpoint.sender.userId !== event.senderUserId ||
      checkpoint.sender.deviceId !== event.senderDeviceId ||
      checkpoint.sender.ed25519Key !== event.claimedEd25519Key ||
      checkpoint.sender.curve25519Key !== event.senderCurve25519Key
    ) {
      reject("acl-sender-binding");
    }

    const chainRecords = (
      await this.database.aclCheckpoints
        .filter(({ workspaceId }) => workspaceId === checkpoint.workspaceId)
        .toArray()
    ).sort((left, right) => left.authEpoch - right.authEpoch);
    const sameEpoch = chainRecords.find(
      ({ authEpoch }) => authEpoch === checkpoint.authEpoch
    );
    if (sameEpoch !== undefined && sameEpoch.hash !== envelope.hash)
      reject("acl-rollback-or-fork");
    const validator = new AclChainValidator(this.codec);
    try {
      for (const record of chainRecords) {
        await validator.accept(this.codec.decode(record.bytes));
      }
    } catch {
      reject("acl-local-chain-invalid");
    }
    const accepted =
      sameEpoch === undefined
        ? await (async () => {
            try {
              return await validator.accept(checkpoint);
            } catch {
              return reject("acl-invalid-chain");
            }
          })()
        : { checkpoint, bytes: aclBytes, hash: sameEpoch.hash };

    const isRoot = checkpoint.authEpoch === 1;
    if (isRoot && envelope.bootstrap === undefined)
      reject("acl-bootstrap-missing");
    if (!isRoot && envelope.bootstrap !== undefined)
      reject("acl-transition-has-bootstrap");
    const snapshotBytes =
      envelope.bootstrap === undefined
        ? null
        : decode(envelope.bootstrap.bytes);
    if (
      snapshotBytes !== null &&
      envelope.bootstrap !== undefined &&
      (await this.codec.hash(snapshotBytes)) !== envelope.bootstrap.hash
    ) {
      reject("acl-bootstrap-hash");
    }
    const document = (() => {
      if (snapshotBytes === null) return null;
      try {
        return AutomergeWorkspaceDocument.load(snapshotBytes, "ee".repeat(16));
      } catch {
        return reject("acl-bootstrap-invalid");
      }
    })();
    if (
      document !== null &&
      (document.value().workspaceId !== checkpoint.workspaceId ||
        !equal(document.heads(), checkpoint.acceptedHeads))
    ) {
      reject("acl-bootstrap-frontier");
    }

    const profileId = this.profileId();
    const id = targetId(checkpoint.workspaceId, profileId);
    const timestamp = this.now();
    await this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.aclCheckpoints,
        this.database.syncTargets,
        this.database.syncInbox,
        this.database.syncOutbox,
        this.database.matrixEventIndex,
      ],
      async () => {
        const existingTarget = await this.database.syncTargets.get(id);
        if (
          existingTarget !== undefined &&
          existingTarget.roomId !== event.roomId
        ) {
          reject("acl-room-mismatch");
        }
        if (!isRoot && existingTarget === undefined)
          reject("acl-missing-workspace-root");
        if (
          document !== null &&
          snapshotBytes !== null &&
          (await this.database.workspaceSnapshots.get(
            checkpoint.workspaceId
          )) === undefined
        ) {
          await this.database.workspaceSnapshots.add({
            workspaceId: checkpoint.workspaceId,
            schemaVersion: 1,
            bytes: snapshotBytes,
            heads: [...document.heads()],
            savedAt: timestamp,
          });
        }
        await this.database.aclCheckpoints.put({
          workspaceId: checkpoint.workspaceId,
          authEpoch: checkpoint.authEpoch,
          hash: accepted.hash,
          previousHash: checkpoint.previousHash,
          bytes: aclBytes,
          createdAt: timestamp,
        });
        await this.database.syncTargets.put({
          id,
          workspaceId: checkpoint.workspaceId,
          serverProfileId: profileId,
          roomId: event.roomId,
          mode: "active",
          state: "active",
          createdAt: existingTarget?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });
        await this.database.syncInbox.update(event.eventId, {
          workspaceId: checkpoint.workspaceId,
          state: "handled",
          lastError: null,
        });
        await this.database.matrixEventIndex.put({
          eventId: event.eventId,
          workspaceId: checkpoint.workspaceId,
          changeHash: accepted.hash,
          roomId: event.roomId,
          senderUserId: event.senderUserId,
          senderDeviceId: event.senderDeviceId,
          receivedAt: timestamp,
        });

        const identity = this.localIdentity();
        if (identity.userId !== null && identity.deviceId !== null) {
          const role = checkpoint.members[identity.userId];
          const authorized =
            (role === "OWNER" || role === "ADMIN" || role === "EDITOR") &&
            !checkpoint.revokedUsers.includes(identity.userId) &&
            !checkpoint.revokedDevices.includes(
              workspaceDeviceRef(identity.userId, identity.deviceId)
            );
          const rows = await this.database.syncOutbox
            .filter(
              ({ workspaceId, state }) =>
                workspaceId === checkpoint.workspaceId &&
                (authorized
                  ? state === "paused-auth"
                  : state === "pending" || state === "sending")
            )
            .toArray();
          await this.database.syncOutbox.bulkUpdate(
            rows.map(({ id: rowId }) => ({
              key: rowId,
              changes: authorized
                ? {
                    state: "pending" as const,
                    authEpoch: checkpoint.authEpoch,
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
      }
    );
    this.onWorkspace(checkpoint.workspaceId);
    return checkpoint.workspaceId;
  }
}
