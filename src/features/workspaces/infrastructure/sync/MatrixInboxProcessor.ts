import * as Automerge from "@automerge/automerge";
import Dexie from "dexie";

import type { ClaimedInboxItem } from "../../application/ports/SyncInbox";
import type { WorkspaceUnitOfWork } from "../../application/ports/WorkspaceUnitOfWork";
import {
  WaitingForMatrixKeysError,
  RejectedInboxEventError,
  RetryableInboxProcessingError,
  type TrustedInboxProcessor,
} from "../../application/use-cases/ProcessInboxUseCase";
import { can } from "../../domain/WorkspaceRole";
import { workspaceDeviceRef } from "../../domain/WorkspaceAcl";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import type { MatrixAclBootstrapper } from "../acl/MatrixAclBootstrapper";
import type { MatrixCheckpointReceiver } from "../checkpoint/MatrixCheckpointReceiver";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import { changeEnvelopeV1 } from "../matrix/LiftEnvelope";
import type {
  MatrixWorkspaceClient,
  MatrixWorkspaceWireEvent,
} from "../matrix/MatrixSdkFacade";

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

const equal = (left: readonly string[], right: readonly string[]): boolean => {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const reject = (code: string): never => {
  throw new RejectedInboxEventError(code);
};

const applyFailureCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Unable to initialize workspace document"))
    return "apply-workspace-unavailable";
  if (message.includes("missing dependencies"))
    return "apply-missing-dependencies";
  if (message.includes("Invalid Automerge")) return "apply-invalid-automerge";
  if (message.includes("mismatched workspaceId"))
    return "apply-workspace-mismatch";
  if (message.includes("canonical completion lifecycle"))
    return "apply-lifecycle-invalid";
  return `apply-${error instanceof Error ? error.name.toLowerCase() : "unknown"}`;
};

