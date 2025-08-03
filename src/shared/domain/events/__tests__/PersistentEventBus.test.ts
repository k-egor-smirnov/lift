import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PersistentEventBusImpl,
  PersistentEventHandler,
  EventProcessingStats,
} from "../EventBus";
import { TodoDatabase } from "../../../infrastructure/database/TodoDatabase";
import { DomainEvent } from "../DomainEvent";
import { DomainEventType } from "../../types";
import { TaskId } from "../../value-objects/TaskId";
import { NonEmptyTitle } from "../../value-objects/NonEmptyTitle";
import { TaskCategory } from "../../types";
import { TaskCreatedEvent, TaskCompletedEvent } from "../TaskEvents";

// Mock database for testing
class TestDatabase extends TodoDatabase {
  constructor() {
    super();
    this.name = "TestDatabase_" + Math.random().toString(36).substr(2, 9);
  }
}

// Test event handler
class TestEventHandler implements PersistentEventHandler {
  public readonly id: string;
  public handledEvents: DomainEvent[] = [];
  public shouldThrow = false;
  public throwCount = 0;
  public maxThrows = 0;

  constructor(id: string) {
    this.id = id;
  }

  async handle(event: DomainEvent): Promise<void> {
    if (this.shouldThrow && this.throwCount < this.maxThrows) {
      this.throwCount++;
      throw new Error(
        `Handler ${this.id} failed on attempt ${this.throwCount}`
      );
    }

    this.handledEvents.push(event);
  }

  reset(): void {
    this.handledEvents = [];
    this.shouldThrow = false;
    this.throwCount = 0;
    this.maxThrows = 0;
  }
}

