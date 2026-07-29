import type {
  ClaimedInboxItem,
  InboxWireRecord,
  SyncInbox,
} from "../../application/ports/SyncInbox";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

export class DexieSyncInbox implements SyncInbox {
  constructor(private readonly database: LiftSecureDatabase) {}

  async persist(record: InboxWireRecord, receivedAt: number): Promise<void> {
    await this.database.transaction("rw", this.database.syncInbox, async () => {
      const existing = await this.database.syncInbox.get(record.eventId);
      if (existing !== undefined) return;
      await this.database.syncInbox.add({
        eventId: record.eventId,
        workspaceId: null,
        roomId: record.roomId,
        wireEvent: record.wireEvent,
        state: "received",
        receivedAt,
        lastError: null,
      });
    });
  }

  async claimNext(): Promise<ClaimedInboxItem | null> {
    return this.database.transaction(
      "rw",
      this.database.syncInbox,
      async () => {
        const received = await this.database.syncInbox
          .where("[state+receivedAt]")
          .between(["received", 0], ["received", Number.MAX_SAFE_INTEGER])
          .toArray();
        const interrupted = await this.database.syncInbox
          .where("[state+receivedAt]")
          .between(["ready", 0], ["ready", Number.MAX_SAFE_INTEGER])
          .toArray();
        const row = [...received, ...interrupted].sort(
          (left, right) => left.receivedAt - right.receivedAt
        )[0];
        if (row === undefined) return null;
        await this.database.syncInbox.update(row.eventId, { state: "ready" });
        return {
          eventId: row.eventId,
          workspaceId: row.workspaceId,
          roomId: row.roomId,
          wireEvent: row.wireEvent,
        };
      }
    );
  }

  async waitForKeys(eventId: string): Promise<void> {
    await this.database.syncInbox.update(eventId, {
      state: "waiting-keys",
      lastError: "missing-room-key",
    });
  }

  async retryWaitingForKeys(): Promise<number> {
    return this.database.transaction(
      "rw",
      this.database.syncInbox,
      async () => {
        const rows = await this.database.syncInbox
          .where("state")
          .equals("waiting-keys")
          .toArray();
        if (rows.length === 0) return 0;
        await this.database.syncInbox.bulkUpdate(
          rows.map(({ eventId }) => ({
            key: eventId,
            changes: { state: "received", lastError: "retrying-room-key" },
          }))
        );
        return rows.length;
      }
    );
  }

  async retry(
    eventId: string,
    reason = "interrupted-processing"
  ): Promise<void> {
    await this.database.syncInbox.update(eventId, {
      state: "received",
      lastError: reason,
    });
  }

  async quarantine(eventId: string, reason: string): Promise<void> {
    await this.database.syncInbox.update(eventId, {
      state: "quarantined",
      lastError: reason,
    });
  }
}