export class MatrixInboxProcessor implements TrustedInboxProcessor {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly matrix: MatrixWorkspaceClient,
    private readonly aclBootstrap: MatrixAclBootstrapper,
    private readonly unitOfWork: WorkspaceUnitOfWork,
    private readonly actorId: string,
    private readonly codec = new CanonicalAclCodec(),
    private readonly checkpointReceiver?: MatrixCheckpointReceiver
  ) {}

  async process(item: ClaimedInboxItem): Promise<void> {
    const wire: MatrixWorkspaceWireEvent = {
      eventId: item.eventId,
      roomId: item.roomId,
      wireType: "m.room.encrypted",
      wireEvent: item.wireEvent,
    };
    let event;
    try {
      event = await this.matrix.decryptWorkspaceEvent(wire);
    } catch {
      throw new WaitingForMatrixKeysError();
    }
    if (event.clearType === "dev.lift.acl.v1") {
      await this.aclBootstrap.acceptRoot(event);
      return;
    }
    if (event.clearType === "dev.lift.checkpoint.v1") {
      const receiver =
        this.checkpointReceiver ?? reject("checkpoint-receiver-unavailable");
      await receiver.accept(event);
      return;
    }
    if (event.clearType !== "dev.lift.crdt.change.v1") {
      const safeType = event.clearType
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 80);
      reject(`unsupported-inner-type:${safeType || "empty"}`);
    }
    if (
      !event.deviceCrossSigned ||
      !event.applicationSignatureVerified ||
      event.shield === "red" ||
      event.shield === "missing" ||
      event.senderDeviceId === null
    )
      reject("change-unverified-device");
    const target = await this.database.syncTargets
      .filter(
        ({ roomId, mode, state }) =>
          roomId === event.roomId && mode === "active" && state === "active"
      )
      .first();
    const validTarget = target ?? reject("wrong-room");
    const parsed = changeEnvelopeV1.safeParse(event.content);
    const envelope = parsed.success
      ? parsed.data
      : reject("change-invalid-schema");
    if (envelope.workspaceId !== validTarget.workspaceId) {
      reject("change-acl-binding");
    }
    const latestAclRecord = await this.database.aclCheckpoints
      .where("[workspaceId+authEpoch]")
      .between(
        [validTarget.workspaceId, Dexie.minKey],
        [validTarget.workspaceId, Dexie.maxKey],
        true,
        true
      )
      .last();
    const validLatestAclRecord = latestAclRecord ?? reject("missing-acl");
    const latestAcl = this.codec.decode(validLatestAclRecord.bytes);
    if (envelope.authEpoch > latestAcl.authEpoch) {
      reject("change-acl-binding");
    }
    const eventAclRecord = await this.database.aclCheckpoints.get([
      validTarget.workspaceId,
      envelope.authEpoch,
    ]);
    const validEventAclRecord = eventAclRecord ?? reject("change-acl-binding");
    const eventAcl = this.codec.decode(validEventAclRecord.bytes);
    const senderDeviceId =
      event.senderDeviceId ?? reject("change-missing-device");
    const role = eventAcl.members[event.senderUserId];
    if (
      role === undefined ||
      !can(role, "edit") ||
      eventAcl.revokedUsers.includes(event.senderUserId) ||
      eventAcl.revokedDevices.includes(
        workspaceDeviceRef(event.senderUserId, senderDeviceId)
      )
    ) {
      reject("change-unauthorized");
    }
    const bytes = await this.acceptPayload(
      item,
      envelope.changeHash,
      envelope.payload
    );
    if (bytes === null) return;
    const decoded = (() => {
      try {
        return Automerge.decodeChange(bytes);
      } catch {
        return reject("change-decode-failed");
      }
    })();
    if (
      decoded.hash !== envelope.changeHash ||
      !equal(decoded.deps, envelope.dependencies)
    ) {
      reject("change-metadata-mismatch");
    }
    if (envelope.authEpoch < latestAcl.authEpoch) {
      const snapshot =
        (await this.database.workspaceSnapshots.get(validTarget.workspaceId)) ??
        reject("change-outside-accepted-frontier");
      if (!latestAcl.acceptedHeads.includes(envelope.changeHash)) {
        reject("change-outside-accepted-frontier");
      }
      const current = (() => {
        try {
          return AutomergeWorkspaceDocument.load(
            new Uint8Array([...snapshot.bytes]),
            this.actorId
          );
        } catch {
          return reject("change-outside-accepted-frontier");
        }
      })();
      if (!current.containsHeads([envelope.changeHash])) {
        reject("change-outside-accepted-frontier");
      }
    }
    try {
      await this.unitOfWork.applyRemote({
        workspaceId: validTarget.workspaceId,
        actorId: this.actorId,
        eventId: item.eventId,
        roomId: item.roomId,
        senderUserId: event.senderUserId,
        senderDeviceId,
        wireEvent: item.wireEvent,
        bytes,
        changeHash: envelope.changeHash,
        dependencies: envelope.dependencies,
      });
    } catch (error) {
      throw new RetryableInboxProcessingError(applyFailureCode(error));
    }
  }

  private async acceptPayload(
    item: ClaimedInboxItem,
    changeHash: string,
    payload:
      | { readonly mode: "inline"; readonly bytes: string }
      | {
          readonly mode: "fragment";
          readonly transferId: string;
          readonly index: number;
          readonly count: number;
          readonly fragmentHash: string;
          readonly bytes: string;
        }
  ): Promise<Uint8Array | null> {
    if (payload.mode === "inline") return decode(payload.bytes);
    if (payload.transferId !== changeHash) reject("fragment-transfer-mismatch");
    const bytes = decode(payload.bytes);
    if ((await sha256(bytes)) !== payload.fragmentHash)
      reject("fragment-hash-mismatch");
    await this.database.payloadFragments.put({
      direction: "inbound",
      transferId: payload.transferId,
      index: payload.index,
      count: payload.count,
      workspaceId: item.workspaceId ?? "pending",
      changeHash,
      fragmentHash: payload.fragmentHash,
      bytes,
      matrixEventId: item.eventId,
    });
    const fragments = await this.database.payloadFragments
      .where("[direction+transferId]")
      .equals(["inbound", payload.transferId])
      .sortBy("index");
    if (fragments.length < payload.count) {
      await this.database.syncInbox.update(item.eventId, {
        state: "waiting-dependencies",
        lastError: "waiting-fragments",
      });
      return null;
    }
    if (
      fragments.length !== payload.count ||
      fragments.some(
        (fragment, index) =>
          fragment.index !== index || fragment.count !== payload.count
      )
    ) {
      reject("fragment-assembly-invalid");
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
    return assembled;
  }
}
