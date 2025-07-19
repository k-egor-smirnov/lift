import { DomainEvent } from './DomainEvent';
import { DomainEventType, TaskCategory } from '../types';
import { TaskId } from '../value-objects/TaskId';
import { NonEmptyTitle } from '../value-objects/NonEmptyTitle';

/**
 * Event emitted when a task is created
 */
export class TaskCreatedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly title: NonEmptyTitle,
    public readonly category: TaskCategory
  ) {
    super(DomainEventType.TASK_CREATED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      title: this.title.value,
      category: this.category
    };
  }
}

/**
 * Event emitted when a task is completed
 */
export class TaskCompletedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly categoryAtCompletion: TaskCategory
  ) {
    super(DomainEventType.TASK_COMPLETED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      categoryAtCompletion: this.categoryAtCompletion
    };
  }
}

/**
 * Event emitted when task completion is reverted
 */
export class TaskCompletionRevertedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly currentCategory: TaskCategory
  ) {
    super(DomainEventType.TASK_COMPLETION_REVERTED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      currentCategory: this.currentCategory
    };
  }
}

/**
 * Event emitted when a task category is changed
 */
export class TaskCategoryChangedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly fromCategory: TaskCategory,
    public readonly toCategory: TaskCategory
  ) {
    super(DomainEventType.TASK_CATEGORY_CHANGED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      fromCategory: this.fromCategory,
      toCategory: this.toCategory
    };
  }
}

/**
 * Event emitted when a task is reviewed (moved from INBOX for the first time)
 */
export class TaskReviewedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly reviewedAt: Date
  ) {
    super(DomainEventType.TASK_REVIEWED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      reviewedAt: this.reviewedAt.toISOString()
    };
  }
}

/**
 * Event emitted when a task title is changed
 */
export class TaskTitleChangedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly fromTitle: NonEmptyTitle,
    public readonly toTitle: NonEmptyTitle
  ) {
    super(DomainEventType.TASK_TITLE_CHANGED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      fromTitle: this.fromTitle.value,
      toTitle: this.toTitle.value
    };
  }
}

/**
 * Event emitted when a task is soft deleted
 */
export class TaskSoftDeletedEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly deletedAt: Date
  ) {
    super(DomainEventType.TASK_SOFT_DELETED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      deletedAt: this.deletedAt.toISOString()
    };
  }
}