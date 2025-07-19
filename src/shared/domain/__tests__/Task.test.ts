import { describe, it, expect, beforeEach } from 'vitest';
import { Task, InvalidTaskOperationError } from '../entities/Task';
import { TaskId } from '../value-objects/TaskId';
import { NonEmptyTitle } from '../value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../types';
import {
  TaskCreatedEvent,
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskCategoryChangedEvent,
  TaskReviewedEvent,
  TaskTitleChangedEvent,
  TaskSoftDeletedEvent
} from '../events/TaskEvents';

describe('Task Entity', () => {
  let taskId: TaskId;
  let title: NonEmptyTitle;
  let task: Task;

  beforeEach(() => {
    taskId = TaskId.generate();
    title = new NonEmptyTitle('Test Task');
  });

  describe('constructor', () => {
    it('should create task with required fields', () => {
      const now = new Date();
      task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE, now, now);

      expect(task.id).toBe(taskId);
      expect(task.title).toBe(title);
      expect(task.category).toBe(TaskCategory.SIMPLE);
      expect(task.status).toBe(TaskStatus.ACTIVE);
      expect(task.createdAt).toBe(now);
      expect(task.updatedAt).toBe(now);
      expect(task.isActive).toBe(true);
      expect(task.isCompleted).toBe(false);
      expect(task.isDeleted).toBe(false);
    });

    it('should set inboxEnteredAt for INBOX tasks', () => {
      const now = new Date();
      task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE, now, now);

      expect(task.inboxEnteredAt).toBeDefined();
    });

    it('should not set inboxEnteredAt for non-INBOX tasks', () => {
      const now = new Date();
      task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE, now, now);

      expect(task.inboxEnteredAt).toBeUndefined();
    });

    it('should mark non-INBOX tasks as reviewed', () => {
      const now = new Date();
      task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE, now, now);

      expect(task.wasEverReviewed).toBe(true);
    });

    it('should not mark INBOX tasks as reviewed initially', () => {
      const now = new Date();
      task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE, now, now);

      expect(task.wasEverReviewed).toBe(false);
    });
  });

  describe('create factory method', () => {
    it('should create task and emit creation event', () => {
      const { task: createdTask, events } = Task.create(taskId, title, TaskCategory.SIMPLE);

      expect(createdTask.id).toBe(taskId);
      expect(createdTask.title).toBe(title);
      expect(createdTask.category).toBe(TaskCategory.SIMPLE);
      expect(createdTask.status).toBe(TaskStatus.ACTIVE);
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCreatedEvent);
      expect((events[0] as TaskCreatedEvent).taskId).toBe(taskId);
    });

    it('should set inboxEnteredAt for INBOX tasks', () => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.INBOX);

      expect(createdTask.inboxEnteredAt).toBeDefined();
    });
  });

  describe('changeCategory', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.INBOX);
      task = createdTask;
    });

    it('should change category and emit category changed event', () => {
      const events = task.changeCategory(TaskCategory.SIMPLE);

      expect(task.category).toBe(TaskCategory.SIMPLE);
      expect(events).toHaveLength(2); // Review + Category change
      expect(events[0]).toBeInstanceOf(TaskReviewedEvent);
      expect(events[1]).toBeInstanceOf(TaskCategoryChangedEvent);
    });

    it('should emit review event when moving from INBOX for first time', () => {
      const events = task.changeCategory(TaskCategory.FOCUS);

      expect(task.wasEverReviewed).toBe(true);
      expect(events[0]).toBeInstanceOf(TaskReviewedEvent);
    });

    it('should not emit review event when already reviewed', () => {
      // First change to mark as reviewed
      task.changeCategory(TaskCategory.SIMPLE);
      
      // Second change should not emit review event
      const events = task.changeCategory(TaskCategory.FOCUS);

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCategoryChangedEvent);
    });

    it('should return empty array when category is the same', () => {
      const events = task.changeCategory(TaskCategory.INBOX);

      expect(events).toHaveLength(0);
      expect(task.category).toBe(TaskCategory.INBOX);
    });

    it('should throw error when task is deleted', () => {
      task.softDelete();

      expect(() => task.changeCategory(TaskCategory.SIMPLE))
        .toThrow(InvalidTaskOperationError);
    });

    it('should update updatedAt timestamp', async () => {
      const originalUpdatedAt = task.updatedAt;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      task.changeCategory(TaskCategory.SIMPLE);
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });
  });

  describe('complete', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
    });

    it('should complete task and emit completion event', () => {
      const events = task.complete();

      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(task.isCompleted).toBe(true);
      expect(task.isActive).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCompletedEvent);
      expect((events[0] as TaskCompletedEvent).categoryAtCompletion).toBe(TaskCategory.SIMPLE);
    });

    it('should return empty array when already completed', () => {
      task.complete();
      const events = task.complete();

      expect(events).toHaveLength(0);
    });

    it('should throw error when task is deleted', () => {
      task.softDelete();

      expect(() => task.complete()).toThrow(InvalidTaskOperationError);
    });

    it('should update updatedAt timestamp', async () => {
      const originalUpdatedAt = task.updatedAt;
      
      await new Promise(resolve => setTimeout(resolve, 1));
      task.complete();
      expect(task.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('revertCompletion', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
      task.complete();
    });

    it('should revert completion and emit revert event', () => {
      const events = task.revertCompletion();

      expect(task.status).toBe(TaskStatus.ACTIVE);
      expect(task.isCompleted).toBe(false);
      expect(task.isActive).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskCompletionRevertedEvent);
    });

    it('should return empty array when already active', () => {
      task.revertCompletion();
      const events = task.revertCompletion();

      expect(events).toHaveLength(0);
    });

    it('should throw error when task is deleted', () => {
      task.softDelete();

      expect(() => task.revertCompletion()).toThrow(InvalidTaskOperationError);
    });
  });

  describe('changeTitle', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
    });

    it('should change title and emit title changed event', () => {
      const newTitle = new NonEmptyTitle('Updated Task');
      const events = task.changeTitle(newTitle);

      expect(task.title).toBe(newTitle);
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskTitleChangedEvent);
      expect((events[0] as TaskTitleChangedEvent).fromTitle).toBe(title);
      expect((events[0] as TaskTitleChangedEvent).toTitle).toBe(newTitle);
    });

    it('should return empty array when title is the same', () => {
      const events = task.changeTitle(title);

      expect(events).toHaveLength(0);
    });

    it('should throw error when task is deleted', () => {
      task.softDelete();
      const newTitle = new NonEmptyTitle('New Title');

      expect(() => task.changeTitle(newTitle)).toThrow(InvalidTaskOperationError);
    });
  });

  describe('isOverdue', () => {
    it('should return true for overdue INBOX tasks', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5); // 5 days ago
      
      task = new Task(
        taskId,
        title,
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        pastDate,
        pastDate,
        undefined,
        pastDate
      );

      expect(task.isOverdue(3)).toBe(true);
    });

    it('should return false for non-overdue INBOX tasks', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // 1 day ago
      
      task = new Task(
        taskId,
        title,
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        recentDate,
        recentDate,
        undefined,
        recentDate
      );

      expect(task.isOverdue(3)).toBe(false);
    });

    it('should return false for non-INBOX tasks', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      
      task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE, pastDate, pastDate);

      expect(task.isOverdue(3)).toBe(false);
    });

    it('should return false for completed INBOX tasks', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      
      task = new Task(
        taskId,
        title,
        TaskCategory.INBOX,
        TaskStatus.COMPLETED,
        pastDate,
        pastDate,
        undefined,
        pastDate
      );

      expect(task.isOverdue(3)).toBe(false);
    });

    it('should return false when inboxEnteredAt is not set', () => {
      task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE, new Date(), new Date());

      expect(task.isOverdue(3)).toBe(false);
    });
  });

  describe('softDelete', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
    });

    it('should soft delete task and emit deletion event', () => {
      const events = task.softDelete();

      expect(task.isDeleted).toBe(true);
      expect(task.deletedAt).toBeDefined();
      expect(task.isActive).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaskSoftDeletedEvent);
    });

    it('should return empty array when already deleted', () => {
      task.softDelete();
      const events = task.softDelete();

      expect(events).toHaveLength(0);
    });
  });

  describe('touch', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
    });

    it('should update updatedAt timestamp', async () => {
      const originalUpdatedAt = task.updatedAt;
      
      await new Promise(resolve => setTimeout(resolve, 1));
      task.touch();
      expect(task.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('copyWith', () => {
    beforeEach(() => {
      const { task: createdTask } = Task.create(taskId, title, TaskCategory.SIMPLE);
      task = createdTask;
    });

    it('should create copy with updated fields', () => {
      const newTitle = new NonEmptyTitle('New Title');
      const newUpdatedAt = new Date();
      
      const copy = task.copyWith({
        title: newTitle,
        category: TaskCategory.FOCUS,
        updatedAt: newUpdatedAt
      });

      expect(copy.id).toBe(task.id);
      expect(copy.title).toBe(newTitle);
      expect(copy.category).toBe(TaskCategory.FOCUS);
      expect(copy.updatedAt).toBe(newUpdatedAt);
      expect(copy.createdAt).toBe(task.createdAt);
      
      // Original should be unchanged
      expect(task.title).toBe(title);
      expect(task.category).toBe(TaskCategory.SIMPLE);
    });

    it('should preserve original fields when not updated', () => {
      const copy = task.copyWith({});

      expect(copy.id).toBe(task.id);
      expect(copy.title).toBe(task.title);
      expect(copy.category).toBe(task.category);
      expect(copy.status).toBe(task.status);
    });
  });
});