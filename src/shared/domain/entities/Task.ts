import { TaskId } from '../value-objects/TaskId';
import { NonEmptyTitle } from '../value-objects/NonEmptyTitle';
import { DateOnly } from '../value-objects/DateOnly';
import { TaskCategory, TaskStatus } from '../types';
import { DomainEvent } from '../events/DomainEvent';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent,
  TaskTitleChangedEvent,
  TaskSoftDeletedEvent
} from '../events/TaskEvents';

/**
 * Domain error for invalid task operations
 */
export class InvalidTaskOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskOperationError';
  }
}

/**
 * Task entity representing a todo item
 */
export class Task {
  private _title: NonEmptyTitle;
  private _category: TaskCategory;
  private _status: TaskStatus;
  private _updatedAt: Date;
  private _deletedAt?: Date;
  private _wasEverReviewed: boolean = false;
  public readonly inboxEnteredAt?: Date;

  constructor(
    public readonly id: TaskId,
    title: NonEmptyTitle,
    category: TaskCategory,
    status: TaskStatus = TaskStatus.ACTIVE,
    public readonly createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    deletedAt?: Date,
    inboxEnteredAt?: Date
  ) {
    this._title = title;
    this._category = category;
    this._status = status;
    this._updatedAt = updatedAt;
    this._deletedAt = deletedAt;
    
    // Set inboxEnteredAt if not provided and category is INBOX
    this.inboxEnteredAt = inboxEnteredAt ?? (category === TaskCategory.INBOX ? this.createdAt : undefined);
    
    // Track if task was ever reviewed (moved from INBOX)
    this._wasEverReviewed = category !== TaskCategory.INBOX;
  }

  // Getters
  get title(): NonEmptyTitle {
    return this._title;
  }

  get category(): TaskCategory {
    return this._category;
  }

  get status(): TaskStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get deletedAt(): Date | undefined {
    return this._deletedAt;
  }

  get isDeleted(): boolean {
    return this._deletedAt !== undefined;
  }

  get isCompleted(): boolean {
    return this._status === TaskStatus.COMPLETED;
  }

  get isActive(): boolean {
    return this._status === TaskStatus.ACTIVE && !this.isDeleted;
  }

  get wasEverReviewed(): boolean {
    return this._wasEverReviewed;
  }

  /**
   * Create a new task (factory method that emits creation event)
   */
  static create(
    id: TaskId,
    title: NonEmptyTitle,
    category: TaskCategory
  ): { task: Task; events: DomainEvent[] } {
    const now = new Date();
    const task = new Task(
      id,
      title,
      category,
      TaskStatus.ACTIVE,
      now,
      now,
      undefined,
      category === TaskCategory.INBOX ? now : undefined
    );

    const events = [new TaskCreatedEvent(id, title, category)];
    
    return { task, events };
  }

  /**
   * Change the task's category
   */
  changeCategory(newCategory: TaskCategory): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError('Cannot change category of deleted task');
    }

    if (this._category === newCategory) {
      return []; // No change needed
    }

    const events: DomainEvent[] = [];
    const oldCategory = this._category;

    // Check if this is the first time moving from INBOX (review event)
    if (oldCategory === TaskCategory.INBOX && !this._wasEverReviewed) {
      events.push(new TaskReviewedEvent(this.id, new Date()));
      this._wasEverReviewed = true;
    }

    this._category = newCategory;
    this._updatedAt = new Date();

    events.push(new TaskCategoryChangedEvent(this.id, oldCategory, newCategory));

    return events;
  }

  /**
   * Complete the task
   */
  complete(): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError('Cannot complete deleted task');
    }

    if (this._status === TaskStatus.COMPLETED) {
      return []; // Already completed
    }

    this._status = TaskStatus.COMPLETED;
    this._updatedAt = new Date();

    return [new TaskCompletedEvent(this.id, this._category)];
  }

  /**
   * Revert task completion
   */
  revertCompletion(): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError('Cannot revert completion of deleted task');
    }

    if (this._status === TaskStatus.ACTIVE) {
      return []; // Already active
    }

    this._status = TaskStatus.ACTIVE;
    this._updatedAt = new Date();

    return [new TaskCompletionRevertedEvent(this.id, this._category)];
  }

  /**
   * Change the task's title
   */
  changeTitle(newTitle: NonEmptyTitle): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError('Cannot change title of deleted task');
    }

    if (this._title.equals(newTitle)) {
      return []; // No change needed
    }

    const oldTitle = this._title;
    this._title = newTitle;
    this._updatedAt = new Date();

    return [new TaskTitleChangedEvent(this.id, oldTitle, newTitle)];
  }

  /**
   * Check if task is overdue (only applies to INBOX tasks)
   */
  isOverdue(overdueDays: number): boolean {
    if (this._category !== TaskCategory.INBOX || !this.inboxEnteredAt || this.isCompleted) {
      return false;
    }

    const today = DateOnly.today();
    const enteredDate = DateOnly.fromDate(this.inboxEnteredAt);
    const daysDifference = today.daysDifference(enteredDate);

    return daysDifference >= overdueDays;
  }

  /**
   * Soft delete the task
   */
  softDelete(): DomainEvent[] {
    if (this.isDeleted) {
      return []; // Already deleted
    }

    const now = new Date();
    this._deletedAt = now;
    this._updatedAt = now;

    return [new TaskSoftDeletedEvent(this.id, now)];
  }

  /**
   * Update the updatedAt timestamp (for sync purposes)
   */
  touch(): void {
    this._updatedAt = new Date();
  }

  /**
   * Create a copy of the task with updated fields (for immutable updates)
   */
  copyWith(updates: {
    title?: NonEmptyTitle;
    category?: TaskCategory;
    status?: TaskStatus;
    updatedAt?: Date;
    deletedAt?: Date;
  }): Task {
    return new Task(
      this.id,
      updates.title ?? this._title,
      updates.category ?? this._category,
      updates.status ?? this._status,
      this.createdAt,
      updates.updatedAt ?? this._updatedAt,
      updates.deletedAt ?? this._deletedAt,
      this.inboxEnteredAt
    );
  }
}