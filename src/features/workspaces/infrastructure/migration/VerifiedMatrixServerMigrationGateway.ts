import type {
  MatrixCredentials,
  MatrixSessionSnapshot,
} from "../../application/ports/MatrixSession";
import type { WorkspaceAclCheckpoint } from "../../domain/WorkspaceAcl";
import { workspaceDeviceRef } from "../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../domain/WorkspaceRole";
import { AclChainValidator } from "../acl/AclChainValidator";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import { CheckpointCodec } from "../checkpoint/CheckpointCodec";
import { signingJsonBytes } from "../crypto/MatrixSigningJson";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import { MatrixEncryptedTransport } from "../matrix/MatrixEncryptedTransport";
import type { MatrixWorkspaceClient } from "../matrix/MatrixSdkFacade";
import { PayloadFragmenter } from "../sync/PayloadFragmenter";
import type {
  MatrixServerMigrationGateway,
  PrepareMatrixMigrationTargetInput,
  PreparedMatrixMigrationTarget,
} from "./MatrixServerMigrationCoordinator";

const ACL_EVENT_TYPE = "dev.lift.acl.v1";
const ACL_HEAD_TYPE = "dev.lift.acl.head.v1";
const CERTIFICATE_EVENT_TYPE = "dev.lift.server_migration.v1";

const targetId = (workspaceId: string, profileId: string): string =>
  `matrix:${encodeURIComponent(workspaceId)}:${encodeURIComponent(profileId)}`;

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const sendExactEncrypted = async (
  client: MatrixWorkspaceClient,
  roomId: string,
  eventType: string,
  content: Readonly<Record<string, unknown>>,
  transactionId: string
): Promise<string> => {
  const signed = await client.signWorkspaceContent(content);
  const eventId = await client.sendEncryptedWorkspaceEvent(
    roomId,
    eventType,
    signed,
    transactionId
  );
  const readBack = await client.readWorkspaceEvent(roomId, eventId);
  if (
    readBack.wireType !== "m.room.encrypted" ||
    readBack.clearType !== eventType ||
    typeof readBack.content !== "object" ||
    readBack.content === null ||
    !equalBytes(signingJsonBytes(content), signingJsonBytes(readBack.content))
  ) {
    throw new Error(`Matrix ${eventType} read-back mismatch`);
  }
  return eventId;
};

const powerLevel = (role: WorkspaceRole): number => {
  switch (role) {
    case WorkspaceRole.Owner:
      return 100;
    case WorkspaceRole.Admin:
      return 75;
    case WorkspaceRole.Editor:
      return 50;
    case WorkspaceRole.Viewer:
      return 0;
  }
};

export interface MigrationMatrixSession {
  snapshot(): MatrixSessionSnapshot;
  beginRecovery(credentials: MatrixCredentials): Promise<void>;
  recoverWithKey(recoveryKey: string): Promise<void>;
  requireAuthenticatedClient(): MatrixWorkspaceClient;
  stop(): Promise<void>;
  resume(): Promise<boolean>;
}

export interface MatrixMigrationCredentials extends MatrixCredentials {
  readonly recoveryKey: string;
}

interface SessionMetadataWriter {
  persist(profileId: string, userId: string, deviceId: string): Promise<void>;
}

interface SessionIdentity {
  readonly profileId: string;
  readonly userId: string;
  readonly deviceId: string;
}

const requireReadyIdentity = (
  snapshot: MatrixSessionSnapshot,
  expectedProfileId?: string
): SessionIdentity => {
  if (
    snapshot.phase !== "ready" ||
    snapshot.profileId === null ||
    snapshot.userId === null ||
    snapshot.deviceId === null ||
    (expectedProfileId !== undefined &&
      snapshot.profileId !== expectedProfileId)
  ) {
    throw new Error(
      snapshot.errorCode ?? "Matrix migration session is not ready"
    );
  }
  return {
    profileId: snapshot.profileId,
    userId: snapshot.userId,
    deviceId: snapshot.deviceId,
  };
};

export class VerifiedMatrixServerMigrationGateway implements MatrixServerMigrationGateway {
  private sourceIdentity: SessionIdentity | null = null;
  private targetIdentity: SessionIdentity | null = null;
  private prepared: {
    readonly sourceTargetId: string;
    readonly targetTargetId: string;
    readonly sourceRoomId: string;
    readonly targetRoomId: string;
  } | null = null;

  constructor(
    private readonly sourceSession: MigrationMatrixSession,
    private readonly targetSession: MigrationMatrixSession,
    private readonly metadata: SessionMetadataWriter,
    private readonly credentials: MatrixMigrationCredentials,
    private readonly aclCodec = new CanonicalAclCodec(),
    private readonly checkpointCodec = new CheckpointCodec(),
    private readonly fragmenter = new PayloadFragmenter()
  ) {}

