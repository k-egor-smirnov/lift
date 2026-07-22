import { DomainEventType } from "../types";

/**
 * Base class for all domain events
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType: DomainEventType;

  constructor(eventType: DomainEventType) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
    this.eventType = eventType;
  }

  /**
   * Legacy persistence and projections use this name for the event timestamp.
   * Keep it as an alias so every event has one canonical creation time.
   */
  get createdAt(): Date {
    return this.occurredAt;
  }

  /**
   * Events associated with an aggregate expose its task identifier in their
   * serialized data. Events without one remain safely partitioned as unknown.
   */
  get aggregateId(): string {
    const taskId = this.getEventData().taskId;
    return typeof taskId === "string" ? taskId : "unknown";
  }

  /**
   * Get event data for serialization
   */
  abstract getEventData(): Record<string, any>;
}
