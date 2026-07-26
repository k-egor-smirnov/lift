import Dexie from "dexie";

import type {
  DomainEventRetryDecision,
  DomainEventStore,
  DurableDomainEvent,
} from "../../application/ports/DomainEventStore";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";
import type { DomainEventRecord } from "./records";

const toEvent = (record: DomainEventRecord): DurableDomainEvent => {
  const payload: unknown = JSON.parse(record.payload);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new Error("Invalid persisted domain-event payload");
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    aggregateId: record.aggregateId,
    aggregateType: record.aggregateType,
    aggregateSequence: record.aggregateSequence,
    eventType: record.eventType,
    payload: payload as Readonly<Record<string, unknown>>,
    occurredAt: record.occurredAt,
    attemptCount: record.attemptCount,
  };
};

export class DexieDomainEventStore implements DomainEventStore {
  constructor(private readonly database: LiftSecureDatabase) {}

  async claimNext(
    now: number,
    leaseDurationMs: number
  ): Promise<DurableDomainEvent | null> {
    return this.database.transaction(
      "rw",
      this.database.domainEvents,
      async () => {
        const expired = await this.database.domainEvents
          .filter(
            (row) =>
              row.status === "processing" &&
              row.leaseUntil !== null &&
              row.leaseUntil <= now
          )
          .toArray();
        await this.database.domainEvents.bulkUpdate(
          expired.map(({ id }) => ({
            key: id,
            changes: {
              status: "pending" as const,
              leaseUntil: null,
              nextAttemptAt: now,
            },
          }))
        );

        const candidates = (
          await this.database.domainEvents
            .where("[status+nextAttemptAt]")
            .between(["pending", Dexie.minKey], ["pending", now], true, true)
            .toArray()
        ).sort(
          (left, right) =>
            left.nextAttemptAt - right.nextAttemptAt ||
            left.occurredAt - right.occurredAt ||
            left.id.localeCompare(right.id)
        );
        for (const candidate of candidates) {
          const earlier = await this.database.domainEvents
            .where("[aggregateId+aggregateSequence]")
            .between(
              [candidate.aggregateId, Dexie.minKey],
              [candidate.aggregateId, candidate.aggregateSequence],
              true,
              false
            )
            .filter(
              ({ status }) => status === "pending" || status === "processing"
            )
            .first();
          if (earlier !== undefined) continue;
          await this.database.domainEvents.update(candidate.id, {
            status: "processing",
            leaseUntil: now + leaseDurationMs,
            lastError: null,
          });
          return toEvent(candidate);
        }
        return null;
      }
    );
  }

  async hasHandled(eventId: string, handlerId: string): Promise<boolean> {
    return (
      (await this.database.handledDomainEvents.get([eventId, handlerId])) !==
      undefined
    );
  }

  async markHandled(
    eventId: string,
    handlerId: string,
    handledAt: number
  ): Promise<void> {
    await this.database.handledDomainEvents.put({
      eventId,
      handlerId,
      handledAt,
    });
  }

  async markDone(eventId: string): Promise<void> {
    await this.database.domainEvents.update(eventId, {
      status: "done",
      leaseUntil: null,
      lastError: null,
    });
  }

  async retryOrDeadLetter(
    eventId: string,
    decision: DomainEventRetryDecision
  ): Promise<"pending" | "dead"> {
    return this.database.transaction(
      "rw",
      this.database.domainEvents,
      async () => {
        const row = await this.database.domainEvents.get(eventId);
        if (row === undefined) throw new Error("Domain event is missing");
        const attemptCount = row.attemptCount + 1;
        const status =
          attemptCount >= decision.maximumAttempts ? "dead" : "pending";
        await this.database.domainEvents.update(eventId, {
          status,
          attemptCount,
          nextAttemptAt:
            status === "dead" ? decision.now : decision.nextAttemptAt,
          leaseUntil: null,
          lastError: decision.errorCode,
        });
        return status;
      }
    );
  }

  deadLetterCount(): Promise<number> {
    return this.database.domainEvents
      .filter(({ status }) => status === "dead")
      .count();
  }
}