  async prepareTarget(
    input: PrepareMatrixMigrationTargetInput
  ): Promise<PreparedMatrixMigrationTarget> {
    if (input.targetProfileId !== this.credentials.profileId)
      throw new Error("Migration credential profile mismatch");
    this.sourceIdentity = requireReadyIdentity(this.sourceSession.snapshot());
    if (
      input.sourceRevokedUsers.includes(this.sourceIdentity.userId) ||
      input.sourceRevokedDevices.includes(
        workspaceDeviceRef(
          this.sourceIdentity.userId,
          this.sourceIdentity.deviceId
        )
      )
    ) {
      throw new Error("Authenticated source device is revoked");
    }
    const targetOwners = Object.entries(input.targetMembers).filter(
      ([, role]) => role === WorkspaceRole.Owner
    );
    const targetOwner = targetOwners.length === 1 ? targetOwners[0] : undefined;
    const sourceOwner = input.memberMappings.find(
      ({ targetUserId }) => targetUserId === targetOwner?.[0]
    );
    if (
      targetOwner === undefined ||
      sourceOwner === undefined ||
      this.sourceIdentity.userId !== sourceOwner.sourceUserId
    ) {
      throw new Error("Authenticated source user must be workspace Owner");
    }
    await this.targetSession.beginRecovery(this.credentials);
    if (this.targetSession.snapshot().phase !== "recovery-key-required") {
      throw new Error(
        this.targetSession.snapshot().errorCode ??
          "Target Matrix account did not request recovery"
      );
    }
    await this.targetSession.recoverWithKey(this.credentials.recoveryKey);
    this.targetIdentity = requireReadyIdentity(
      this.targetSession.snapshot(),
      input.targetProfileId
    );
    if (this.targetIdentity.userId !== targetOwner[0]) {
      throw new Error("Authenticated target user must map to workspace Owner");
    }

    const client = this.targetSession.requireAuthenticatedClient();
    const roomId = await client.createEncryptedWorkspaceRoom(
      this.targetIdentity.userId
    );
    if (client.applyWorkspaceAccess === undefined)
      throw new Error("Target Matrix access control is unavailable");
    const expectedPowerLevels = Object.fromEntries(
      Object.entries(input.targetMembers).map(([userId, role]) => [
        userId,
        powerLevel(role),
      ])
    );
    await client.applyWorkspaceAccess(
      roomId,
      expectedPowerLevels,
      Object.keys(input.targetMembers).filter(
        (userId) => userId !== this.targetIdentity!.userId
      ),
      []
    );
    if (client.readWorkspaceAccess === undefined) {
      throw new Error("Target Matrix access read-back is unavailable");
    }
    const access = await client.readWorkspaceAccess(
      roomId,
      Object.keys(input.targetMembers)
    );
    for (const [userId, level] of Object.entries(expectedPowerLevels)) {
      const membership = access.memberships[userId];
      if (
        access.userPowerLevels[userId] !== level ||
        (userId === this.targetIdentity.userId
          ? membership !== "join"
          : membership !== "join" && membership !== "invite")
      ) {
        throw new Error("Target Matrix access read-back mismatch");
      }
    }

    const keys = await client.ownDeviceKeys();
    const root: WorkspaceAclCheckpoint = {
      workspaceId: input.workspaceId,
      authEpoch: 1,
      previousHash: null,
      members: input.targetMembers,
      revokedUsers: [],
      revokedDevices: [],
      acceptedHeads: [...input.sourceHeads].sort(),
      sender: {
        userId: this.targetIdentity.userId,
        deviceId: this.targetIdentity.deviceId,
        ed25519Key: keys.ed25519,
        curve25519Key: keys.curve25519,
      },
    };
    const targetAcl = await new AclChainValidator(this.aclCodec).accept(root);
    const bootstrapHash = await sha256(input.sourceSnapshot);
    await sendExactEncrypted(
      client,
      roomId,
      ACL_EVENT_TYPE,
      {
        schemaVersion: 1,
        hash: targetAcl.hash,
        bytes: base64Url(targetAcl.bytes),
        bootstrap: {
          hash: bootstrapHash,
          bytes: base64Url(input.sourceSnapshot),
        },
      },
      `lift.migration.acl.${targetAcl.hash}`
    );
    await client.publishWorkspaceState(roomId, ACL_HEAD_TYPE, {
      authEpoch: 1,
      hash: targetAcl.hash,
    });
    if (client.readWorkspaceState === undefined)
      throw new Error("Target Matrix state read-back is unavailable");
    const head = await client.readWorkspaceState(roomId, ACL_HEAD_TYPE);
    if (head.content.authEpoch !== 1 || head.content.hash !== targetAcl.hash) {
      throw new Error("Target ACL head read-back mismatch");
    }

    const checkpoint = await this.checkpointCodec.create({
      workspaceId: input.workspaceId,
      authEpoch: 1,
      snapshot: input.sourceSnapshot,
    });
    const checkpointEventIds = await this.publishCheckpoint(roomId, checkpoint);
    const reconstructed = await this.checkpointCodec.decodeAndVerify(
      checkpoint,
      "fa".repeat(16)
    );
    const fresh = AutomergeWorkspaceDocument.load(
      reconstructed.snapshot,
      "fa".repeat(16)
    );
    const prepared = {
      sourceTargetId: input.sourceTargetId,
      targetTargetId: targetId(input.workspaceId, input.targetProfileId),
      sourceRoomId: input.sourceRoomId,
      targetRoomId: roomId,
    };
    this.prepared = prepared;
    return {
      targetId: prepared.targetTargetId,
      roomId,
      targetAclHash: targetAcl.hash,
      targetAclBytes: targetAcl.bytes.slice(),
      checkpoint,
      checkpointEventIds,
      freshHeads: [...fresh.heads()].sort(),
      sourceSession: { ...this.sourceIdentity },
      targetSession: { ...this.targetIdentity },
    };
  }

