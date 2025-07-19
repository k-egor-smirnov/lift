import { DomainEventType } from '../types';

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
   * Get event data for serialization
   */
  abstract getEventData(): Record<string, any>;
}