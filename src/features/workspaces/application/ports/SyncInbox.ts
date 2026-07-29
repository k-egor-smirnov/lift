export interface InboxWireRecord {
  readonly eventId: string;
  readonly roomId: string;
  readonly wireEvent: string;
}

export interface ClaimedInboxItem extends InboxWireRecord {
  readonly workspaceId: string | null;
}

export interface SyncInbox {
  persist(record: InboxWireRecord, receivedAt: number): Promise<void>;
  claimNext(): Promise<ClaimedInboxItem | null>;
  waitForKeys(eventId: string): Promise<void>;
  retryWaitingForKeys(): Promise<number>;
  retry(eventId: string, reason?: string): Promise<void>;
  quarantine(eventId: string, reason: string): Promise<void>;
}
