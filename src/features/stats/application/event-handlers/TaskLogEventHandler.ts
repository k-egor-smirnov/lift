import { DomainEvent } from '../../../../shared/domain/events/DomainEvent';
import { 
  TaskCreatedEvent, 
  TaskCompletedEvent, 
  TaskCompletionRevertedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent,
  TaskTitleChangedEvent,
  TaskSoftDeletedEvent
} from '../../../../shared/domain/events/TaskEvents';
import { TodoDatabase } from '../../../../shared/infrastructure/database/TodoDatabase';
import { DomainEventType } from '../../../../shared/domain/types';

export interface EventHandler {
  id: string;
  handle(event: DomainEvent): Promise<void>;
}

/**
 * Event handler that creates system logs for task events
 * Uses idempotent UPSERT operations to ensure consistency
 */
export class TaskLogEventHandler implements EventHandler {
  id = 'task-log-handler';

  constructor(private database: TodoDatabase) {}

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case DomainEventType.TASK_CREATED:
        await this.handleTaskCreated(event as TaskCreatedEvent);
        break;
      case DomainEventType.TASK_COMPLETED:
        await this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case DomainEventType.TASK_COMPLETION_REVERTED:
        await this.handleTaskCompletionReverted(event as TaskCompletionRevertedEvent);
        break;
      case DomainEventType.TASK_CATEGORY_CHANGED:
        await this.handleTaskCategoryChanged(event as TaskCategoryChangedEvent);
        break;
      case DomainEventType.TASK_REVIEWED:
        await this.handleTaskReviewed(event as TaskReviewedEvent);
        break;
      case DomainEventType.TASK_TITLE_CHANGED:
        await this.handleTaskTitleChanged(event as TaskTitleChangedEvent);
        break;
      case DomainEventType.TASK_SOFT_DELETED:
        await this.handleTaskSoftDeleted(event as TaskSoftDeletedEvent);
        break;
    }
  }

  private async handleTaskCreated(event: TaskCreatedEvent): Promise<void> {
    // Use deterministic ID for idempotency
    const logId = `task-created-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: `Task created in ${event.category} category`,
      metadata: {
        eventType: event.eventType,
        category: event.category,
        title: event.title.value
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const logId = `task-completed-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: `Task completed in ${event.categoryAtCompletion} category`,
      metadata: {
        eventType: event.eventType,
        categoryAtCompletion: event.categoryAtCompletion
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskCompletionReverted(event: TaskCompletionRevertedEvent): Promise<void> {
    const logId = `task-completion-reverted-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: `Task completion reverted, moved back to ${event.currentCategory}`,
      metadata: {
        eventType: event.eventType,
        currentCategory: event.currentCategory
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskCategoryChanged(event: TaskCategoryChangedEvent): Promise<void> {
    const logId = `task-category-changed-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: `Task moved from ${event.fromCategory} to ${event.toCategory}`,
      metadata: {
        eventType: event.eventType,
        fromCategory: event.fromCategory,
        toCategory: event.toCategory
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskReviewed(event: TaskReviewedEvent): Promise<void> {
    const logId = `task-reviewed-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: 'Task reviewed - moved from INBOX for the first time',
      metadata: {
        eventType: event.eventType,
        reviewedAt: event.reviewedAt.toISOString()
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskTitleChanged(event: TaskTitleChangedEvent): Promise<void> {
    const logId = `task-title-changed-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: `Task title changed from "${event.fromTitle.value}" to "${event.toTitle.value}"`,
      metadata: {
        eventType: event.eventType,
        fromTitle: event.fromTitle.value,
        toTitle: event.toTitle.value
      },
      createdAt: new Date(event.createdAt)
    });
  }

  private async handleTaskSoftDeleted(event: TaskSoftDeletedEvent): Promise<void> {
    const logId = `task-soft-deleted-${event.aggregateId}-${event.createdAt}`;
    
    await this.database.taskLogs.put({
      id: logId,
      taskId: event.taskId.value,
      type: 'SYSTEM',
      message: 'Task deleted',
      metadata: {
        eventType: event.eventType,
        deletedAt: event.deletedAt.toISOString()
      },
      createdAt: new Date(event.createdAt)
    });
  }
}