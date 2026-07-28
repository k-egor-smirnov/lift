import Dexie from "dexie";

import {
  createServerMigrationCertificate,
  mapMigrationMembers,
  type HashedServerMigrationCertificate,
  type MigrationMemberMapping,
} from "../../domain/ServerMigration";
import type { WorkspaceRole } from "../../domain/WorkspaceRole";
import { AclChainValidator } from "../acl/AclChainValidator";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import {
  CheckpointCodec,
  type EncodedCheckpointV1,
} from "../checkpoint/CheckpointCodec";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";

const equal = (left: readonly string[], right: readonly string[]): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const equalMembers = (
  left: Readonly<Record<string, WorkspaceRole>>,
  right: Readonly<Record<string, WorkspaceRole>>
): boolean =>
  JSON.stringify(
    Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  ) ===
  JSON.stringify(Object.entries(right).sort(([a], [b]) => a.localeCompare(b)));

export interface PrepareMatrixMigrationTargetInput {
  readonly workspaceId: string;
  readonly targetProfileId: string;
  readonly sourceTargetId: string;
  readonly sourceRoomId: string;
  readonly sourceAclHash: string;
  readonly sourceAclEpoch: number;
  readonly sourceRevokedUsers: readonly string[];
  readonly sourceRevokedDevices: readonly string[];
  readonly sourceSnapshot: Uint8Array;
  readonly sourceHeads: readonly string[];
  readonly memberMappings: readonly MigrationMemberMapping[];
  readonly targetMembers: Readonly<Record<string, WorkspaceRole>>;
}

export interface PreparedMatrixMigrationTarget {
  readonly targetId: string;
  readonly roomId: string;
  readonly targetAclHash: string;
  readonly targetAclBytes: Uint8Array;
  readonly checkpoint: EncodedCheckpointV1;
  readonly checkpointEventIds: readonly string[];
  readonly freshHeads: readonly string[];
  readonly sourceSession: MatrixMigrationSessionIdentity;
  readonly targetSession: MatrixMigrationSessionIdentity;
}

export interface MatrixMigrationSessionIdentity {
  readonly profileId: string;
  readonly userId: string;
  readonly deviceId: string;
}

export interface MatrixMigrationCertificateReceipt {
  readonly hash: string;
  readonly sourceEventId: string;
  readonly targetEventId: string;
}

export interface MatrixServerMigrationGateway {
  prepareTarget(
    input: PrepareMatrixMigrationTargetInput
  ): Promise<PreparedMatrixMigrationTarget>;
  publishCertificate(input: {
    readonly certificate: HashedServerMigrationCertificate;
    readonly sourceTargetId: string;
    readonly targetTargetId: string;
  }): Promise<MatrixMigrationCertificateReceipt>;
  activateTargetSession(): Promise<void>;
  restoreSourceSession(): Promise<void>;
}

export interface MigrateWorkspaceServerInput {
  readonly workspaceId: string;
  readonly targetProfileId: string;
  readonly memberMappings: readonly MigrationMemberMapping[];
}

export interface WorkspaceServerMigrationResult {
  readonly workspaceId: string;
  readonly sourceTargetId: string;
  readonly targetTargetId: string;
  readonly sourceAclHash: string;
  readonly targetAclHash: string;
  readonly checkpointHash: string;
  readonly certificateHash: string;
  readonly targetHeads: readonly string[];
}

