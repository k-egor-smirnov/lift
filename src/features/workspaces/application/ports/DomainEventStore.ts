export interface DurableDomainEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateSequence: number;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: number;
  readonly attemptCount: number;
}

export interface DomainEventRetryDecision {
  readonly now: number;
  readonly nextAttemptAt: number;
  readonly maximumAttempts: number;
  readonly errorCode: string;
}

export interface DomainEventStore {
  claimNext(
    now: number,
    leaseDurationMs: number
  ): Promise<DurableDomainEvent | null>;
  hasHandled(eventId: string, handlerId: string): Promise<boolean>;
  markHandled(
    eventId: string,
    handlerId: string,
    handledAt: number
  ): Promise<void>;
  markDone(eventId: string): Promise<void>;
  retryOrDeadLetter(
    eventId: string,
    decision: DomainEventRetryDecision
  ): Promise<"pending" | "dead">;
  deadLetterCount(): Promise<number>;
}
