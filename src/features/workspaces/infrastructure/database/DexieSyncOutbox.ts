import Dexie from "dexie";

import type {
  ClaimedOutboxItem,
  OutboxFragment,
  SyncOutbox,
} from "../../application/ports/SyncOutbox";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

export class DexieSyncOutbox implements SyncOutbox {
  constructor(private readonly database: LiftSecureDatabase) {}

  async claimNext(now: number): Promise<ClaimedOutboxItem | null> {
    return this.database.transaction(
      "rw",
      this.database.syncOutbox,
      this.database.workspaceChanges,
      this.database.syncTargets,
      this.database.aclCheckpoints,
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
        const [change, target, acl] = await Promise.all([
          this.database.workspaceChanges.get([row.workspaceId, row.changeHash]),
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
        if (
          change === undefined ||
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
          changeHash: row.changeHash,
          dependencies: [...change.dependencies],
          bytes: change.bytes.slice(),
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

  async markFragmentSent(
    itemId: string,
    eventId: string,
    nextFragmentIndex: number,
    complete: boolean
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.syncOutbox,
      async () => {
        const row = await this.database.syncOutbox.get(itemId);
        if (row === undefined) throw new Error("Outbox item is missing");
        const eventIds = row.matrixEventIds.includes(eventId)
          ? row.matrixEventIds
          : [...row.matrixEventIds, eventId];
        await this.database.syncOutbox.update(itemId, {
          matrixEventIds: eventIds,
          nextFragmentIndex,
          state: complete ? "acknowledged" : "sending",
          lastError: null,
        });
      }
    );
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