export class MatrixServerMigrationCoordinator {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly gateway: MatrixServerMigrationGateway,
    private readonly actorId: string,
    private readonly now: () => number = () => Date.now(),
    private readonly aclCodec = new CanonicalAclCodec(),
    private readonly checkpointCodec = new CheckpointCodec()
  ) {}

  async migrate(
    input: MigrateWorkspaceServerInput
  ): Promise<WorkspaceServerMigrationResult> {
    const source = await this.loadSource(input);
    const sourceAcl = this.aclCodec.decode(source.acl.bytes);
    const targetMembers = mapMigrationMembers(
      sourceAcl.members,
      input.memberMappings
    );
    let switched = false;
    try {
      const prepared = await this.gateway.prepareTarget({
        workspaceId: input.workspaceId,
        targetProfileId: input.targetProfileId,
        sourceTargetId: source.target.id,
        sourceRoomId: source.target.roomId,
        sourceAclHash: source.acl.hash,
        sourceAclEpoch: source.acl.authEpoch,
        sourceRevokedUsers: [...sourceAcl.revokedUsers],
        sourceRevokedDevices: [...sourceAcl.revokedDevices],
        sourceSnapshot: source.snapshot.bytes.slice(),
        sourceHeads: [...source.snapshot.heads],
        memberMappings: input.memberMappings.map((mapping) => ({ ...mapping })),
        targetMembers,
      });
      if (
        prepared.sourceSession.profileId !== source.target.serverProfileId ||
        prepared.targetSession.profileId !== input.targetProfileId
      ) {
        throw new Error("Migration session profile binding mismatch");
      }
      await this.persistPreparingTarget(input, source.target.id, prepared);
      const targetAcl = await this.verifyPreparedTarget(
        input,
        source.snapshot.heads,
        targetMembers,
        prepared
      );
      const certificate = await createServerMigrationCertificate({
        workspaceId: input.workspaceId,
        sourceProfileId: source.target.serverProfileId,
        sourceRoomId: source.target.roomId,
        sourceAclEpoch: source.acl.authEpoch,
        sourceAclHash: source.acl.hash,
        targetProfileId: input.targetProfileId,
        targetRoomId: prepared.roomId,
        targetAclHash: targetAcl.hash,
        heads: source.snapshot.heads,
        memberMappings: input.memberMappings,
      });
      const receipt = await this.gateway.publishCertificate({
        certificate,
        sourceTargetId: source.target.id,
        targetTargetId: prepared.targetId,
      });
      if (
        receipt.hash !== certificate.hash ||
        receipt.sourceEventId.length === 0 ||
        receipt.targetEventId.length === 0
      ) {
        throw new Error("Migration certificate read-back mismatch");
      }

      await this.commitSwitch({
        input,
        source,
        prepared,
        targetAcl,
        certificate,
        receipt,
      });
      switched = true;
      await this.gateway.activateTargetSession();
      return {
        workspaceId: input.workspaceId,
        sourceTargetId: source.target.id,
        targetTargetId: prepared.targetId,
        sourceAclHash: source.acl.hash,
        targetAclHash: targetAcl.hash,
        checkpointHash: prepared.checkpoint.hash,
        certificateHash: certificate.hash,
        targetHeads: [...prepared.freshHeads].sort(),
      };
    } catch (error) {
      if (!switched) {
        await this.gateway.restoreSourceSession().catch(() => undefined);
      }
      throw error;
    }
  }

  private async loadSource(input: MigrateWorkspaceServerInput) {
    return this.database.transaction(
      "r",
      [
        this.database.workspaceSnapshots,
        this.database.aclCheckpoints,
        this.database.syncTargets,
        this.database.syncOutbox,
        this.database.syncInbox,
        this.database.serverProfiles,
      ],
      async () => {
        const [snapshot, target, targetProfile, outboxRows, inboxRows] =
          await Promise.all([
            this.database.workspaceSnapshots.get(input.workspaceId),
            this.database.syncTargets
              .where("workspaceId")
              .equals(input.workspaceId)
              .filter(
                ({ mode, state }) => mode === "active" && state === "active"
              )
              .first(),
            this.database.serverProfiles.get(input.targetProfileId),
            this.database.syncOutbox
              .filter(({ workspaceId }) => workspaceId === input.workspaceId)
              .toArray(),
            this.database.syncInbox.toArray(),
          ]);
        const aclChain = await this.database.aclCheckpoints
          .where("[workspaceId+authEpoch]")
          .between(
            [input.workspaceId, Dexie.minKey],
            [input.workspaceId, Dexie.maxKey],
            true,
            true
          )
          .toArray();
        const acl = aclChain.at(-1);
        if (snapshot === undefined)
          throw new Error("Workspace snapshot is unavailable");
        if (target === undefined)
          throw new Error("Active source target is unavailable");
        if (target.serverProfileId === input.targetProfileId)
          throw new Error("Target server is already active");
        if (targetProfile === undefined)
          throw new Error("Target server profile is unavailable");
        if (acl === undefined) throw new Error("Source ACL is unavailable");
        if (
          outboxRows.some(
            ({ targetId, state }) =>
              targetId === target.id && state !== "acknowledged"
          )
        ) {
          throw new Error(
            "Unresolved source outbox must be synchronized or repaired first"
          );
        }
        if (
          inboxRows.some(
            ({ roomId, state }) =>
              roomId === target.roomId &&
              state !== "handled" &&
              state !== "quarantined"
          )
        ) {
          throw new Error(
            "Unresolved source inbox must be processed or quarantined first"
          );
        }
        return { snapshot, target, acl, aclChain };
      }
    );
  }

  private async persistPreparingTarget(
    input: MigrateWorkspaceServerInput,
    sourceTargetId: string,
    prepared: PreparedMatrixMigrationTarget
  ): Promise<void> {
    if (
      prepared.targetId === sourceTargetId ||
      prepared.roomId.trim().length === 0
    ) {
      throw new Error("Invalid migration target binding");
    }
    const timestamp = this.now();
    await this.database.syncTargets.put({
      id: prepared.targetId,
      workspaceId: input.workspaceId,
      serverProfileId: input.targetProfileId,
      roomId: prepared.roomId,
      mode: "preparing",
      state: "paused",
      createdAt:
        (await this.database.syncTargets.get(prepared.targetId))?.createdAt ??
        timestamp,
      updatedAt: timestamp,
    });
  }

  private async verifyPreparedTarget(
    input: MigrateWorkspaceServerInput,
    sourceHeads: readonly string[],
    targetMembers: Readonly<Record<string, WorkspaceRole>>,
    prepared: PreparedMatrixMigrationTarget
  ) {
    const targetAclCheckpoint = this.aclCodec.decode(
      prepared.targetAclBytes.slice()
    );
    const targetAcl = await new AclChainValidator(this.aclCodec).accept(
      targetAclCheckpoint
    );
    if (
      targetAcl.hash !== prepared.targetAclHash ||
      targetAcl.checkpoint.workspaceId !== input.workspaceId ||
      !equalMembers(targetAcl.checkpoint.members, targetMembers) ||
      targetAcl.checkpoint.revokedUsers.length > 0 ||
      targetAcl.checkpoint.revokedDevices.length > 0 ||
      !equal(targetAcl.checkpoint.acceptedHeads, sourceHeads)
    ) {
      throw new Error("Target ACL read-back mismatch");
    }
    const checkpoint = await this.checkpointCodec.decodeAndVerify(
      prepared.checkpoint,
      this.actorId
    );
    if (
      checkpoint.workspaceId !== input.workspaceId ||
      checkpoint.authEpoch !== 1 ||
      prepared.checkpointEventIds.length === 0 ||
      !equal(checkpoint.heads, sourceHeads) ||
      !equal(prepared.freshHeads, sourceHeads)
    ) {
      throw new Error("Target heads do not match source heads");
    }
    return targetAcl;
  }

  private async commitSwitch(input: {
    readonly input: MigrateWorkspaceServerInput;
    readonly source: Awaited<
      ReturnType<MatrixServerMigrationCoordinator["loadSource"]>
    >;
    readonly prepared: PreparedMatrixMigrationTarget;
    readonly targetAcl: Awaited<
      ReturnType<MatrixServerMigrationCoordinator["verifyPreparedTarget"]>
    >;
    readonly certificate: HashedServerMigrationCertificate;
    readonly receipt: MatrixMigrationCertificateReceipt;
  }): Promise<void> {
    const timestamp = this.now();
    await this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.syncTargets,
        this.database.syncOutbox,
        this.database.syncInbox,
        this.database.aclCheckpoints,
        this.database.verifiedCheckpoints,
        this.database.migrationCertificates,
        this.database.serverProfiles,
      ],
      async () => {
        const [
          snapshot,
          sourceTarget,
          targetTarget,
          acl,
          outboxRows,
          inboxRows,
          sourceProfile,
          targetProfile,
        ] = await Promise.all([
          this.database.workspaceSnapshots.get(input.input.workspaceId),
          this.database.syncTargets.get(input.source.target.id),
          this.database.syncTargets.get(input.prepared.targetId),
          this.latestAcl(input.input.workspaceId),
          this.database.syncOutbox
            .filter(
              ({ workspaceId }) => workspaceId === input.input.workspaceId
            )
            .toArray(),
          this.database.syncInbox.toArray(),
          this.database.serverProfiles.get(input.source.target.serverProfileId),
          this.database.serverProfiles.get(input.input.targetProfileId),
        ]);
        const unresolvedOutbox = outboxRows.some(
          ({ targetId, state }) =>
            targetId === input.source.target.id && state !== "acknowledged"
        );
        const unresolvedInbox = inboxRows.some(
          ({ roomId, state }) =>
            roomId === input.source.target.roomId &&
            state !== "handled" &&
            state !== "quarantined"
        );
        if (
          snapshot === undefined ||
          !equal(snapshot.heads, input.source.snapshot.heads) ||
          sourceTarget?.mode !== "active" ||
          sourceTarget.state !== "active" ||
          targetTarget?.mode !== "preparing" ||
          targetTarget.state !== "paused" ||
          sourceProfile === undefined ||
          targetProfile === undefined ||
          acl?.hash !== input.source.acl.hash ||
          unresolvedOutbox ||
          unresolvedInbox
        ) {
          throw new Error("Migration source changed before target activation");
        }
        await this.database.aclCheckpoints
          .where("workspaceId")
          .equals(input.input.workspaceId)
          .delete();
        await this.database.aclCheckpoints.put({
          workspaceId: input.input.workspaceId,
          authEpoch: 1,
          hash: input.targetAcl.hash,
          previousHash: null,
          bytes: input.targetAcl.bytes.slice(),
          createdAt: timestamp,
        });
        await this.database.verifiedCheckpoints.put({
          hash: input.prepared.checkpoint.hash,
          workspaceId: input.input.workspaceId,
          schemaVersion: 1,
          authEpoch: 1,
          heads: [...input.prepared.checkpoint.heads],
          coveredChangeHashes: [
            ...input.prepared.checkpoint.coveredChangeHashes,
          ],
          compressedSnapshot:
            input.prepared.checkpoint.compressedSnapshot.slice(),
          matrixEventIds: [...input.prepared.checkpointEventIds],
          verifiedAt: timestamp,
        });
        await this.database.migrationCertificates.put({
          hash: input.certificate.hash,
          workspaceId: input.input.workspaceId,
          sourceTargetId: input.source.target.id,
          targetTargetId: input.prepared.targetId,
          sourceAclHash: input.source.acl.hash,
          targetAclHash: input.targetAcl.hash,
          heads: [...input.source.snapshot.heads].sort(),
          bytes: input.certificate.bytes.slice(),
          sourceEventId: input.receipt.sourceEventId,
          targetEventId: input.receipt.targetEventId,
          sourceAclChain: input.source.aclChain.map((checkpoint) => ({
            authEpoch: checkpoint.authEpoch,
            hash: checkpoint.hash,
            previousHash: checkpoint.previousHash,
            bytes: checkpoint.bytes.slice(),
            createdAt: checkpoint.createdAt,
          })),
          verifiedAt: timestamp,
        });
        await this.database.serverProfiles.update(sourceProfile.id, {
          sessionUserId: undefined,
          sessionDeviceId: undefined,
          sessionUpdatedAt: undefined,
        });
        const promoted = await this.database.serverProfiles.update(
          targetProfile.id,
          {
            sessionUserId: input.prepared.targetSession.userId,
            sessionDeviceId: input.prepared.targetSession.deviceId,
            sessionUpdatedAt: timestamp,
          }
        );
        if (promoted !== 1) {
          throw new Error("Target Matrix session promotion failed");
        }
        await this.database.syncTargets.update(input.source.target.id, {
          mode: "read-only",
          state: "active",
          updatedAt: timestamp,
        });
        await this.database.syncTargets.update(input.prepared.targetId, {
          mode: "active",
          state: "active",
          updatedAt: timestamp,
        });
      }
    );
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
}
