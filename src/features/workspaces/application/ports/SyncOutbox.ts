export interface ClaimedOutboxItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly targetId: string;
  readonly roomId: string;
  readonly changeHash: string;
  readonly dependencies: readonly string[];
  readonly bytes: Uint8Array;
  readonly authEpoch: number;
  readonly attemptCount: number;
  readonly nextFragmentIndex: number;
}

export interface OutboxFragment {
  readonly index: number;
  readonly count: number;
  readonly fragmentHash: string;
  readonly bytes: Uint8Array;
}

export interface SyncOutbox {
  claimNext(now: number): Promise<ClaimedOutboxItem | null>;
  persistFragments(
    item: ClaimedOutboxItem,
    fragments: readonly OutboxFragment[]
  ): Promise<void>;
  markFragmentSent(
    itemId: string,
    eventId: string,
    nextFragmentIndex: number,
    complete: boolean
  ): Promise<void>;
  retry(
    itemId: string,
    attemptCount: number,
    nextAttemptAt: number
  ): Promise<void>;
  pause(itemId: string, reason: "auth" | "permanent"): Promise<void>;
}
