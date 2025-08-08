import { TaskId } from "../value-objects/TaskId";
import { NonEmptyTitle } from "../value-objects/NonEmptyTitle";
import { DateOnly } from "../value-objects/DateOnly";
import { TaskCategory, TaskStatus } from "../types";
import { DomainEvent } from "../events/DomainEvent";
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent,
  TaskTitleChangedEvent,
  TaskSoftDeletedEvent,
  TaskDeferredEvent,
  TaskUndeferredEvent,
} from "../events/TaskEvents";

/**
 * Domain error for invalid task operations
 */
export class InvalidTaskOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTaskOperationError";
  }
}

/**
 * Task entity representing a todo item
 */
export class Task {
  private _title: NonEmptyTitle;
  private _category: TaskCategory;
  private _status: TaskStatus;
  private _order: number;
  private _updatedAt: Date;
  private _deletedAt?: Date;
  private _wasEverReviewed: boolean = false;
  private _deferredUntil?: Date;
  private _originalCategory?: TaskCategory;
  private _note?: string | null;
  public readonly inboxEnteredAt?: Date;

  constructor(
    public readonly id: TaskId,
    title: NonEmptyTitle,
    category: TaskCategory,
    status: TaskStatus = TaskStatus.ACTIVE,
    order: number = Date.now(),
    public readonly createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    deletedAt?: Date,
    inboxEnteredAt?: Date,
    deferredUntil?: Date,
    originalCategory?: TaskCategory,
    note?: string | null
  ) {
    this._title = title;
    this._category = category;
    this._status = status;
    this._order = order;
    this._updatedAt = updatedAt;
    this._deletedAt = deletedAt;
    this._deferredUntil = deferredUntil;
    this._originalCategory = originalCategory;
    this._note = note;

    // Set inboxEnteredAt if not provided and category is INBOX
    this.inboxEnteredAt =
      inboxEnteredAt ??
      (category === TaskCategory.INBOX ? this.createdAt : undefined);

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

  get order(): number {
    return this._order;
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

  get deferredUntil(): Date | undefined {
    return this._deferredUntil;
  }

  get originalCategory(): TaskCategory | undefined {
    return this._originalCategory;
  }

  get note(): string | null {
    return this._note ?? null;
  }

  get isDeferred(): boolean {
    return (
      this._category === TaskCategory.DEFERRED &&
      this._deferredUntil !== undefined
    );
  }

  get isDeferredAndDue(): boolean {
    if (!this.isDeferred || !this._deferredUntil) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deferredDate = new Date(this._deferredUntil);
    deferredDate.setHours(0, 0, 0, 0);
    return deferredDate <= today;
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
      now.getTime(), // Use timestamp as default order
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
      throw new InvalidTaskOperationError(
        "Cannot change category of deleted task"
      );
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

    events.push(
      new TaskCategoryChangedEvent(this.id, oldCategory, newCategory)
    );

    return events;
  }

  /**
   * Complete the task
   */
  complete(): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError("Cannot complete deleted task");
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
      throw new InvalidTaskOperationError(
        "Cannot revert completion of deleted task"
      );
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
      throw new InvalidTaskOperationError(
        "Cannot change title of deleted task"
      );
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
   * Change the task's order
   */
  changeOrder(newOrder: number): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError(
        "Cannot change order of deleted task"
      );
    }

    if (this._order === newOrder) {
      return []; // No change needed
    }

    this._order = newOrder;
    this._updatedAt = new Date();

    return []; // No specific domain event for order change
  }

  /**
   * Update task note
   */
  updateNote(note: string | null): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError("Cannot change note of deleted task");
    }

    if (this._note === note) {
      return [];
    }

    this._note = note;
    this._updatedAt = new Date();

    return [];
  }

  /**
   * Check if task is overdue (only applies to INBOX tasks)
   */
  isOverdue(overdueDays: number): boolean {
    if (
      this._category !== TaskCategory.INBOX ||
      !this.inboxEnteredAt ||
      this.isCompleted
    ) {
      return false;
    }

    const today = DateOnly.today();
    const enteredDate = DateOnly.fromDate(this.inboxEnteredAt);
    const daysDifference = today.daysDifference(enteredDate);

    return daysDifference >= overdueDays;
  }

  /**
   * Defer the task until a specific date
   */
  defer(deferredUntil: Date): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError("Cannot defer deleted task");
    }

    if (this._category === TaskCategory.DEFERRED) {
      // Already deferred, just update the date
      this._deferredUntil = deferredUntil;
      this._updatedAt = new Date();
      return [
        new TaskDeferredEvent(
          this.id,
          deferredUntil,
          this._originalCategory || TaskCategory.INBOX
        ),
      ];
    }

    // Store original category before deferring
    this._originalCategory = this._category;
    this._category = TaskCategory.DEFERRED;
    this._deferredUntil = deferredUntil;
    this._updatedAt = new Date();

    return [
      new TaskDeferredEvent(this.id, deferredUntil, this._originalCategory),
    ];
  }

  /**
   * Restore task from deferred state
   */
  undefer(): DomainEvent[] {
    if (this.isDeleted) {
      throw new InvalidTaskOperationError("Cannot undefer deleted task");
    }

    if (this._category !== TaskCategory.DEFERRED) {
      return []; // Not deferred
    }

    const restoredCategory = this._originalCategory || TaskCategory.INBOX;
    this._category = restoredCategory;
    this._deferredUntil = undefined;
    this._originalCategory = undefined;
    this._updatedAt = new Date();

    return [new TaskUndeferredEvent(this.id, restoredCategory)];
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
    order?: number;
    updatedAt?: Date;
    deletedAt?: Date;
    deferredUntil?: Date;
    originalCategory?: TaskCategory;
  }): Task {
    return new Task(
      this.id,
      updates.title ?? this._title,
      updates.category ?? this._category,
      updates.status ?? this._status,
      updates.order ?? this._order,
      this.createdAt,
      updates.updatedAt ?? this._updatedAt,
      updates.deletedAt ?? this._deletedAt,
      this.inboxEnteredAt,
      updates.deferredUntil ?? this._deferredUntil,
      updates.originalCategory ?? this._originalCategory
    );
  }
}
