import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainEvent } from '../events/DomainEvent';
import { 
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent
} from '../events/TaskEvents';
import { InMemoryEventBus } from '../events/EventBus';
import { DomainEventType, TaskCategory } from '../types';
import { TaskId } from '../value-objects/TaskId';
import { NonEmptyTitle } from '../value-objects/NonEmptyTitle';

describe('Domain Events System', () => {
  let eventBus: InMemoryEventBus;
  let taskId: TaskId;
  let title: NonEmptyTitle;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    taskId = TaskId.generate();
    title = new NonEmptyTitle('Test Task');
  });

  describe('DomainEvent base class', () => {
    class TestEvent extends DomainEvent {
      constructor(public readonly data: string) {
        super(DomainEventType.TASK_CREATED);
      }

      getEventData(): Record<string, any> {
        return { data: this.data };
      }
    }

    it('should create event with required properties', () => {
      const event = new TestEvent('test data');

      expect(event.eventId).toBeDefined();
      expect(event.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.eventType).toBe(DomainEventType.TASK_CREATED);
      expect(event.getEventData()).toEqual({ data: 'test data' });
    });

    it('should generate unique event IDs', () => {
      const event1 = new TestEvent('data1');
      const event2 = new TestEvent('data2');

      expect(event1.eventId).not.toBe(event2.eventId);
    });
  });

  describe('TaskCreatedEvent', () => {
    it('should create event with task data', () => {
      const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

      expect(event.eventType).toBe(DomainEventType.TASK_CREATED);
      expect(event.taskId).toBe(taskId);
      expect(event.title).toBe(title);
      expect(event.category).toBe(TaskCategory.SIMPLE);
      expect(event.getEventData()).toEqual({
        taskId: taskId.value,
        title: title.value,
        category: TaskCategory.SIMPLE
      });
    });
  });

  describe('TaskCompletedEvent', () => {
    it('should create event with completion data', () => {
      const event = new TaskCompletedEvent(taskId, TaskCategory.FOCUS);

      expect(event.eventType).toBe(DomainEventType.TASK_COMPLETED);
      expect(event.taskId).toBe(taskId);
      expect(event.categoryAtCompletion).toBe(TaskCategory.FOCUS);
      expect(event.getEventData()).toEqual({
        taskId: taskId.value,
        categoryAtCompletion: TaskCategory.FOCUS
      });
    });
  });

  describe('TaskCategoryChangedEvent', () => {
    it('should create event with category change data', () => {
      const event = new TaskCategoryChangedEvent(
        taskId,
        TaskCategory.INBOX,
        TaskCategory.SIMPLE
      );

      expect(event.eventType).toBe(DomainEventType.TASK_CATEGORY_CHANGED);
      expect(event.taskId).toBe(taskId);
      expect(event.fromCategory).toBe(TaskCategory.INBOX);
      expect(event.toCategory).toBe(TaskCategory.SIMPLE);
      expect(event.getEventData()).toEqual({
        taskId: taskId.value,
        fromCategory: TaskCategory.INBOX,
        toCategory: TaskCategory.SIMPLE
      });
    });
  });

  describe('TaskReviewedEvent', () => {
    it('should create event with review data', () => {
      const reviewedAt = new Date();
      const event = new TaskReviewedEvent(taskId, reviewedAt);

      expect(event.eventType).toBe(DomainEventType.TASK_REVIEWED);
      expect(event.taskId).toBe(taskId);
      expect(event.reviewedAt).toBe(reviewedAt);
      expect(event.getEventData()).toEqual({
        taskId: taskId.value,
        reviewedAt: reviewedAt.toISOString()
      });
    });
  });

  describe('InMemoryEventBus', () => {
    describe('publish', () => {
      it('should publish single event to subscribed handlers', async () => {
        const handler = vi.fn();
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        eventBus.subscribe(DomainEventType.TASK_CREATED, handler);
        await eventBus.publish(event);

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(event);
      });

      it('should not call handlers for different event types', async () => {
        const handler = vi.fn();
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        eventBus.subscribe(DomainEventType.TASK_COMPLETED, handler);
        await eventBus.publish(event);

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('publishAll', () => {
      it('should publish multiple events to appropriate handlers', async () => {
        const createdHandler = vi.fn();
        const completedHandler = vi.fn();
        const globalHandler = vi.fn();

        const createdEvent = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
        const completedEvent = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

        eventBus.subscribe(DomainEventType.TASK_CREATED, createdHandler);
        eventBus.subscribe(DomainEventType.TASK_COMPLETED, completedHandler);
        eventBus.subscribeToAll(globalHandler);

        await eventBus.publishAll([createdEvent, completedEvent]);

        expect(createdHandler).toHaveBeenCalledOnce();
        expect(createdHandler).toHaveBeenCalledWith(createdEvent);
        expect(completedHandler).toHaveBeenCalledOnce();
        expect(completedHandler).toHaveBeenCalledWith(completedEvent);
        expect(globalHandler).toHaveBeenCalledTimes(2);
        expect(globalHandler).toHaveBeenCalledWith(createdEvent);
        expect(globalHandler).toHaveBeenCalledWith(completedEvent);
      });

      it('should handle empty event array', async () => {
        const handler = vi.fn();
        eventBus.subscribeToAll(handler);

        await eventBus.publishAll([]);

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('subscribe', () => {
      it('should subscribe to specific event type', async () => {
        const handler = vi.fn();
        const subscription = eventBus.subscribe(DomainEventType.TASK_CREATED, handler);
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        await eventBus.publish(event);

        expect(handler).toHaveBeenCalledWith(event);
        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(1);

        subscription.unsubscribe();
        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(0);
      });

      it('should support multiple handlers for same event type', async () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        eventBus.subscribe(DomainEventType.TASK_CREATED, handler1);
        eventBus.subscribe(DomainEventType.TASK_CREATED, handler2);

        await eventBus.publish(event);

        expect(handler1).toHaveBeenCalledWith(event);
        expect(handler2).toHaveBeenCalledWith(event);
        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(2);
      });

      it('should handle async handlers', async () => {
        const asyncHandler = vi.fn().mockResolvedValue(undefined);
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        eventBus.subscribe(DomainEventType.TASK_CREATED, asyncHandler);
        await eventBus.publish(event);

        expect(asyncHandler).toHaveBeenCalledWith(event);
      });

      it('should handle handler errors gracefully', async () => {
        const errorHandler = vi.fn().mockImplementation(() => {
          throw new Error('Handler error');
        });
        const normalHandler = vi.fn();
        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);

        // Mock console.error to avoid test output noise
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        eventBus.subscribe(DomainEventType.TASK_CREATED, errorHandler);
        eventBus.subscribe(DomainEventType.TASK_CREATED, normalHandler);

        await eventBus.publish(event);

        expect(errorHandler).toHaveBeenCalled();
        expect(normalHandler).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Error executing event handler:', expect.any(Error));

        consoleSpy.mockRestore();
      });
    });

    describe('subscribeToAll', () => {
      it('should subscribe to all event types', async () => {
        const globalHandler = vi.fn();
        const subscription = eventBus.subscribeToAll(globalHandler);

        const createdEvent = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
        const completedEvent = new TaskCompletedEvent(taskId, TaskCategory.SIMPLE);

        await eventBus.publish(createdEvent);
        await eventBus.publish(completedEvent);

        expect(globalHandler).toHaveBeenCalledTimes(2);
        expect(globalHandler).toHaveBeenCalledWith(createdEvent);
        expect(globalHandler).toHaveBeenCalledWith(completedEvent);
        expect(eventBus.getGlobalHandlerCount()).toBe(1);

        subscription.unsubscribe();
        expect(eventBus.getGlobalHandlerCount()).toBe(0);
      });
    });

    describe('clear', () => {
      it('should clear all subscriptions', async () => {
        const specificHandler = vi.fn();
        const globalHandler = vi.fn();

        eventBus.subscribe(DomainEventType.TASK_CREATED, specificHandler);
        eventBus.subscribeToAll(globalHandler);

        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(1);
        expect(eventBus.getGlobalHandlerCount()).toBe(1);

        eventBus.clear();

        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(0);
        expect(eventBus.getGlobalHandlerCount()).toBe(0);

        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
        await eventBus.publish(event);

        expect(specificHandler).not.toHaveBeenCalled();
        expect(globalHandler).not.toHaveBeenCalled();
      });
    });

    describe('unsubscribe', () => {
      it('should remove specific handler when unsubscribed', async () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        const subscription1 = eventBus.subscribe(DomainEventType.TASK_CREATED, handler1);
        eventBus.subscribe(DomainEventType.TASK_CREATED, handler2);

        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(2);

        subscription1.unsubscribe();

        expect(eventBus.getHandlerCount(DomainEventType.TASK_CREATED)).toBe(1);

        const event = new TaskCreatedEvent(taskId, title, TaskCategory.SIMPLE);
        await eventBus.publish(event);

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledWith(event);
      });
    });
  });
});