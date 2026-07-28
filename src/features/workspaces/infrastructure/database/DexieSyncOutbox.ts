import Dexie from "dexie";

import type {
  ClaimedOutboxItem,
  OutboxFragment,
  SyncOutbox,
} from "../../application/ports/SyncOutbox";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

export class DexieSyncOutbox implements SyncOutbox {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly now: () => number = () => Date.now()
  ) {}

  async claimNext(now: number): Promise<ClaimedOutboxItem | null> {
    return this.database.transaction(
      "rw",
      [
        this.database.syncOutbox,
        this.database.workspaceChanges,
        this.database.checkpointPublications,
        this.database.verifiedCheckpoints,
        this.database.payloadFragments,
        this.database.syncTargets,
        this.database.aclCheckpoints,
      ],
      async () => {
        const candidates = await this.database.syncOutbox
          .where("[state+nextAttemptAt]")
          .between(["pending", Dexie.minKey], ["pending", now], true, true)
          .toArray();
        const interrupted = await this.database.syncOutbox
          .where("[state+nextAttemptAt]")
          .between(["sending", Dexie.minKey], ["sending", now], true, true)
          .toArray();
        const row = [...candidates, ...interrupted].sort((left, right) =>
          left.nextAttemptAt === right.nextAttemptAt
            ? left.id.localeCompare(right.id)
            : left.nextAttemptAt - right.nextAttemptAt
        )[0];
        if (row === undefined) return null;
        if (row.innerType === "dev.lift.acl.v1") {
          await this.database.syncOutbox.update(row.id, {
            state: "paused-permanent-error",
            lastError: "unsupported-outbox-inner-type",
          });
          return null;
        }
        const [change, publication, target, acl] = await Promise.all([
          this.database.workspaceChanges.get([row.workspaceId, row.changeHash]),
          this.database.checkpointPublications.get(row.id),
          this.database.syncTargets.get(row.targetId),
          this.database.aclCheckpoints
            .where("[workspaceId+authEpoch]")
            .between(
              [row.workspaceId, Dexie.minKey],
              [row.workspaceId, Dexie.maxKey],
              true,
              true
            )
            .last(),
        ]);
        const payload =
          row.innerType === "dev.lift.checkpoint.v1" ? publication : change;
        if (
          payload === undefined ||
          target?.mode !== "active" ||
          target.state !== "active" ||
          acl === undefined
        ) {
          await this.database.syncOutbox.update(row.id, {
            state: "paused-permanent-error",
            lastError: "control-plane-unavailable",
          });
          return null;
        }
        if (
          row.innerType === "dev.lift.checkpoint.v1" &&
          publication?.authEpoch !== acl.authEpoch
        ) {
          await this.database.syncOutbox.update(row.id, {
            state: "paused-auth",
            lastError: "checkpoint-acl-epoch-changed",
          });
          await this.database.checkpointPublications.delete(row.id);
          await this.database.payloadFragments
            .where("[direction+transferId]")
            .equals(["outbound", row.changeHash])
            .delete();
          return null;
        }
        await this.database.syncOutbox.update(row.id, {
          state: "sending",
          authEpoch: acl.authEpoch,
          lastError: null,
        });
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          targetId: row.targetId,
          roomId: target.roomId,
          innerType:
            row.innerType === "dev.lift.checkpoint.v1"
              ? "dev.lift.checkpoint.v1"
              : "dev.lift.crdt.change.v1",
          changeHash: row.changeHash,
          dependencies:
            row.innerType === "dev.lift.crdt.change.v1"
              ? [...change!.dependencies]
              : [],
          heads:
            row.innerType === "dev.lift.checkpoint.v1"
              ? [...publication!.heads]
              : [],
          coveredChangeHashes:
            row.innerType === "dev.lift.checkpoint.v1"
              ? [...publication!.coveredChangeHashes]
              : [],
          bytes:
            row.innerType === "dev.lift.checkpoint.v1"
              ? publication!.compressedSnapshot.slice()
              : change!.bytes.slice(),
          authEpoch: acl.authEpoch,
          attemptCount: row.attemptCount,
          nextFragmentIndex: row.nextFragmentIndex,
        };
      }
    );
  }

  async persistFragments(
    item: ClaimedOutboxItem,
    fragments: readonly OutboxFragment[]
  ): Promise<void> {
    if (fragments.length === 0) return;
    await this.database.payloadFragments.bulkPut(
      fragments.map((fragment) => ({
        direction: "outbound" as const,
        transferId: item.changeHash,
        index: fragment.index,
        count: fragment.count,
        workspaceId: item.workspaceId,
        changeHash: item.changeHash,
        fragmentHash: fragment.fragmentHash,
        bytes: fragment.bytes.slice(),
        matrixEventId: null,
      }))
    );
  }

  async isCurrent(item: ClaimedOutboxItem): Promise<boolean> {
    return this.database.transaction(
      "rw",
      [
        this.database.syncOutbox,
        this.database.checkpointPublications,
        this.database.payloadFragments,
        this.database.syncTargets,
        this.database.aclCheckpoints,
      ],
      async () => {
        const row = await this.database.syncOutbox.get(item.id);
        if (row === undefined) return false;
        return this.validateClaim(row, item.authEpoch);
      }
    );
  }

  async markFragmentSent(
    itemId: string,
    eventId: string,
    nextFragmentIndex: number,
    complete: boolean
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.syncOutbox,
        this.database.checkpointPublications,
        this.database.verifiedCheckpoints,
        this.database.payloadFragments,
        this.database.syncTargets,
        this.database.aclCheckpoints,
      ],
      async () => {
        const row = await this.database.syncOutbox.get(itemId);
        if (row === undefined) throw new Error("Outbox item is missing");
        if (!(await this.validateClaim(row, row.authEpoch))) return;
        const eventIds = row.matrixEventIds.includes(eventId)
          ? row.matrixEventIds
          : [...row.matrixEventIds, eventId];
        await this.database.syncOutbox.update(itemId, {
          matrixEventIds: eventIds,
          nextFragmentIndex,
          state: complete ? "acknowledged" : "sending",
          lastError: null,
        });
        if (complete && row.innerType === "dev.lift.checkpoint.v1") {
          const publication =
            await this.database.checkpointPublications.get(itemId);
          if (publication === undefined) {
            throw new Error("Checkpoint publication payload is missing");
          }
          await this.database.verifiedCheckpoints.put({
            hash: publication.hash,
            workspaceId: publication.workspaceId,
            schemaVersion: 1,
            authEpoch: publication.authEpoch,
            heads: [...publication.heads],
            coveredChangeHashes: [...publication.coveredChangeHashes],
            compressedSnapshot: publication.compressedSnapshot.slice(),
            matrixEventIds: eventIds,
            verifiedAt: this.now(),
          });
          await this.database.checkpointPublications.delete(itemId);
          await this.database.payloadFragments
            .where("[direction+transferId]")
            .equals(["outbound", publication.hash])
            .delete();
        }
      }
    );
  }

  private async validateClaim(
    row: {
      readonly id: string;
      readonly workspaceId: string;
      readonly targetId: string;
      readonly changeHash: string;
      readonly innerType: string;
      readonly authEpoch: number;
    },
    expectedAuthEpoch: number
  ): Promise<boolean> {
    const [target, acl, publication] = await Promise.all([
      this.database.syncTargets.get(row.targetId),
      this.database.aclCheckpoints
        .where("[workspaceId+authEpoch]")
        .between(
          [row.workspaceId, Dexie.minKey],
          [row.workspaceId, Dexie.maxKey],
          true,
          true
        )
        .last(),
      row.innerType === "dev.lift.checkpoint.v1"
        ? this.database.checkpointPublications.get(row.id)
        : Promise.resolve(undefined),
    ]);
    const targetIsCurrent =
      target?.workspaceId === row.workspaceId &&
      target.mode === "active" &&
      target.state === "active";
    const epochIsCurrent =
      acl?.authEpoch === expectedAuthEpoch &&
      row.authEpoch === expectedAuthEpoch;
    const publicationIsCurrent =
      row.innerType !== "dev.lift.checkpoint.v1" ||
      (publication?.authEpoch === expectedAuthEpoch &&
        publication.targetId === row.targetId);
    if (targetIsCurrent && epochIsCurrent && publicationIsCurrent) return true;

    const authorizationChanged = !epochIsCurrent || !publicationIsCurrent;
    const staleCheckpoint =
      row.innerType === "dev.lift.checkpoint.v1" && authorizationChanged;
    await this.database.syncOutbox.update(row.id, {
      state: authorizationChanged ? "paused-auth" : "paused-permanent-error",
      lastError: authorizationChanged
        ? staleCheckpoint
          ? "checkpoint-acl-epoch-changed"
          : "acl-epoch-changed"
        : "control-plane-unavailable",
    });
    if (staleCheckpoint) {
      await this.database.checkpointPublications.delete(row.id);
      await this.database.payloadFragments
        .where("[direction+transferId]")
        .equals(["outbound", row.changeHash])
        .delete();
    }
    return false;
  }

  async retry(
    itemId: string,
    attemptCount: number,
    nextAttemptAt: number
  ): Promise<void> {
    await this.database.syncOutbox.update(itemId, {
      state: "pending",
      attemptCount,
      nextAttemptAt,
      lastError: "transient-transport-error",
    });
  }

  async pause(itemId: string, reason: "auth" | "permanent"): Promise<void> {
    await this.database.syncOutbox.update(itemId, {
      state: reason === "auth" ? "paused-auth" : "paused-permanent-error",
      lastError:
        reason === "auth" ? "authentication-required" : "permanent-error",
    });
  }
}
