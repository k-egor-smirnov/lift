import { DomainEvent } from "./DomainEvent";
import { DomainEventType, TaskCategory } from "../types";
import { TaskId } from "../value-objects/TaskId";
import { NonEmptyTitle } from "../value-objects/NonEmptyTitle";
import { DateOnly } from "../value-objects/DateOnly";

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
      category: this.category,
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
      categoryAtCompletion: this.categoryAtCompletion,
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
      currentCategory: this.currentCategory,
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
      toCategory: this.toCategory,
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
      reviewedAt: this.reviewedAt.toISOString(),
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
      toTitle: this.toTitle.value,
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
      deletedAt: this.deletedAt.toISOString(),
    };
  }
}

/**
 * Event emitted when a task is added to today's list
 */
export class TaskAddedToTodayEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly date: DateOnly
  ) {
    super(DomainEventType.TASK_ADDED_TO_TODAY);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      date: this.date.value,
    };
  }
}

/**
 * Event emitted when a task is removed from today's list
 */
export class TaskRemovedFromTodayEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly date: DateOnly
  ) {
    super(DomainEventType.TASK_REMOVED_FROM_TODAY);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      date: this.date.value,
    };
  }
}

/**
 * Event emitted when a task is deferred
 */
export class TaskDeferredEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly deferredUntil: Date,
    public readonly originalCategory: TaskCategory
  ) {
    super(DomainEventType.TASK_DEFERRED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      deferredUntil: this.deferredUntil.toISOString(),
      originalCategory: this.originalCategory,
    };
  }
}

/**
 * Event emitted when a task is undeferred (restored from deferred state)
 */
export class TaskUndeferredEvent extends DomainEvent {
  constructor(
    public readonly taskId: TaskId,
    public readonly restoredCategory: TaskCategory
  ) {
    super(DomainEventType.TASK_UNDEFERRED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
      restoredCategory: this.restoredCategory,
    };
  }
}

/**
 * Event emitted when a task image is updated
 */
export class TaskImageUpdatedEvent extends DomainEvent {
  constructor(public readonly taskId: TaskId) {
    super(DomainEventType.TASK_IMAGE_UPDATED);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId.value,
    };
  }
}