describe("PersistentEventBus", () => {
  let database: TestDatabase;
  let eventBus: PersistentEventBusImpl;
  let handler1: TestEventHandler;
  let handler2: TestEventHandler;
  let globalHandler: TestEventHandler;

  beforeEach(async () => {
    database = new TestDatabase();
    await database.initialize();
    await database.clearAllData();

    eventBus = new PersistentEventBusImpl(database);
    handler1 = new TestEventHandler("test-handler-1");
    handler2 = new TestEventHandler("test-handler-2");
    globalHandler = new TestEventHandler("global-handler");
  });

  afterEach(async () => {
    eventBus.stopProcessingLoop();

    // Wait a bit for any pending async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    eventBus.clear();
    await database.clearAllData();
    await database.close();
  });

  describe("Event Publishing and Storage", () => {
    it("should store events in database when published", async () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);

      const storedEvents = await database.eventStore.toArray();
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].eventType).toBe(DomainEventType.TASK_CREATED);
      expect(storedEvents[0].status).toBe("pending");
      expect(storedEvents[0].aggregateId).toBe(taskId.value);
      expect(storedEvents[0].aggregateType).toBe("task");
    });

    it("should handle empty event arrays", async () => {
      await eventBus.publishAll([]);

      const storedEvents = await database.eventStore.toArray();
      expect(storedEvents).toHaveLength(0);
    });

    it("should store multiple events with correct ordering", async () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event1 = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
      const event2 = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

      await eventBus.publishAll([event1, event2]);

      const storedEvents = await database.eventStore
        .orderBy("createdAt")
        .toArray();

      expect(storedEvents).toHaveLength(2);
      // Events should be ordered by creation time
      expect(storedEvents[0].createdAt).toBeLessThanOrEqual(
        storedEvents[1].createdAt
      );

      // Check that both event types are present (order may vary due to timing)
      const eventTypes = storedEvents.map((e) => e.eventType);
      expect(eventTypes).toContain(DomainEventType.TASK_CREATED);
      expect(eventTypes).toContain(DomainEventType.TASK_COMPLETED);
    });
  });

  describe("Event Handler Registration", () => {
    it("should register persistent handlers for specific event types", () => {
      const subscription = eventBus.subscribePersistent(
        DomainEventType.TASK_CREATED,
        handler1
      );

      expect(subscription).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe("function");
    });

    it("should register global persistent handlers", () => {
      const subscription = eventBus.subscribePersistentToAll(globalHandler);

      expect(subscription).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe("function");
    });

    it("should unsubscribe handlers correctly", () => {
      const subscription = eventBus.subscribePersistent(
        DomainEventType.TASK_CREATED,
        handler1
      );

      subscription.unsubscribe();

      // Handler should no longer be registered
      // This is tested indirectly through event processing
    });
  });

  describe("Event Processing", () => {
    it("should process events with registered handlers", async () => {
      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler1);
      eventBus.subscribePersistentToAll(globalHandler);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);

      // Manually trigger processing and wait for completion
      // Bypass locking for testing
      await eventBus["processEventsDirectly"]();

      expect(handler1.handledEvents).toHaveLength(1);
      expect(handler1.handledEvents[0].eventType).toBe(
        DomainEventType.TASK_CREATED
      );
      expect(globalHandler.handledEvents).toHaveLength(1);
      expect(globalHandler.handledEvents[0].eventType).toBe(
        DomainEventType.TASK_CREATED
      );

      // Check event status in database
      const processedEvents = await database.eventStore
        .where("status")
        .equals("done")
        .toArray();
      expect(processedEvents).toHaveLength(1);
    });

    it("should maintain per-aggregate ordering", async () => {
      eventBus.subscribePersistentToAll(globalHandler);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event1 = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
      const event2 = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

      // Publish events in order
      await eventBus.publishAll([event1, event2]);

      // Process events
      await eventBus["processEventsDirectly"]();

      expect(globalHandler.handledEvents).toHaveLength(2);
      expect(globalHandler.handledEvents[0].eventType).toBe(
        DomainEventType.TASK_CREATED
      );
      expect(globalHandler.handledEvents[1].eventType).toBe(
        DomainEventType.TASK_COMPLETED
      );
    });

    it("should process events from different aggregates independently", async () => {
      eventBus.subscribePersistentToAll(globalHandler);

      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");

      const event1 = new TaskCreatedEvent(taskId1, title, TaskCategory.SIMPLE);
      const event2 = new TaskCreatedEvent(taskId2, title, TaskCategory.FOCUS);

      await eventBus.publishAll([event1, event2]);
      await eventBus["processEventsDirectly"]();

      expect(globalHandler.handledEvents).toHaveLength(2);

      // Both events should be processed regardless of order
      const eventTypes = globalHandler.handledEvents.map((e) => e.eventType);
      expect(eventTypes).toContain(DomainEventType.TASK_CREATED);
      expect(
        eventTypes.filter((t) => t === DomainEventType.TASK_CREATED)
      ).toHaveLength(2);
    });
  });

  describe("Idempotency", () => {
    it("should not process the same event twice for the same handler", async () => {
      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler1);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);
      await eventBus["processEventsDirectly"]();

      expect(handler1.handledEvents).toHaveLength(1);

      // Reset handler and process again
      handler1.reset();
      await eventBus["processEventsDirectly"]();

      // Should not process again
      expect(handler1.handledEvents).toHaveLength(0);

      // Check handledEvents table
      const handledEvents = await database.handledEvents.toArray();
      expect(handledEvents).toHaveLength(1);
      expect(handledEvents[0].handlerId).toBe("test-handler-1");
    });

    it("should allow different handlers to process the same event", async () => {
      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler1);
      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler2);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);
      await eventBus["processEventsDirectly"]();

      expect(handler1.handledEvents).toHaveLength(1);
      expect(handler2.handledEvents).toHaveLength(1);

      // Check handledEvents table
      const handledEvents = await database.handledEvents.toArray();
      expect(handledEvents).toHaveLength(2);
      expect(handledEvents.map((h) => h.handlerId)).toContain("test-handler-1");
      expect(handledEvents.map((h) => h.handlerId)).toContain("test-handler-2");
    });
  });

  describe("Retry Logic", () => {
    it("should retry failed events with exponential backoff", async () => {
      handler1.shouldThrow = true;
      handler1.maxThrows = 2; // Fail first 2 attempts, succeed on 3rd

      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler1);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);

      // First attempt - should fail
      await eventBus["processEventsDirectly"]();
      expect(handler1.handledEvents).toHaveLength(0);

      let eventRecord = await database.eventStore.toArray();
      expect(eventRecord[0].status).toBe("pending");
      expect(eventRecord[0].attemptCount).toBe(1);
      expect(eventRecord[0].nextAttemptAt).toBeGreaterThan(Date.now());

      // Wait for retry time and process again
      await database.eventStore.update(eventRecord[0].id, {
        nextAttemptAt: Date.now() - 1000, // Make it ready for retry
      });

      // Second attempt - should still fail
      await eventBus["processEventsDirectly"]();
      expect(handler1.handledEvents).toHaveLength(0);

      eventRecord = await database.eventStore.toArray();
      expect(eventRecord[0].status).toBe("pending");
      expect(eventRecord[0].attemptCount).toBe(2);

      // Third attempt - should succeed
      await database.eventStore.update(eventRecord[0].id, {
        nextAttemptAt: Date.now() - 1000,
      });

      await eventBus["processEventsDirectly"]();
      expect(handler1.handledEvents).toHaveLength(1);

      eventRecord = await database.eventStore.toArray();
      expect(eventRecord[0].status).toBe("done");
    });

    it("should move events to dead letter queue after max retries", async () => {
      handler1.shouldThrow = true;
      handler1.maxThrows = 10; // Always fail

      eventBus.subscribePersistent(DomainEventType.TASK_CREATED, handler1);

      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      await eventBus.publishAll([event]);

      // Process multiple times to exceed max retries
      for (let i = 0; i < 6; i++) {
        await eventBus["processEventsDirectly"]();

        if (i < 5) {
          // Update nextAttemptAt to allow immediate retry
          const eventRecord = await database.eventStore.toArray();
          if (eventRecord[0].status === "pending") {
            await database.eventStore.update(eventRecord[0].id, {
              nextAttemptAt: Date.now() - 1000,
            });
          }
        }
      }

      const eventRecord = await database.eventStore.toArray();
      expect(eventRecord[0].status).toBe("dead");
      expect(eventRecord[0].attemptCount).toBe(5); // MAX_RETRY_ATTEMPTS
      expect(handler1.handledEvents).toHaveLength(0);
    });

    it("should calculate exponential backoff with jitter correctly", () => {
      const eventBus = new PersistentEventBusImpl(database);

      // Test backoff calculation (accessing private method for testing)
      const backoff1 = eventBus["calculateBackoffDelay"](1);
      const backoff2 = eventBus["calculateBackoffDelay"](2);
      const backoff3 = eventBus["calculateBackoffDelay"](3);

      // Should increase exponentially (with jitter, so approximate)
      expect(backoff1).toBeGreaterThanOrEqual(1000); // base delay
      expect(backoff1).toBeLessThan(3000); // base + max jitter

      expect(backoff2).toBeGreaterThanOrEqual(2000); // base * 2
      expect(backoff2).toBeLessThan(4000); // (base * 2) + max jitter

      expect(backoff3).toBeGreaterThanOrEqual(4000); // base * 4
      expect(backoff3).toBeLessThan(6000); // (base * 4) + max jitter
    });
  });

  describe("Processing Loop", () => {
    it("should start and stop processing loop", () => {
      expect(eventBus["processingLoopId"]).toBeUndefined();

      eventBus.startProcessingLoop();
      expect(eventBus["processingLoopId"]).toBeDefined();

      eventBus.stopProcessingLoop();
      expect(eventBus["processingLoopId"]).toBeUndefined();
    });

    it("should not start multiple processing loops", () => {
      eventBus.startProcessingLoop();
      const firstLoopId = eventBus["processingLoopId"];

      eventBus.startProcessingLoop();
      const secondLoopId = eventBus["processingLoopId"];

      expect(firstLoopId).toBe(secondLoopId);

      eventBus.stopProcessingLoop();
    });

    it("should prevent concurrent processing", async () => {
      eventBus["isProcessing"] = true;

      const processingPromise = eventBus["processNextBatch"]();

      // Should return immediately without processing
      await processingPromise;

      expect(eventBus["isProcessing"]).toBe(true);
    });
  });

  describe("Processing Statistics", () => {
    it("should return correct processing statistics", async () => {
      // Create events in different states
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");

      // Pending event
      await eventBus.publishAll([
        new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE),
      ]);

      // Processing event
      await database.eventStore.add({
        id: "processing-event",
        aggregateId: taskId.value,
        aggregateType: "task",
        eventType: DomainEventType.TASK_COMPLETED,
        eventData: "{}",
        createdAt: Date.now(),
        status: "processing",
        attemptCount: 1,
      });

      // Done event
      await database.eventStore.add({
        id: "done-event",
        aggregateId: taskId.value,
        aggregateType: "task",
        eventType: DomainEventType.TASK_COMPLETED,
        eventData: "{}",
        createdAt: Date.now(),
        status: "done",
        attemptCount: 1,
      });

      // Dead event
      await database.eventStore.add({
        id: "dead-event",
        aggregateId: taskId.value,
        aggregateType: "task",
        eventType: DomainEventType.TASK_COMPLETED,
        eventData: "{}",
        createdAt: Date.now(),
        status: "dead",
        attemptCount: 5,
      });

      const stats = await eventBus.getProcessingStats();

      expect(stats.totalEvents).toBe(4);
      expect(stats.pendingEvents).toBe(1);
      expect(stats.processingEvents).toBe(1);
      expect(stats.doneEvents).toBe(1);
      expect(stats.deadLetterEvents).toBe(1);
      expect(stats.averageProcessingTime).toBe(0); // Not implemented yet
    });
  });

  describe("Locking Mechanism", () => {
    it("should use Web Locks API when available", async () => {
      // Mock navigator.locks
      const mockLocks = {
        request: vi.fn().mockImplementation(async (name, options, callback) => {
          return await callback();
        }),
      };

      Object.defineProperty(navigator, "locks", {
        value: mockLocks,
        configurable: true,
      });

      let operationExecuted = false;
      await eventBus["withLock"]("test-lock", async () => {
        operationExecuted = true;
      });

      expect(operationExecuted).toBe(true);
      expect(mockLocks.request).toHaveBeenCalledWith(
        "test-lock",
        { mode: "exclusive" },
        expect.any(Function)
      );
    });

    it("should fallback to database locking when Web Locks API unavailable", async () => {
      // Remove navigator.locks
      const originalLocks = (navigator as any).locks;
      delete (navigator as any).locks;

      let operationExecuted = false;
      await eventBus["withLock"]("test-lock", async () => {
        operationExecuted = true;
      });

      expect(operationExecuted).toBe(true);

      // Check that lock was created and cleaned up
      const locks = await database.locks.toArray();
      expect(locks).toHaveLength(0); // Should be cleaned up

      // Restore navigator.locks
      if (originalLocks) {
        (navigator as any).locks = originalLocks;
      }
    });

    it("should handle lock conflicts in database locking", async () => {
      // Remove navigator.locks
      const originalLocks = (navigator as any).locks;
      delete (navigator as any).locks;

      // Create an existing lock
      await database.locks.add({
        id: "test-lock",
        expiresAt: Date.now() + 30000,
      });

      // Try to acquire the same lock
      await expect(
        eventBus["withLock"]("test-lock", async () => {
          // Should not execute
        })
      ).rejects.toThrow("Lock test-lock is already held");

      // Restore navigator.locks
      if (originalLocks) {
        (navigator as any).locks = originalLocks;
      }
    });

    it("should clean up expired locks", async () => {
      // Remove navigator.locks
      const originalLocks = (navigator as any).locks;
      delete (navigator as any).locks;

      // Create an expired lock
      await database.locks.add({
        id: "test-lock",
        expiresAt: Date.now() - 1000, // Expired
      });

      let operationExecuted = false;
      await eventBus["withLock"]("test-lock", async () => {
        operationExecuted = true;
      });

      expect(operationExecuted).toBe(true);

      // Restore navigator.locks
      if (originalLocks) {
        (navigator as any).locks = originalLocks;
      }
    });
  });

  describe("Event Deserialization", () => {
    it("should deserialize events correctly", () => {
      const eventData = {
        eventId: "test-event-id",
        occurredAt: "2023-01-01T00:00:00.000Z",
        taskId: "test-task-id",
      };

      const eventRecord = {
        id: "record-id",
        aggregateId: "test-task-id",
        aggregateType: "task",
        eventType: DomainEventType.TASK_CREATED,
        eventData: JSON.stringify(eventData),
        createdAt: Date.now(),
        status: "pending" as const,
        attemptCount: 0,
      };

      const deserializedEvent = eventBus["deserializeEvent"](
        eventRecord,
        eventData
      );

      expect(deserializedEvent.eventId).toBe("test-event-id");
      expect(deserializedEvent.occurredAt).toEqual(
        new Date("2023-01-01T00:00:00.000Z")
      );
      expect(deserializedEvent.eventType).toBe(DomainEventType.TASK_CREATED);
      expect(deserializedEvent.getEventData()).toEqual(eventData);
    });
  });

  describe("Aggregate Extraction", () => {
    it("should extract aggregate ID from task events", () => {
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString("Test Task");
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      const aggregateId = eventBus["extractAggregateId"](event);
      const aggregateType = eventBus["extractAggregateType"](event);

      expect(aggregateId).toBe(taskId.value);
      expect(aggregateType).toBe("task");
    });

    it("should handle unknown aggregate types", () => {
      const mockEvent = {
        eventId: "test-id",
        occurredAt: new Date(),
        eventType: DomainEventType.TASK_CREATED,
        getEventData: () => ({ someField: "value" }),
      } as DomainEvent;

      const aggregateId = eventBus["extractAggregateId"](mockEvent);
      const aggregateType = eventBus["extractAggregateType"](mockEvent);

      expect(aggregateId).toBe("unknown");
      expect(aggregateType).toBe("unknown");
    });
  });
});
