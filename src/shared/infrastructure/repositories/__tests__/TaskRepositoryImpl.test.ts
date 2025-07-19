import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskRepositoryImpl } from '../TaskRepositoryImpl';
import { TodoDatabase } from '../../database/TodoDatabase';
import { Task } from '../../../domain/entities/Task';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../../domain/types';

describe('TaskRepositoryImpl', () => {
  let db: TodoDatabase;
  let repository: TaskRepositoryImpl;

  beforeEach(async () => {
    db = new TodoDatabase();
    await db.initialize();
    await db.clearAllData();
    repository = new TaskRepositoryImpl(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('save and findById', () => {
    it('should save and retrieve a task', async () => {
      const taskId = TaskId.generate();
      const title = new NonEmptyTitle('Test Task');
      const { task } = Task.create(taskId, title, TaskCategory.SIMPLE);

      await repository.save(task);

      const retrievedTask = await repository.findById(taskId);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.id.equals(taskId)).toBe(true);
      expect(retrievedTask!.title.equals(title)).toBe(true);
      expect(retrievedTask!.category).toBe(TaskCategory.SIMPLE);
      expect(retrievedTask!.status).toBe(TaskStatus.ACTIVE);
    });

    it('should return null for non-existent task', async () => {
      const nonExistentId = TaskId.generate();
      const result = await repository.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should return null for soft-deleted task', async () => {
      const taskId = TaskId.generate();
      const title = new NonEmptyTitle('Test Task');
      const { task } = Task.create(taskId, title, TaskCategory.SIMPLE);
      
      // Soft delete the task
      task.softDelete();
      await repository.save(task);

      const result = await repository.findById(taskId);
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all active tasks', async () => {
      const task1Id = TaskId.generate();
      const task2Id = TaskId.generate();
      const task3Id = TaskId.generate();
      
      const { task: task1 } = Task.create(task1Id, new NonEmptyTitle('Task 1'), TaskCategory.SIMPLE);
      const { task: task2 } = Task.create(task2Id, new NonEmptyTitle('Task 2'), TaskCategory.FOCUS);
      const { task: task3 } = Task.create(task3Id, new NonEmptyTitle('Task 3'), TaskCategory.INBOX);
      
      // Soft delete task3
      task3.softDelete();

      await repository.saveMany([task1, task2, task3]);

      const allTasks = await repository.findAll();
      expect(allTasks).toHaveLength(2);
      expect(allTasks.some(t => t.id.equals(task1Id))).toBe(true);
      expect(allTasks.some(t => t.id.equals(task2Id))).toBe(true);
      expect(allTasks.some(t => t.id.equals(task3Id))).toBe(false);
    });

    it('should return empty array when no tasks exist', async () => {
      const allTasks = await repository.findAll();
      expect(allTasks).toHaveLength(0);
    });
  });

  describe('findByCategory', () => {
    it('should return tasks filtered by category', async () => {
      const simpleTaskId = TaskId.generate();
      const focusTaskId = TaskId.generate();
      const inboxTaskId = TaskId.generate();
      
      const { task: simpleTask } = Task.create(simpleTaskId, new NonEmptyTitle('Simple Task'), TaskCategory.SIMPLE);
      const { task: focusTask } = Task.create(focusTaskId, new NonEmptyTitle('Focus Task'), TaskCategory.FOCUS);
      const { task: inboxTask } = Task.create(inboxTaskId, new NonEmptyTitle('Inbox Task'), TaskCategory.INBOX);

      await repository.saveMany([simpleTask, focusTask, inboxTask]);

      const simpleTasks = await repository.findByCategory(TaskCategory.SIMPLE);
      const focusTasks = await repository.findByCategory(TaskCategory.FOCUS);
      const inboxTasks = await repository.findByCategory(TaskCategory.INBOX);

      expect(simpleTasks).toHaveLength(1);
      expect(simpleTasks[0].id.equals(simpleTaskId)).toBe(true);
      
      expect(focusTasks).toHaveLength(1);
      expect(focusTasks[0].id.equals(focusTaskId)).toBe(true);
      
      expect(inboxTasks).toHaveLength(1);
      expect(inboxTasks[0].id.equals(inboxTaskId)).toBe(true);
    });

    it('should exclude soft-deleted tasks from category filter', async () => {
      const task1Id = TaskId.generate();
      const task2Id = TaskId.generate();
      
      const { task: task1 } = Task.create(task1Id, new NonEmptyTitle('Task 1'), TaskCategory.SIMPLE);
      const { task: task2 } = Task.create(task2Id, new NonEmptyTitle('Task 2'), TaskCategory.SIMPLE);
      
      // Soft delete task2
      task2.softDelete();

      await repository.saveMany([task1, task2]);

      const simpleTasks = await repository.findByCategory(TaskCategory.SIMPLE);
      expect(simpleTasks).toHaveLength(1);
      expect(simpleTasks[0].id.equals(task1Id)).toBe(true);
    });
  });

  describe('findByStatus', () => {
    it('should return tasks filtered by status', async () => {
      const activeTaskId = TaskId.generate();
      const completedTaskId = TaskId.generate();
      
      const { task: activeTask } = Task.create(activeTaskId, new NonEmptyTitle('Active Task'), TaskCategory.SIMPLE);
      const { task: completedTask } = Task.create(completedTaskId, new NonEmptyTitle('Completed Task'), TaskCategory.SIMPLE);
      
      // Complete the second task
      completedTask.complete();

      await repository.saveMany([activeTask, completedTask]);

      const activeTasks = await repository.findByStatus(TaskStatus.ACTIVE);
      const completedTasks = await repository.findByStatus(TaskStatus.COMPLETED);

      expect(activeTasks).toHaveLength(1);
      expect(activeTasks[0].id.equals(activeTaskId)).toBe(true);
      
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].id.equals(completedTaskId)).toBe(true);
    });
  });

  describe('findByCategoryAndStatus', () => {
    it('should return tasks filtered by both category and status', async () => {
      const simpleActiveId = TaskId.generate();
      const simpleCompletedId = TaskId.generate();
      const focusActiveId = TaskId.generate();
      
      const { task: simpleActive } = Task.create(simpleActiveId, new NonEmptyTitle('Simple Active'), TaskCategory.SIMPLE);
      const { task: simpleCompleted } = Task.create(simpleCompletedId, new NonEmptyTitle('Simple Completed'), TaskCategory.SIMPLE);
      const { task: focusActive } = Task.create(focusActiveId, new NonEmptyTitle('Focus Active'), TaskCategory.FOCUS);
      
      // Complete the simple task
      simpleCompleted.complete();

      await repository.saveMany([simpleActive, simpleCompleted, focusActive]);

      const simpleActiveTasks = await repository.findByCategoryAndStatus(TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      const simpleCompletedTasks = await repository.findByCategoryAndStatus(TaskCategory.SIMPLE, TaskStatus.COMPLETED);
      const focusActiveTasks = await repository.findByCategoryAndStatus(TaskCategory.FOCUS, TaskStatus.ACTIVE);

      expect(simpleActiveTasks).toHaveLength(1);
      expect(simpleActiveTasks[0].id.equals(simpleActiveId)).toBe(true);
      
      expect(simpleCompletedTasks).toHaveLength(1);
      expect(simpleCompletedTasks[0].id.equals(simpleCompletedId)).toBe(true);
      
      expect(focusActiveTasks).toHaveLength(1);
      expect(focusActiveTasks[0].id.equals(focusActiveId)).toBe(true);
    });
  });

  describe('findOverdueTasks', () => {
    it('should return overdue inbox tasks', async () => {
      const recentTaskId = TaskId.generate();
      const overdueTaskId = TaskId.generate();
      const completedOverdueId = TaskId.generate();
      const nonInboxOverdueId = TaskId.generate();
      
      // Create tasks with specific dates
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      
      const recentTask = new Task(
        recentTaskId,
        new NonEmptyTitle('Recent Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        oneDayAgo,
        oneDayAgo,
        undefined,
        oneDayAgo
      );
      
      const overdueTask = new Task(
        overdueTaskId,
        new NonEmptyTitle('Overdue Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        fiveDaysAgo,
        fiveDaysAgo,
        undefined,
        fiveDaysAgo
      );
      
      const completedOverdueTask = new Task(
        completedOverdueId,
        new NonEmptyTitle('Completed Overdue'),
        TaskCategory.INBOX,
        TaskStatus.COMPLETED,
        fiveDaysAgo,
        fiveDaysAgo,
        undefined,
        fiveDaysAgo
      );
      
      const nonInboxOverdueTask = new Task(
        nonInboxOverdueId,
        new NonEmptyTitle('Non-Inbox Overdue'),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE,
        fiveDaysAgo,
        fiveDaysAgo
      );

      await repository.saveMany([recentTask, overdueTask, completedOverdueTask, nonInboxOverdueTask]);

      const overdueTasks = await repository.findOverdueTasks(3);
      
      expect(overdueTasks).toHaveLength(1);
      expect(overdueTasks[0].id.equals(overdueTaskId)).toBe(true);
    });
  });

  describe('count and countByCategory', () => {
    it('should count tasks correctly', async () => {
      const task1Id = TaskId.generate();
      const task2Id = TaskId.generate();
      const task3Id = TaskId.generate();
      
      const { task: task1 } = Task.create(task1Id, new NonEmptyTitle('Task 1'), TaskCategory.SIMPLE);
      const { task: task2 } = Task.create(task2Id, new NonEmptyTitle('Task 2'), TaskCategory.SIMPLE);
      const { task: task3 } = Task.create(task3Id, new NonEmptyTitle('Task 3'), TaskCategory.FOCUS);
      
      // Soft delete task3
      task3.softDelete();

      await repository.saveMany([task1, task2, task3]);

      const totalCount = await repository.count();
      const simpleCount = await repository.countByCategory(TaskCategory.SIMPLE);
      const focusCount = await repository.countByCategory(TaskCategory.FOCUS);

      expect(totalCount).toBe(2);
      expect(simpleCount).toBe(2);
      expect(focusCount).toBe(0); // task3 is soft-deleted
    });
  });

  describe('exists', () => {
    it('should return true for existing active task', async () => {
      const taskId = TaskId.generate();
      const { task } = Task.create(taskId, new NonEmptyTitle('Test Task'), TaskCategory.SIMPLE);

      await repository.save(task);

      const exists = await repository.exists(taskId);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent task', async () => {
      const nonExistentId = TaskId.generate();
      const exists = await repository.exists(nonExistentId);
      expect(exists).toBe(false);
    });

    it('should return false for soft-deleted task', async () => {
      const taskId = TaskId.generate();
      const { task } = Task.create(taskId, new NonEmptyTitle('Test Task'), TaskCategory.SIMPLE);
      
      // Soft delete the task
      task.softDelete();
      await repository.save(task);

      const exists = await repository.exists(taskId);
      expect(exists).toBe(false);
    });
  });

  describe('delete (hard delete)', () => {
    it('should permanently delete a task', async () => {
      const taskId = TaskId.generate();
      const { task } = Task.create(taskId, new NonEmptyTitle('Test Task'), TaskCategory.SIMPLE);

      await repository.save(task);
      
      // Verify task exists
      expect(await repository.exists(taskId)).toBe(true);

      // Hard delete
      await repository.delete(taskId);

      // Verify task is gone
      expect(await repository.exists(taskId)).toBe(false);
      expect(await repository.findById(taskId)).toBeNull();
    });
  });

  describe('saveMany', () => {
    it('should save multiple tasks in batch', async () => {
      const task1Id = TaskId.generate();
      const task2Id = TaskId.generate();
      const task3Id = TaskId.generate();
      
      const { task: task1 } = Task.create(task1Id, new NonEmptyTitle('Task 1'), TaskCategory.SIMPLE);
      const { task: task2 } = Task.create(task2Id, new NonEmptyTitle('Task 2'), TaskCategory.FOCUS);
      const { task: task3 } = Task.create(task3Id, new NonEmptyTitle('Task 3'), TaskCategory.INBOX);

      await repository.saveMany([task1, task2, task3]);

      const allTasks = await repository.findAll();
      expect(allTasks).toHaveLength(3);
      
      const retrievedTask1 = await repository.findById(task1Id);
      const retrievedTask2 = await repository.findById(task2Id);
      const retrievedTask3 = await repository.findById(task3Id);
      
      expect(retrievedTask1).toBeDefined();
      expect(retrievedTask2).toBeDefined();
      expect(retrievedTask3).toBeDefined();
    });
  });

  describe('task updates', () => {
    it('should update existing task when saved again', async () => {
      const taskId = TaskId.generate();
      const originalTitle = new NonEmptyTitle('Original Title');
      const { task } = Task.create(taskId, originalTitle, TaskCategory.SIMPLE);

      await repository.save(task);

      // Update the task
      const newTitle = new NonEmptyTitle('Updated Title');
      task.changeTitle(newTitle);
      task.complete();

      await repository.save(task);

      const updatedTask = await repository.findById(taskId);
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.title.equals(newTitle)).toBe(true);
      expect(updatedTask!.status).toBe(TaskStatus.COMPLETED);
    });
  });
});