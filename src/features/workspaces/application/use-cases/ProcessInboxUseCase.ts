import type { ClaimedInboxItem, SyncInbox } from "../ports/SyncInbox";

export interface TrustedInboxProcessor {
  process(item: ClaimedInboxItem): Promise<void>;
}

export class ProcessInboxUseCase {
  constructor(
    private readonly inbox: SyncInbox,
    private readonly processor: TrustedInboxProcessor
  ) {}

  async runOnce(): Promise<boolean> {
    const item = await this.inbox.claimNext();
    if (item === null) return false;
    try {
      await this.processor.process(item);
    } catch (error) {
      if (error instanceof WaitingForMatrixKeysError) {
        await this.inbox.waitForKeys(item.eventId);
      } else if (error instanceof RejectedInboxEventError) {
        await this.inbox.quarantine(item.eventId, error.code);
      } else {
        await this.inbox.retry(
          item.eventId,
          error instanceof RetryableInboxProcessingError
            ? error.code
            : "interrupted-processing"
        );
        throw error;
      }
    }
    return true;
  }
}

export class WaitingForMatrixKeysError extends Error {
  constructor() {
    super("Waiting for Matrix decryption keys");
    this.name = "WaitingForMatrixKeysError";
  }
}

export class RejectedInboxEventError extends Error {
  constructor(readonly code = "rejected-encrypted-event") {
    super("Rejected encrypted inbox event");
    this.name = "RejectedInboxEventError";
  }
}

export class RetryableInboxProcessingError extends Error {
  constructor(readonly code: string) {
    super("Retryable inbox processing failure");
    this.name = "RetryableInboxProcessingError";
  }
}
