import { z } from "zod";

import type { DecryptedMatrixWorkspaceEvent } from "../matrix/MatrixSdkFacade";
import {
  workspaceDeviceRef,
  type HashedWorkspaceAclCheckpoint,
} from "../../domain/WorkspaceAcl";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import { AclChainValidator } from "./AclChainValidator";
import { CanonicalAclCodec } from "./CanonicalAclCodec";
import { RejectedInboxEventError } from "../../application/use-cases/ProcessInboxUseCase";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const encodedBytes = z.string().regex(/^[A-Za-z0-9_-]+$/);
const aclChainEntry = z.strictObject({ hash, bytes: encodedBytes });
const rootEnvelope = z.strictObject({
  schemaVersion: z.literal(1),
  hash,
  bytes: encodedBytes,
  aclChain: z.array(aclChainEntry).min(1).optional(),
  bootstrap: z
    .strictObject({
      hash,
      bytes: encodedBytes,
      heads: z.array(hash).min(1).optional(),
    })
    .optional(),
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
    private readonly onWorkspace: (workspaceId: string) => void | Promise<void>,
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

    const encodedChain = envelope.aclChain;
    const providedChain =
      encodedChain === undefined
        ? null
        : await (async () => {
            const validator = new AclChainValidator(this.codec);
            const acceptedChain: HashedWorkspaceAclCheckpoint[] = [];
            for (const entry of encodedChain) {
              const bytes = decode(entry.bytes);
              if ((await this.codec.hash(bytes)) !== entry.hash)
                reject("acl-chain-hash-mismatch");
              const decoded = (() => {
                try {
                  return this.codec.decode(bytes);
                } catch {
                  return reject("acl-invalid-chain");
                }
              })();
              try {
                const accepted = await validator.accept(decoded);
                if (accepted.hash !== entry.hash)
                  reject("acl-chain-hash-mismatch");
                acceptedChain.push(accepted);
              } catch {
                reject("acl-invalid-chain");
              }
            }
            const latest = acceptedChain.at(-1);
            if (
              latest === undefined ||
              latest.hash !== envelope.hash ||
              latest.checkpoint.authEpoch !== checkpoint.authEpoch
            ) {
              reject("acl-chain-frontier");
            }
            return acceptedChain;
          })();
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
    let accepted: HashedWorkspaceAclCheckpoint;
    if (providedChain !== null) {
      const byEpoch = new Map(
        providedChain.map((item) => [item.checkpoint.authEpoch, item.hash])
      );
      if (
        chainRecords.some(
          (record) => byEpoch.get(record.authEpoch) !== record.hash
        ) ||
        chainRecords.some((record) => record.authEpoch > checkpoint.authEpoch)
      ) {
        reject("acl-rollback-or-fork");
      }
      const latest = providedChain.at(-1);
      if (latest === undefined) return reject("acl-chain-frontier");
      accepted = latest;
    } else {
      const validator = new AclChainValidator(this.codec);
      try {
        for (const record of chainRecords) {
          await validator.accept(this.codec.decode(record.bytes));
        }
      } catch {
        reject("acl-local-chain-invalid");
      }
      accepted =
        sameEpoch === undefined
          ? await (async () => {
              try {
                return await validator.accept(checkpoint);
              } catch {
                return reject("acl-invalid-chain");
              }
            })()
          : { checkpoint, bytes: aclBytes, hash: sameEpoch.hash };
    }

    const isRoot = checkpoint.authEpoch === 1;
    if (isRoot && envelope.bootstrap === undefined)
      reject("acl-bootstrap-missing");
    if (isRoot && envelope.aclChain !== undefined) reject("acl-root-has-chain");
    if (
      !isRoot &&
      (envelope.bootstrap === undefined) !== (envelope.aclChain === undefined)
    ) {
      reject("acl-incomplete-invite-bootstrap");
    }
    if (
      !isRoot &&
      chainRecords.length === 0 &&
      envelope.bootstrap === undefined
    ) {
      reject("acl-missing-workspace-root");
    }
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
        !equal(
          document.heads(),
          envelope.bootstrap?.heads ?? checkpoint.acceptedHeads
        ) ||
        !document.containsHeads(checkpoint.acceptedHeads))
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
        if (!isRoot && existingTarget === undefined && document === null)
          reject("acl-missing-workspace-root");
        if (document !== null && snapshotBytes !== null) {
          const existingSnapshot = await this.database.workspaceSnapshots.get(
            checkpoint.workspaceId
          );
          const persistedDocument =
            existingSnapshot === undefined
              ? document
              : (() => {
                  const existing = AutomergeWorkspaceDocument.load(
                    new Uint8Array([...existingSnapshot.bytes]),
                    "dd".repeat(16)
                  );
                  existing.mergeSnapshot(snapshotBytes);
                  return existing;
                })();
          await this.database.workspaceSnapshots.put({
            workspaceId: checkpoint.workspaceId,
            schemaVersion: 1,
            bytes: persistedDocument.save(),
            heads: [...persistedDocument.heads()],
            savedAt: timestamp,
          });
        }
        const checkpointsToPersist = providedChain ?? [accepted];
        for (const item of checkpointsToPersist) {
          const existing = await this.database.aclCheckpoints.get([
            item.checkpoint.workspaceId,
            item.checkpoint.authEpoch,
          ]);
          await this.database.aclCheckpoints.put({
            workspaceId: item.checkpoint.workspaceId,
            authEpoch: item.checkpoint.authEpoch,
            hash: item.hash,
            previousHash: item.checkpoint.previousHash,
            bytes: item.bytes,
            createdAt: existing?.createdAt ?? timestamp,
          });
        }
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
              ({ workspaceId, state, innerType }) =>
                workspaceId === checkpoint.workspaceId &&
                (authorized
                  ? innerType === "dev.lift.crdt.change.v1" &&
                    state === "paused-auth"
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
    await this.onWorkspace(checkpoint.workspaceId);
    return checkpoint.workspaceId;
  }
}
