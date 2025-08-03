import { injectable, inject } from "tsyringe";
import { DomainEvent } from "../../domain/events/DomainEvent";
import { DomainEventType } from "../../domain/types";
import { EventBus } from "../../domain/events/EventBus";
import { taskEventBus } from "./TaskEventBus";
import { TaskEventType } from "../../domain/events/TaskEvent";
import * as tokens from "../di/tokens";
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskCategoryChangedEvent,
  TaskTitleChangedEvent,
  TaskSoftDeletedEvent,
  TaskAddedToTodayEvent,
  TaskRemovedFromTodayEvent,
  TaskReviewedEvent,
  TaskDeferredEvent,
  TaskUndeferredEvent,
} from "../../domain/events/TaskEvents";

/**
 * Adapter that bridges domain events to task events
 * Subscribes to domain events and publishes corresponding task events
 */
@injectable()
export class TaskEventAdapter {
  constructor(@inject(tokens.EVENT_BUS_TOKEN) private eventBus: EventBus) {}

  /**
   * Initialize the adapter by subscribing to domain events
   */
  initialize(): void {
    // Subscribe to all domain events and convert them to task events
    this.eventBus.subscribeToAll(this.handleDomainEvent.bind(this));
  }

  /**
   * Handle domain events and emit corresponding task events
   */
  private async handleDomainEvent(event: DomainEvent): Promise<void> {
    try {
      switch (event.eventType) {
        case DomainEventType.TASK_CREATED:
          await this.handleTaskCreated(event as TaskCreatedEvent);
          break;
        case DomainEventType.TASK_COMPLETED:
          await this.handleTaskCompleted(event as TaskCompletedEvent);
          break;
        case DomainEventType.TASK_COMPLETION_REVERTED:
          await this.handleTaskCompletionReverted(
            event as TaskCompletionRevertedEvent
          );
          break;
        case DomainEventType.TASK_CATEGORY_CHANGED:
          await this.handleTaskCategoryChanged(
            event as TaskCategoryChangedEvent
          );
          break;
        case DomainEventType.TASK_TITLE_CHANGED:
          await this.handleTaskTitleChanged(event as TaskTitleChangedEvent);
          break;
        case DomainEventType.TASK_SOFT_DELETED:
          await this.handleTaskSoftDeleted(event as TaskSoftDeletedEvent);
          break;
        case DomainEventType.TASK_ADDED_TO_TODAY:
          await this.handleTaskAddedToToday(event as TaskAddedToTodayEvent);
          break;
        case DomainEventType.TASK_REMOVED_FROM_TODAY:
          await this.handleTaskRemovedFromToday(
            event as TaskRemovedFromTodayEvent
          );
          break;
        case DomainEventType.TASK_REVIEWED:
          await this.handleTaskReviewed(event as TaskReviewedEvent);
          break;
        case DomainEventType.TASK_DEFERRED:
          await this.handleTaskDeferred(event as TaskDeferredEvent);
          break;
        case DomainEventType.TASK_UNDEFERRED:
          await this.handleTaskUndeferred(event as TaskUndeferredEvent);
          break;
        default:
          // Ignore unknown events
          break;
      }
    } catch (error) {
      console.error("Error handling domain event in TaskEventAdapter:", error);
    }
  }

  private async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_CREATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        title: event.title.value,
        category: event.category,
      },
    });
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_COMPLETED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        categoryAtCompletion: event.categoryAtCompletion,
      },
    });
  }

  private async handleTaskCompletionReverted(
    event: TaskCompletionRevertedEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        currentCategory: event.currentCategory,
        action: "completion_reverted",
      } as any,
    });
  }

  private async handleTaskCategoryChanged(
    event: TaskCategoryChangedEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        category: event.toCategory,
        fromCategory: event.fromCategory,
        toCategory: event.toCategory,
        action: "category_changed",
      } as any,
    });
  }

  private async handleTaskTitleChanged(
    event: TaskTitleChangedEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        title: event.toTitle.value,
        fromTitle: event.fromTitle.value,
        toTitle: event.toTitle.value,
        action: "title_changed",
      } as any,
    });
  }

  private async handleTaskSoftDeleted(
    event: TaskSoftDeletedEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_DELETED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        deletedAt: event.deletedAt,
      },
    });
  }

  private async handleTaskAddedToToday(
    event: TaskAddedToTodayEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_ADDED_TO_TODAY,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        date: event.date.value,
      },
    });
  }

  private async handleTaskRemovedFromToday(
    event: TaskRemovedFromTodayEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_REMOVED_FROM_TODAY,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        date: event.date.value,
      },
    });
  }

  private async handleTaskReviewed(event: TaskReviewedEvent): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        reviewedAt: event.reviewedAt,
        action: "reviewed",
      } as any,
    });
  }

  private async handleTaskDeferred(event: TaskDeferredEvent): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        deferredUntil: event.deferredUntil.toISOString(),
        action: "deferred",
      } as any,
    });
  }

  private async handleTaskUndeferred(
    event: TaskUndeferredEvent
  ): Promise<void> {
    await taskEventBus.emit({
      type: TaskEventType.TASK_UPDATED,
      taskId: event.taskId.value,
      timestamp: event.occurredAt,
      data: {
        action: "undeferred",
      } as any,
    });
  }
}
