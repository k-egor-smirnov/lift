import { DomainEvent } from './DomainEvent';
import { DomainEventType } from '../types';

/**
 * Event handler function type
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Event subscription interface
 */
export interface EventSubscription {
  unsubscribe(): void;
}

/**
 * EventBus interface for publishing and subscribing to domain events
 */
export interface EventBus {
  /**
   * Publish a single domain event
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple domain events
   */
  publishAll(events: DomainEvent[]): Promise<void>;

  /**
   * Subscribe to a specific event type
   */
  subscribe<T extends DomainEvent>(
    eventType: DomainEventType,
    handler: EventHandler<T>
  ): EventSubscription;

  /**
   * Subscribe to all events
   */
  subscribeToAll(handler: EventHandler): EventSubscription;

  /**
   * Clear all subscriptions (useful for testing)
   */
  clear(): void;
}

/**
 * In-memory implementation of EventBus
 */
export class InMemoryEventBus implements EventBus {
  private handlers = new Map<DomainEventType, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  async publish(event: DomainEvent): Promise<void> {
    await this.publishAll([event]);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const event of events) {
      // Execute specific event type handlers
      const typeHandlers = this.handlers.get(event.eventType);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          promises.push(this.executeHandler(handler, event));
        }
      }

      // Execute global handlers
      for (const handler of this.globalHandlers) {
        promises.push(this.executeHandler(handler, event));
      }
    }

    await Promise.all(promises);
  }

  subscribe<T extends DomainEvent>(
    eventType: DomainEventType,
    handler: EventHandler<T>
  ): EventSubscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    const handlers = this.handlers.get(eventType)!;
    handlers.add(handler as EventHandler);

    return {
      unsubscribe: () => {
        handlers.delete(handler as EventHandler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  subscribeToAll(handler: EventHandler): EventSubscription {
    this.globalHandlers.add(handler);

    return {
      unsubscribe: () => {
        this.globalHandlers.delete(handler);
      }
    };
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }

  private async executeHandler(handler: EventHandler, event: DomainEvent): Promise<void> {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      // Log error but don't throw to prevent one handler from breaking others
      console.error('Error executing event handler:', error);
    }
  }

  /**
   * Get the number of handlers for a specific event type (for testing)
   */
  getHandlerCount(eventType: DomainEventType): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }

  /**
   * Get the number of global handlers (for testing)
   */
  getGlobalHandlerCount(): number {
    return this.globalHandlers.size;
  }
}