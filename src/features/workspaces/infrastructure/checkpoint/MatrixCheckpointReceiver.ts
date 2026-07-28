import Dexie from "dexie";

import { can } from "../../domain/WorkspaceRole";
import { workspaceDeviceRef } from "../../domain/WorkspaceAcl";
import { RejectedInboxEventError } from "../../application/use-cases/ProcessInboxUseCase";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type { DecryptedMatrixWorkspaceEvent } from "../matrix/MatrixSdkFacade";
import type { EncodedCheckpointV1 } from "./CheckpointCodec";
import { CheckpointCodec } from "./CheckpointCodec";
import { checkpointEnvelopeV1 } from "./CheckpointEnvelope";

const reject = (code: string): never => {
  throw new RejectedInboxEventError(code);
};

const decode = (value: string): Uint8Array => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

export class MatrixCheckpointReceiver {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly actorId: string,
    private readonly onRestore: (workspaceId: string) => void | Promise<void>,
    private readonly codec = new CheckpointCodec(),
    private readonly now: () => number = () => Date.now(),
    private readonly aclCodec = new CanonicalAclCodec()
  ) {}

  async accept(event: DecryptedMatrixWorkspaceEvent): Promise<boolean> {
    if (
      event.clearType !== "dev.lift.checkpoint.v1" ||
      event.senderDeviceId === null ||
      !event.deviceCrossSigned ||
      !event.applicationSignatureVerified ||
      event.shield === "red" ||
      event.shield === "missing"
    ) {
      reject("checkpoint-unverified-device");
    }
    const parsed = checkpointEnvelopeV1.safeParse(event.content);
    const envelope = parsed.success
      ? parsed.data
      : reject("checkpoint-invalid-schema");
    const target = await this.activeTarget(envelope.workspaceId, event.roomId);
    if (target === undefined) reject("wrong-room");
    const validAclRecord =
      (await this.latestAcl(envelope.workspaceId)) ??
      reject("checkpoint-acl-binding");
    if (validAclRecord.authEpoch !== envelope.authEpoch) {
      reject("checkpoint-acl-binding");
    }
    const acl = this.aclCodec.decode(validAclRecord.bytes);
    const senderDeviceId =
      event.senderDeviceId ?? reject("checkpoint-unverified-device");
    const role = acl.members[event.senderUserId];
    if (
      role === undefined ||
      !can(role, "edit") ||
      acl.revokedUsers.includes(event.senderUserId) ||
      acl.revokedDevices.includes(
        workspaceDeviceRef(event.senderUserId, senderDeviceId)
      )
    ) {
      reject("checkpoint-unauthorized");
    }

    const acceptedPayload = await this.acceptPayload(event, envelope);
    if (acceptedPayload === null) {
      await this.database.syncInbox.update(event.eventId, {
        workspaceId: envelope.workspaceId,
        state: "handled",
        lastError: "waiting-checkpoint-fragments",
      });
      return false;
    }
    const encoded: EncodedCheckpointV1 = {
      type: "dev.lift.checkpoint.v1",
      schemaVersion: 1,
      compression: "gzip",
      workspaceId: envelope.workspaceId,
      authEpoch: envelope.authEpoch,
      heads: envelope.heads,
      coveredChangeHashes: envelope.coveredChangeHashes,
      hash: envelope.checkpointHash,
      compressedSnapshot: acceptedPayload.bytes,
    };
    const verified = await this.codec
      .decodeAndVerify(encoded, this.actorId)
      .catch(() => reject("checkpoint-invalid"));
    const incoming = AutomergeWorkspaceDocument.load(
      verified.snapshot,
      this.actorId
    );
    if (!incoming.containsHeads(acl.acceptedHeads)) {
      reject("checkpoint-truncated-frontier");
    }
    const timestamp = this.now();
    await this.database.transaction(
      "rw",
      [
        this.database.verifiedCheckpoints,
        this.database.workspaceSnapshots,
        this.database.aclCheckpoints,
        this.database.syncTargets,
      ],
      async () => {
        const currentAcl = await this.latestAcl(envelope.workspaceId);
        if (
          currentAcl === undefined ||
          currentAcl.authEpoch !== envelope.authEpoch
        ) {
          reject("checkpoint-acl-binding");
        }
        if (
          (await this.activeTarget(envelope.workspaceId, event.roomId)) ===
          undefined
        ) {
          reject("wrong-room");
        }
        const existing = await this.database.workspaceSnapshots.get(
          envelope.workspaceId
        );
        const restored =
          existing === undefined
            ? incoming
            : (() => {
                const current = AutomergeWorkspaceDocument.load(
                  new Uint8Array([...existing.bytes]),
                  this.actorId
                );
                current.mergeSnapshot(verified.snapshot);
                return current;
              })();
        await this.database.workspaceSnapshots.put({
          workspaceId: envelope.workspaceId,
          schemaVersion: 1,
          bytes: restored.save(),
          heads: [...restored.heads()],
          savedAt: timestamp,
        });
        await this.database.verifiedCheckpoints.put({
          hash: verified.hash,
          workspaceId: verified.workspaceId,
          schemaVersion: 1,
          authEpoch: verified.authEpoch,
          heads: [...verified.heads],
          coveredChangeHashes: [...verified.coveredChangeHashes],
          compressedSnapshot: verified.compressedSnapshot.slice(),
          matrixEventIds: acceptedPayload.eventIds,
          verifiedAt: timestamp,
        });
      }
    );
    await this.onRestore(envelope.workspaceId);
    await this.database.transaction(
      "rw",
      [
        this.database.payloadFragments,
        this.database.syncInbox,
        this.database.matrixEventIndex,
      ],
      async () => {
        await this.database.syncInbox.bulkUpdate(
          acceptedPayload.eventIds.map((eventId) => ({
            key: eventId,
            changes: {
              workspaceId: envelope.workspaceId,
              state: "handled" as const,
              lastError: null,
            },
          }))
        );
        await this.database.matrixEventIndex.bulkPut(
          acceptedPayload.eventIds.map((eventId) => ({
            eventId,
            workspaceId: envelope.workspaceId,
            changeHash: envelope.checkpointHash,
            roomId: event.roomId,
            senderUserId: event.senderUserId,
            senderDeviceId,
            receivedAt: timestamp,
          }))
        );
        if (envelope.payload.mode === "fragment") {
          await this.database.payloadFragments
            .where("[direction+transferId]")
            .equals(["inbound", envelope.checkpointHash])
            .delete();
        }
      }
    );
    return true;
  }

  private activeTarget(workspaceId: string, roomId: string) {
    return this.database.syncTargets
      .filter(
        (target) =>
          target.workspaceId === workspaceId &&
          target.roomId === roomId &&
          target.mode === "active" &&
          target.state === "active"
      )
      .first();
  }

  private latestAcl(workspaceId: string) {
    return this.database.aclCheckpoints
      .where("[workspaceId+authEpoch]")
      .between(
        [workspaceId, Dexie.minKey],
        [workspaceId, Dexie.maxKey],
        true,
        true
      )
      .last();
  }

  private async acceptPayload(
    event: DecryptedMatrixWorkspaceEvent,
    envelope: ReturnType<typeof checkpointEnvelopeV1.parse>
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly eventIds: string[];
  } | null> {
    const payload = envelope.payload;
    if (payload.mode === "inline") {
      return { bytes: decode(payload.bytes), eventIds: [event.eventId] };
    }
    if (payload.transferId !== envelope.checkpointHash) {
      reject("checkpoint-fragment-transfer");
    }
    const bytes = decode(payload.bytes);
    if ((await sha256(bytes)) !== payload.fragmentHash) {
      reject("checkpoint-fragment-hash");
    }
    await this.database.payloadFragments.put({
      direction: "inbound",
      transferId: payload.transferId,
      index: payload.index,
      count: payload.count,
      workspaceId: envelope.workspaceId,
      changeHash: envelope.checkpointHash,
      fragmentHash: payload.fragmentHash,
      bytes,
      matrixEventId: event.eventId,
    });
    const fragments = await this.database.payloadFragments
      .where("[direction+transferId]")
      .equals(["inbound", payload.transferId])
      .sortBy("index");
    if (fragments.length < payload.count) return null;
    if (
      fragments.length !== payload.count ||
      fragments.some(
        (fragment, index) =>
          fragment.index !== index ||
          fragment.count !== payload.count ||
          fragment.matrixEventId === null
      )
    ) {
      reject("checkpoint-fragment-assembly");
    }
    const size = fragments.reduce(
      (total, fragment) => total + fragment.bytes.length,
      0
    );
    const assembled = new Uint8Array(size);
    let offset = 0;
    for (const fragment of fragments) {
      assembled.set(fragment.bytes, offset);
      offset += fragment.bytes.length;
    }
    return {
      bytes: assembled,
      eventIds: fragments.map(({ matrixEventId }) => matrixEventId!),
    };
  }
}
