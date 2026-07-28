import Dexie from "dexie";

import type { WorkspaceWriteAuthorization } from "../../application/ports/WorkspaceWriteAuthorization";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type { SyncOutboxRecord } from "../database/records";
import type { EncodedCheckpointV1 } from "./CheckpointCodec";
import { CheckpointCodec } from "./CheckpointCodec";

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export class MatrixCheckpointPublisher {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly authorization: WorkspaceWriteAuthorization,
    private readonly signalOutbox: () => void | Promise<void>,
    private readonly codec = new CheckpointCodec(),
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (milliseconds: number) => Promise<void> = wait,
    private readonly acknowledgementTimeout = 60_000
  ) {}

  async publish(workspaceId: string): Promise<EncodedCheckpointV1> {
    await this.authorization.requireEdit(workspaceId);
    const source = await this.database.transaction(
      "r",
      [
        this.database.workspaceSnapshots,
        this.database.aclCheckpoints,
        this.database.syncTargets,
      ],
      async () => {
        const snapshot =
          await this.database.workspaceSnapshots.get(workspaceId);
        const acl = await this.latestAcl(workspaceId);
        const target = await this.activeTarget(workspaceId);
        if (snapshot === undefined)
          throw new Error("Workspace snapshot is unavailable");
        if (acl === undefined) throw new Error("Workspace ACL is unavailable");
        if (target === undefined)
          throw new Error("Active Matrix workspace target is unavailable");
        return {
          snapshot: new Uint8Array([...snapshot.bytes]),
          authEpoch: acl.authEpoch,
          targetId: target.id,
        };
      }
    );
    const checkpoint = await this.codec.create({
      workspaceId,
      authEpoch: source.authEpoch,
      snapshot: source.snapshot,
    });
    if (
      (await this.database.verifiedCheckpoints.get(checkpoint.hash)) !==
      undefined
    ) {
      return checkpoint;
    }

    await this.authorization.requireEdit(workspaceId);
    const timestamp = this.now();
    const publicationId = `${workspaceId}\0${source.targetId}\0checkpoint\0${checkpoint.hash}`;
    await this.database.transaction(
      "rw",
      [
        this.database.checkpointPublications,
        this.database.syncOutbox,
        this.database.aclCheckpoints,
        this.database.syncTargets,
      ],
      async () => {
        const acl = await this.latestAcl(workspaceId);
        const target = await this.activeTarget(workspaceId);
        if (
          acl?.authEpoch !== source.authEpoch ||
          target?.id !== source.targetId
        ) {
          throw new Error(
            "Checkpoint authorization changed during publication"
          );
        }
        await this.database.checkpointPublications.put({
          id: publicationId,
          hash: checkpoint.hash,
          workspaceId,
          targetId: source.targetId,
          schemaVersion: 1,
          authEpoch: checkpoint.authEpoch,
          heads: [...checkpoint.heads],
          coveredChangeHashes: [...checkpoint.coveredChangeHashes],
          compressedSnapshot: checkpoint.compressedSnapshot.slice(),
          createdAt: timestamp,
        });
        const existing = await this.database.syncOutbox.get(publicationId);
        if (existing === undefined) {
          const row: SyncOutboxRecord = {
            id: publicationId,
            workspaceId,
            targetId: source.targetId,
            changeHash: checkpoint.hash,
            innerType: "dev.lift.checkpoint.v1",
            authEpoch: checkpoint.authEpoch,
            state: "pending",
            attemptCount: 0,
            nextAttemptAt: timestamp,
            lastError: null,
            matrixTxnId: publicationId,
            matrixEventIds: [],
            nextFragmentIndex: 0,
          };
          await this.database.syncOutbox.add(row);
        }
      }
    );
    try {
      await this.signalOutbox();
    } catch {
      // The durable row is committed; startup/reconnect will resume it.
    }
    await this.waitForAcknowledgement(publicationId, checkpoint.hash);
    await this.pruneOldRecords(workspaceId);
    return checkpoint;
  }

  private async waitForAcknowledgement(
    publicationId: string,
    checkpointHash: string
  ): Promise<void> {
    const deadline = this.now() + this.acknowledgementTimeout;
    while (this.now() <= deadline) {
      if (
        (await this.database.verifiedCheckpoints.get(checkpointHash)) !==
        undefined
      ) {
        return;
      }
      const row = await this.database.syncOutbox.get(publicationId);
      if (
        row?.state === "paused-auth" ||
        row?.state === "paused-permanent-error"
      ) {
        throw new Error(row.lastError ?? "Checkpoint publication is paused");
      }
      await this.sleep(50);
    }
    throw new Error(
      "Checkpoint publication is queued and will resume in background"
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

  private activeTarget(workspaceId: string) {
    return this.database.syncTargets
      .where("workspaceId")
      .equals(workspaceId)
      .filter(({ mode, state }) => mode === "active" && state === "active")
      .first();
  }

  private async pruneOldRecords(workspaceId: string): Promise<void> {
    const records = await this.database.verifiedCheckpoints
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    const obsolete = records
      .sort(
        (left, right) =>
          right.authEpoch - left.authEpoch ||
          right.verifiedAt - left.verifiedAt ||
          right.hash.localeCompare(left.hash)
      )
      .slice(2);
    await this.database.verifiedCheckpoints.bulkDelete(
      obsolete.map(({ hash }) => hash)
    );
  }
}