  async publishCertificate(
    input: Parameters<MatrixServerMigrationGateway["publishCertificate"]>[0]
  ) {
    const prepared = this.prepared;
    if (
      prepared === null ||
      input.sourceTargetId !== prepared.sourceTargetId ||
      input.targetTargetId !== prepared.targetTargetId
    ) {
      throw new Error("Migration target is not prepared");
    }
    const content = {
      schemaVersion: 1,
      hash: input.certificate.hash,
      bytes: base64Url(input.certificate.bytes),
    };
    const sourceEventId = await sendExactEncrypted(
      this.sourceSession.requireAuthenticatedClient(),
      prepared.sourceRoomId,
      CERTIFICATE_EVENT_TYPE,
      content,
      `lift.migration.certificate.${input.certificate.hash}`
    );
    const targetEventId = await sendExactEncrypted(
      this.targetSession.requireAuthenticatedClient(),
      prepared.targetRoomId,
      CERTIFICATE_EVENT_TYPE,
      content,
      `lift.migration.certificate.${input.certificate.hash}`
    );
    return {
      hash: input.certificate.hash,
      sourceEventId,
      targetEventId,
    };
  }

  async activateTargetSession(): Promise<void> {
    const target = this.targetIdentity;
    if (target === null)
      throw new Error("Target Matrix session is unavailable");
    await this.targetSession.stop();
    await this.sourceSession.stop();
    if (!(await this.sourceSession.resume())) {
      throw new Error("Target Matrix session handoff failed");
    }
    requireReadyIdentity(this.sourceSession.snapshot(), target.profileId);
  }

  async restoreSourceSession(): Promise<void> {
    await this.targetSession.stop().catch(() => undefined);
    const source = this.sourceIdentity;
    if (source === null) return;
    await this.metadata.persist(
      source.profileId,
      source.userId,
      source.deviceId
    );
    const current = this.sourceSession.snapshot();
    if (
      current.phase === "ready" &&
      current.profileId === source.profileId &&
      current.userId === source.userId &&
      current.deviceId === source.deviceId
    ) {
      return;
    }
    await this.sourceSession.stop();
    if (!(await this.sourceSession.resume())) {
      throw new Error("Source Matrix session restore failed");
    }
    requireReadyIdentity(this.sourceSession.snapshot(), source.profileId);
  }

  private async publishCheckpoint(
    roomId: string,
    checkpoint: Awaited<ReturnType<CheckpointCodec["create"]>>
  ): Promise<readonly string[]> {
    const transport = new MatrixEncryptedTransport(this.targetSession);
    const fragments = await this.fragmenter.split(
      checkpoint.compressedSnapshot
    );
    const header = {
      type: "dev.lift.checkpoint.v1" as const,
      schemaVersion: 1 as const,
      compression: "gzip" as const,
      workspaceId: checkpoint.workspaceId,
      authEpoch: checkpoint.authEpoch,
      checkpointHash: checkpoint.hash,
      heads: [...checkpoint.heads],
      coveredChangeHashes: [...checkpoint.coveredChangeHashes],
    };
    if (fragments.length === 0) {
      const sent = await transport.send({
        roomId,
        innerType: "dev.lift.checkpoint.v1",
        content: {
          ...header,
          payload: {
            mode: "inline",
            bytes: base64Url(checkpoint.compressedSnapshot),
          },
        },
        transactionId: `lift.migration.cp1.${checkpoint.hash}.0`,
      });
      return [sent.eventId];
    }
    const eventIds: string[] = [];
    for (const fragment of fragments) {
      const sent = await transport.send({
        roomId,
        innerType: "dev.lift.checkpoint.v1",
        content: {
          ...header,
          payload: {
            mode: "fragment",
            transferId: checkpoint.hash,
            index: fragment.index,
            count: fragment.count,
            fragmentHash: fragment.fragmentHash,
            bytes: base64Url(fragment.bytes),
          },
        },
        transactionId: `lift.migration.cp1.${checkpoint.hash}.${fragment.index}`,
      });
      eventIds.push(sent.eventId);
    }
    return eventIds;
  }
}
