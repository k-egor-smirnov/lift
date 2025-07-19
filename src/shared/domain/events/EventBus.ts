import { injectable, inject } from 'tsyringe';
import { DomainEvent } from './DomainEvent';
import { DomainEventType } from '../types';
import { ulid } from 'ulid';
import Dexie from 'dexie';
import { TodoDatabase, EventStoreRecord, HandledEventRecord, LockRecord } from '../../infrastructure/database/TodoDatabase';
import * as tokens from '../../infrastructure/di/tokens';

/**
 * Event handler function type
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Persistent event handler interface with unique ID for idempotency tracking
 */
export interface PersistentEventHandler {
  /**
   * Unique identifier for this handler (used for idempotency tracking)
   */
  readonly id: string;

  /**
   * Handle the event (must be idempotent)
   */
  handle(event: DomainEvent): Promise<void>;
}

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
 * Persistent EventBus interface with delivery guarantees
 */
export interface PersistentEventBus extends EventBus {
  /**
   * Subscribe a persistent handler to a specific event type
   */
  subscribePersistent(
    eventType: DomainEventType,
    handler: PersistentEventHandler
  ): EventSubscription;

  /**
   * Subscribe a persistent handler to all events
   */
  subscribePersistentToAll(handler: PersistentEventHandler): EventSubscription;

  /**
   * Start the event processing loop
   */
  startProcessingLoop(): void;

  /**
   * Stop the event processing loop
   */
  stopProcessingLoop(): void;

  /**
   * Get processing statistics (for monitoring)
   */
  getProcessingStats(): Promise<EventProcessingStats>;
}

/**
 * Event processing statistics
 */
export interface EventProcessingStats {
  totalEvents: number;
  pendingEvents: number;
  processingEvents: number;
  doneEvents: number;
  deadLetterEvents: number;
  averageProcessingTime: number;
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

/**
 * Persistent EventBus implementation with at-least-once delivery guarantees
 */
@injectable()
export class PersistentEventBusImpl implements PersistentEventBus {
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_BASE_DELAY = 1000; // ms
  private readonly PROCESSING_BATCH_SIZE = 10;
  private readonly LOCK_TIMEOUT = 30000; // 30 seconds
  private readonly PROCESSING_INTERVAL = 1000; // 1 second

  private handlers = new Map<DomainEventType, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();
  private persistentHandlers = new Map<DomainEventType, Set<PersistentEventHandler>>();
  private globalPersistentHandlers = new Set<PersistentEventHandler>();
  
  private processingLoopId?: number;
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(@inject(tokens.DATABASE_TOKEN) private database: TodoDatabase) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.publishAll([event]);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Store events in database within current transaction or create new one
    const eventRecords: EventStoreRecord[] = events.map(event => ({
      id: ulid(),
      aggregateId: this.extractAggregateId(event),
      aggregateType: this.extractAggregateType(event),
      eventType: event.eventType,
      eventData: JSON.stringify({
        ...event.getEventData(),
        eventId: event.eventId,
        occurredAt: event.occurredAt.toISOString()
      }),
      createdAt: Date.now(),
      status: 'pending' as const,
      attemptCount: 0
    }));

    // Execute in-memory handlers immediately (for backward compatibility)
    await this.executeInMemoryHandlers(events);

    // Store events for persistent processing
    if (Dexie.currentTransaction) {
      // We're in a transaction, add to event store
      await this.database.eventStore.bulkAdd(eventRecords);
      
      // Schedule processing after transaction commits
      Dexie.currentTransaction.on('complete', () => {
        queueMicrotask(() => this.processNextBatch().catch(error => {
          console.error('Error in event processing after transaction:', error);
        }));
      });
    } else {
      // No current transaction, create one
      await this.database.transaction('rw', [this.database.eventStore], async () => {
        await this.database.eventStore.bulkAdd(eventRecords);
      });
      
      // Process immediately
      queueMicrotask(() => this.processNextBatch().catch(error => {
        console.error('Error in event processing:', error);
      }));
    }
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

  subscribePersistent(
    eventType: DomainEventType,
    handler: PersistentEventHandler
  ): EventSubscription {
    if (!this.persistentHandlers.has(eventType)) {
      this.persistentHandlers.set(eventType, new Set());
    }

    const handlers = this.persistentHandlers.get(eventType)!;
    handlers.add(handler);

    return {
      unsubscribe: () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.persistentHandlers.delete(eventType);
        }
      }
    };
  }

  subscribePersistentToAll(handler: PersistentEventHandler): EventSubscription {
    this.globalPersistentHandlers.add(handler);

    return {
      unsubscribe: () => {
        this.globalPersistentHandlers.delete(handler);
      }
    };
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
    this.persistentHandlers.clear();
    this.globalPersistentHandlers.clear();
    this.isShuttingDown = false; // Reset shutdown flag for testing
  }

  startProcessingLoop(): void {
    if (this.processingLoopId) {
      return; // Already started
    }

    this.processingLoopId = window.setInterval(() => {
      if (!this.isProcessing) {
        this.processNextBatch().catch(error => {
          console.error('Error in event processing loop:', error);
        });
      }
    }, this.PROCESSING_INTERVAL);

    console.log('Event processing loop started');
  }

  stopProcessingLoop(): void {
    this.isShuttingDown = true;
    if (this.processingLoopId) {
      clearInterval(this.processingLoopId);
      this.processingLoopId = undefined;
      console.log('Event processing loop stopped');
    }
  }

  async getProcessingStats(): Promise<EventProcessingStats> {
    const [total, pending, processing, done, deadLetter] = await Promise.all([
      this.database.eventStore.count(),
      this.database.eventStore.where('status').equals('pending').count(),
      this.database.eventStore.where('status').equals('processing').count(),
      this.database.eventStore.where('status').equals('done').count(),
      this.database.eventStore.where('status').equals('dead').count()
    ]);

    return {
      totalEvents: total,
      pendingEvents: pending,
      processingEvents: processing,
      doneEvents: done,
      deadLetterEvents: deadLetter,
      averageProcessingTime: 0 // TODO: implement timing with processing duration tracking
    };
  }

  private async executeInMemoryHandlers(events: DomainEvent[]): Promise<void> {
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

  private async processNextBatch(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return; // Already processing or shutting down
    }

    this.isProcessing = true;

    try {
      // Acquire global processing lock using Web Locks API with database fallback
      await this.withLock('event-processing', async () => {
        // Get pending events, grouped by aggregateId for ordered processing
        const pendingEvents = await this.database.eventStore
          .where('status')
          .equals('pending')
          .or('status').equals('processing')
          .and(record => !record.nextAttemptAt || record.nextAttemptAt <= Date.now())
          .limit(this.PROCESSING_BATCH_SIZE)
          .toArray();



        if (pendingEvents.length === 0) {
          return;
        }

        // Group by aggregateId to ensure ordered processing per aggregate
        const eventsByAggregate = new Map<string, EventStoreRecord[]>();
        for (const event of pendingEvents) {
          if (!eventsByAggregate.has(event.aggregateId)) {
            eventsByAggregate.set(event.aggregateId, []);
          }
          eventsByAggregate.get(event.aggregateId)!.push(event);
        }

        // Process each aggregate's events in order
        for (const [aggregateId, events] of eventsByAggregate) {
          await this.processAggregateEvents(aggregateId, events);
        }
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEventsDirectly(): Promise<void> {
    // Get pending events, grouped by aggregateId for ordered processing
    const pendingEvents = await this.database.eventStore
      .where('status')
      .equals('pending')
      .or('status').equals('processing')
      .and(record => !record.nextAttemptAt || record.nextAttemptAt <= Date.now())
      .limit(this.PROCESSING_BATCH_SIZE)
      .toArray();

    if (pendingEvents.length === 0) {
      return;
    }

    // Group by aggregateId to ensure ordered processing per aggregate
    const eventsByAggregate = new Map<string, EventStoreRecord[]>();
    for (const event of pendingEvents) {
      if (!eventsByAggregate.has(event.aggregateId)) {
        eventsByAggregate.set(event.aggregateId, []);
      }
      eventsByAggregate.get(event.aggregateId)!.push(event);
    }

    // Process each aggregate's events in order
    for (const [aggregateId, events] of eventsByAggregate) {
      await this.processAggregateEvents(aggregateId, events);
    }
  }

  private async processAggregateEvents(aggregateId: string, events: EventStoreRecord[]): Promise<void> {
    // Sort events by creation time to ensure proper ordering
    events.sort((a, b) => a.createdAt - b.createdAt);

    for (const eventRecord of events) {
      await this.processEvent(eventRecord);
    }
  }

  private async processEvent(eventRecord: EventStoreRecord): Promise<void> {
    try {
      // Mark as processing
      await this.database.eventStore.update(eventRecord.id, {
        status: 'processing' as const,
        attemptCount: eventRecord.attemptCount + 1
      });

      // Deserialize event
      const eventData = JSON.parse(eventRecord.eventData);
      const domainEvent = this.deserializeEvent(eventRecord, eventData);

      // Get all applicable handlers
      const handlers = this.getHandlersForEvent(domainEvent);

      // Execute each handler with idempotency check
      for (const handler of handlers) {
        await this.executeHandlerWithIdempotency(handler, domainEvent, eventRecord.id);
      }

      // Mark as done
      await this.database.eventStore.update(eventRecord.id, {
        status: 'done' as const,
        lastError: undefined
      });

    } catch (error) {
      await this.handleEventProcessingError(eventRecord, error as Error);
    }
  }

  private async executeHandlerWithIdempotency(
    handler: PersistentEventHandler,
    event: DomainEvent,
    eventId: string
  ): Promise<void> {
    // Check if already handled
    const alreadyHandled = await this.database.handledEvents
      .where(['eventId', 'handlerId'])
      .equals([eventId, handler.id])
      .first();

    if (alreadyHandled) {
      return; // Already processed
    }

    // Execute handler
    await handler.handle(event);

    // Record successful processing
    await this.database.handledEvents.add({
      eventId,
      handlerId: handler.id,
      processedAt: Date.now()
    });
  }

  private async handleEventProcessingError(eventRecord: EventStoreRecord, error: Error): Promise<void> {
    const newAttemptCount = eventRecord.attemptCount + 1;

    if (newAttemptCount >= this.MAX_RETRY_ATTEMPTS) {
      // Move to dead letter queue
      await this.database.eventStore.update(eventRecord.id, {
        status: 'dead' as const,
        lastError: error.message,
        nextAttemptAt: undefined
      });
    } else {
      // Schedule retry with exponential backoff + jitter
      const backoffDelay = this.calculateBackoffDelay(newAttemptCount);
      const nextAttemptAt = Date.now() + backoffDelay;

      await this.database.eventStore.update(eventRecord.id, {
        status: 'pending' as const,
        lastError: error.message,
        nextAttemptAt
      });
    }
  }

  private calculateBackoffDelay(attemptCount: number): number {
    // Exponential backoff with jitter: base * 2^attempt + random(0, 1000)
    const exponentialDelay = this.RETRY_BASE_DELAY * Math.pow(2, attemptCount - 1);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  }

  private getHandlersForEvent(event: DomainEvent): PersistentEventHandler[] {
    const handlers: PersistentEventHandler[] = [];

    // Get specific event type handlers
    const typeHandlers = this.persistentHandlers.get(event.eventType);
    if (typeHandlers) {
      handlers.push(...Array.from(typeHandlers));
    }

    // Get global handlers
    handlers.push(...Array.from(this.globalPersistentHandlers));

    return handlers;
  }

  private deserializeEvent(eventRecord: EventStoreRecord, eventData: any): DomainEvent {
    // Create a mock domain event for handler execution
    // In a real implementation, you'd have proper event deserialization
    return {
      eventId: eventData.eventId,
      occurredAt: new Date(eventData.occurredAt),
      eventType: eventRecord.eventType as DomainEventType,
      getEventData: () => eventData
    } as DomainEvent;
  }

  private extractAggregateId(event: DomainEvent): string {
    const eventData = event.getEventData();
    return eventData.taskId || eventData.aggregateId || 'unknown';
  }

  private extractAggregateType(event: DomainEvent): string {
    const eventData = event.getEventData();
    if (eventData.taskId) return 'task';
    return 'unknown';
  }

  private async withLock<T>(lockId: string, operation: () => Promise<T>): Promise<T> {
    // Try Web Locks API first (modern browsers)
    if ('locks' in navigator) {
      return await navigator.locks.request(lockId, { mode: 'exclusive' }, operation);
    }

    // Fallback to database-based locking
    return await this.withDatabaseLock(lockId, operation);
  }

  private async withDatabaseLock<T>(lockId: string, operation: () => Promise<T>): Promise<T> {
    const lockRecord: LockRecord = {
      id: lockId,
      expiresAt: Date.now() + this.LOCK_TIMEOUT
    };

    try {
      // Try to acquire lock
      await this.database.locks.add(lockRecord);
      
      // Execute operation
      const result = await operation();
      
      return result;
    } catch (error) {
      // Check if lock already exists and is not expired
      const existingLock = await this.database.locks.get(lockId);
      if (existingLock && existingLock.expiresAt > Date.now()) {
        // Lock is held by another process
        throw new Error(`Lock ${lockId} is already held`);
      }
      
      // Lock expired, clean it up and try again
      if (existingLock) {
        await this.database.locks.delete(lockId);
        return await this.withDatabaseLock(lockId, operation);
      }
      
      throw error;
    } finally {
      // Release lock
      try {
        await this.database.locks.delete(lockId);
      } catch (error) {
        console.warn('Failed to release lock:', error);
      }
    }
  }
}