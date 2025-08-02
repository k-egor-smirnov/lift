import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DailySelectionRepositoryImpl } from '../DailySelectionRepositoryImpl';
import { TodoDatabase } from '../../database/TodoDatabase';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { DateOnly } from '../../../domain/value-objects/DateOnly';

describe('DailySelectionRepositoryImpl', () => {
  let db: TodoDatabase;
  let repository: DailySelectionRepositoryImpl;

  beforeEach(async () => {
    db = new TodoDatabase();
    await db.initialize();
    await db.clearAllData();
    repository = new DailySelectionRepositoryImpl(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('addTaskToDay and isTaskSelectedForDay', () => {
    it('should add a task to daily selection', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);

      const isSelected = await repository.isTaskSelectedForDay(date, taskId);
      expect(isSelected).toBe(true);
    });

    it('should be idempotent - adding same task twice should not create duplicates', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);
      await repository.addTaskToDay(date, taskId);

      const count = await repository.countTasksForDay(date);
      expect(count).toBe(1);
    });

    it('should return false for non-selected task', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      const isSelected = await repository.isTaskSelectedForDay(date, taskId);
      expect(isSelected).toBe(false);
    });
  });

  describe('removeTaskFromDay', () => {
    it('should remove a task from daily selection', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(true);

      await repository.removeTaskFromDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(false);
    });

    it('should not throw error when removing non-existent task', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await expect(repository.removeTaskFromDay(date, taskId)).resolves.not.toThrow();
    });
  });

  describe('getTasksForDay and getTaskIdsForDay', () => {
    it('should return all tasks selected for a specific day', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();

      await repository.addTaskToDay(date, taskId1);
      await repository.addTaskToDay(date, taskId2);
      
      // Add task for different day
      await repository.addTaskToDay(new DateOnly('2024-01-16'), taskId3);

      const tasks = await repository.getTasksForDay(date);
      const taskIds = await repository.getTaskIdsForDay(date);

      expect(tasks).toHaveLength(2);
      expect(taskIds).toHaveLength(2);
      
      const taskIdValues = taskIds.map(id => id.value);
      expect(taskIdValues).toContain(taskId1.value);
      expect(taskIdValues).toContain(taskId2.value);
      expect(taskIdValues).not.toContain(taskId3.value);
    });

    it('should return empty array for day with no selections', async () => {
      const date = new DateOnly('2024-01-15');

      const tasks = await repository.getTasksForDay(date);
      const taskIds = await repository.getTaskIdsForDay(date);

      expect(tasks).toHaveLength(0);
      expect(taskIds).toHaveLength(0);
    });
  });

  describe('markTaskCompleted and getTaskCompletionStatus', () => {
    it('should mark task as completed and retrieve completion status', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);
      
      // Initially should not be completed
      let status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBe(false);

      // Mark as completed
      await repository.markTaskCompleted(date, taskId, true);
      status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBe(true);

      // Mark as not completed
      await repository.markTaskCompleted(date, taskId, false);
      status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBe(false);
    });

    it('should return null for completion status of non-selected task', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      const status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBeNull();
    });
  });

  describe('getDailySelectionsForRange', () => {
    it('should return selections within date range', async () => {
      const date1 = new DateOnly('2024-01-15');
      const date2 = new DateOnly('2024-01-16');
      const date3 = new DateOnly('2024-01-17');
      const date4 = new DateOnly('2024-01-18');
      
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();
      const taskId4 = TaskId.generate();

      await repository.addTaskToDay(date1, taskId1);
      await repository.addTaskToDay(date2, taskId2);
      await repository.addTaskToDay(date3, taskId3);
      await repository.addTaskToDay(date4, taskId4);

      const selections = await repository.getDailySelectionsForRange(date2, date3);

      expect(selections).toHaveLength(2);
      const dates = selections.map(s => s.date.value);
      expect(dates).toContain('2024-01-16');
      expect(dates).toContain('2024-01-17');
      expect(dates).not.toContain('2024-01-15');
      expect(dates).not.toContain('2024-01-18');
    });

    it('should return empty array for range with no selections', async () => {
      const startDate = new DateOnly('2024-01-15');
      const endDate = new DateOnly('2024-01-17');

      const selections = await repository.getDailySelectionsForRange(startDate, endDate);
      expect(selections).toHaveLength(0);
    });
  });

  describe('clearDay', () => {
    it('should clear all selections for a specific day', async () => {
      const date = new DateOnly('2024-01-15');
      const otherDate = new DateOnly('2024-01-16');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();

      await repository.addTaskToDay(date, taskId1);
      await repository.addTaskToDay(date, taskId2);
      await repository.addTaskToDay(otherDate, taskId3);

      expect(await repository.countTasksForDay(date)).toBe(2);
      expect(await repository.countTasksForDay(otherDate)).toBe(1);

      await repository.clearDay(date);

      expect(await repository.countTasksForDay(date)).toBe(0);
      expect(await repository.countTasksForDay(otherDate)).toBe(1);
    });
  });

  describe('countTasksForDay', () => {
    it('should count tasks selected for a specific day', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();

      expect(await repository.countTasksForDay(date)).toBe(0);

      await repository.addTaskToDay(date, taskId1);
      expect(await repository.countTasksForDay(date)).toBe(1);

      await repository.addTaskToDay(date, taskId2);
      expect(await repository.countTasksForDay(date)).toBe(2);

      await repository.addTaskToDay(date, taskId3);
      expect(await repository.countTasksForDay(date)).toBe(3);

      await repository.removeTaskFromDay(date, taskId2);
      expect(await repository.countTasksForDay(date)).toBe(2);
    });
  });

  describe('getLastSelectionDateForTask', () => {
    it('should return the most recent selection date for a task', async () => {
      const taskId = TaskId.generate();
      const date1 = new DateOnly('2024-01-15');
      const date2 = new DateOnly('2024-01-16');
      const date3 = new DateOnly('2024-01-17');

      await repository.addTaskToDay(date1, taskId);
      await repository.addTaskToDay(date2, taskId);
      await repository.addTaskToDay(date3, taskId);

      const lastDate = await repository.getLastSelectionDateForTask(taskId);
      expect(lastDate).toBeDefined();
      expect(lastDate!.value).toBe('2024-01-17');
    });

    it('should return null for task that was never selected', async () => {
      const taskId = TaskId.generate();

      const lastDate = await repository.getLastSelectionDateForTask(taskId);
      expect(lastDate).toBeNull();
    });
  });

  describe('unique constraint handling', () => {
    it('should handle UNIQUE(date, taskId) constraint properly', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      // Add task multiple times - should be idempotent
      await repository.addTaskToDay(date, taskId);
      await repository.addTaskToDay(date, taskId);
      await repository.addTaskToDay(date, taskId);

      const count = await repository.countTasksForDay(date);
      expect(count).toBe(1);

      const tasks = await repository.getTasksForDay(date);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].taskId.equals(taskId)).toBe(true);
      expect(tasks[0].date.equals(date)).toBe(true);
    });

    it('should allow same task on different dates', async () => {
      const taskId = TaskId.generate();
      const date1 = new DateOnly('2024-01-15');
      const date2 = new DateOnly('2024-01-16');

      await repository.addTaskToDay(date1, taskId);
      await repository.addTaskToDay(date2, taskId);

      expect(await repository.isTaskSelectedForDay(date1, taskId)).toBe(true);
      expect(await repository.isTaskSelectedForDay(date2, taskId)).toBe(true);
      expect(await repository.countTasksForDay(date1)).toBe(1);
      expect(await repository.countTasksForDay(date2)).toBe(1);
    });

    it('should allow different tasks on same date', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();

      await repository.addTaskToDay(date, taskId1);
      await repository.addTaskToDay(date, taskId2);

      expect(await repository.isTaskSelectedForDay(date, taskId1)).toBe(true);
      expect(await repository.isTaskSelectedForDay(date, taskId2)).toBe(true);
      expect(await repository.countTasksForDay(date)).toBe(2);
    });
  });

  describe('completion flag behavior', () => {
    it('should initialize completion flag as false when adding task', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);

      const tasks = await repository.getTasksForDay(date);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].completedFlag).toBe(false);

      const status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBe(false);
    });

    it('should preserve completion flag when task is re-added', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);
      await repository.markTaskCompleted(date, taskId, true);

      // Re-add the same task (should be idempotent)
      await repository.addTaskToDay(date, taskId);

      const status = await repository.getTaskCompletionStatus(date, taskId);
      expect(status).toBe(true); // Should preserve the completed status
    });
  });

  describe('soft delete behavior', () => {
    it('should exclude soft-deleted entries from getTasksForDay', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();

      await repository.addTaskToDay(date, taskId1);
      await repository.addTaskToDay(date, taskId2);

      expect(await repository.countTasksForDay(date)).toBe(2);

      // Soft delete one entry
      await repository.removeTaskFromDay(date, taskId1);

      const tasks = await repository.getTasksForDay(date);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].taskId.equals(taskId2)).toBe(true);
    });

    it('should exclude soft-deleted entries from isTaskSelectedForDay', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      await repository.addTaskToDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(true);

      await repository.removeTaskFromDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(false);
    });

    it('should exclude soft-deleted entries from countTasksForDay', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();

      await repository.addTaskToDay(date, taskId1);
      await repository.addTaskToDay(date, taskId2);
      await repository.addTaskToDay(date, taskId3);

      expect(await repository.countTasksForDay(date)).toBe(3);

      await repository.removeTaskFromDay(date, taskId1);
      expect(await repository.countTasksForDay(date)).toBe(2);

      await repository.removeTaskFromDay(date, taskId2);
      expect(await repository.countTasksForDay(date)).toBe(1);
    });

    it('should exclude soft-deleted entries from getDailySelectionsForRange', async () => {
      const date1 = new DateOnly('2024-01-15');
      const date2 = new DateOnly('2024-01-16');
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();
      const taskId3 = TaskId.generate();

      await repository.addTaskToDay(date1, taskId1);
      await repository.addTaskToDay(date1, taskId2);
      await repository.addTaskToDay(date2, taskId3);

      let selections = await repository.getDailySelectionsForRange(date1, date2);
      expect(selections).toHaveLength(3);

      // Soft delete one entry
      await repository.removeTaskFromDay(date1, taskId1);

      selections = await repository.getDailySelectionsForRange(date1, date2);
      expect(selections).toHaveLength(2);
      
      const taskIds = selections.map(s => s.taskId.value);
      expect(taskIds).toContain(taskId2.value);
      expect(taskIds).toContain(taskId3.value);
      expect(taskIds).not.toContain(taskId1.value);
    });

    it('should exclude soft-deleted entries from getLastSelectionDateForTask', async () => {
      const taskId = TaskId.generate();
      const date1 = new DateOnly('2024-01-15');
      const date2 = new DateOnly('2024-01-16');
      const date3 = new DateOnly('2024-01-17');

      await repository.addTaskToDay(date1, taskId);
      await repository.addTaskToDay(date2, taskId);
      await repository.addTaskToDay(date3, taskId);

      let lastDate = await repository.getLastSelectionDateForTask(taskId);
      expect(lastDate!.value).toBe('2024-01-17');

      // Soft delete the latest entry
      await repository.removeTaskFromDay(date3, taskId);

      lastDate = await repository.getLastSelectionDateForTask(taskId);
      expect(lastDate!.value).toBe('2024-01-16');

      // Soft delete all entries
      await repository.removeTaskFromDay(date1, taskId);
      await repository.removeTaskFromDay(date2, taskId);

      lastDate = await repository.getLastSelectionDateForTask(taskId);
      expect(lastDate).toBeNull();
    });

    it('should allow re-adding task after soft delete', async () => {
      const date = new DateOnly('2024-01-15');
      const taskId = TaskId.generate();

      // Add task
      await repository.addTaskToDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(true);

      // Soft delete
      await repository.removeTaskFromDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(false);

      // Re-add task (should create new entry)
      await repository.addTaskToDay(date, taskId);
      expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(true);
      expect(await repository.countTasksForDay(date)).toBe(1);
    });

    it('should soft delete all entries when clearing day', async () => {
       const date = new DateOnly('2024-01-15');
       const otherDate = new DateOnly('2024-01-16');
       const taskId1 = TaskId.generate();
       const taskId2 = TaskId.generate();
       const taskId3 = TaskId.generate();

       await repository.addTaskToDay(date, taskId1);
       await repository.addTaskToDay(date, taskId2);
       await repository.addTaskToDay(otherDate, taskId3);

       expect(await repository.countTasksForDay(date)).toBe(2);
       expect(await repository.countTasksForDay(otherDate)).toBe(1);

       await repository.clearDay(date);

       expect(await repository.countTasksForDay(date)).toBe(0);
       expect(await repository.countTasksForDay(otherDate)).toBe(1);
       expect(await repository.isTaskSelectedForDay(date, taskId1)).toBe(false);
       expect(await repository.isTaskSelectedForDay(date, taskId2)).toBe(false);
       expect(await repository.isTaskSelectedForDay(otherDate, taskId3)).toBe(true);
     });
   });

   describe('removeTaskFromAllDays', () => {
     it('should soft delete task from all daily selections', async () => {
       const taskId = TaskId.generate();
       const otherTaskId = TaskId.generate();
       const date1 = new DateOnly('2024-01-15');
       const date2 = new DateOnly('2024-01-16');
       const date3 = new DateOnly('2024-01-17');

       // Add task to multiple days
       await repository.addTaskToDay(date1, taskId);
       await repository.addTaskToDay(date2, taskId);
       await repository.addTaskToDay(date3, taskId);
       
       // Add other task to one day
       await repository.addTaskToDay(date1, otherTaskId);

       // Verify initial state
       expect(await repository.isTaskSelectedForDay(date1, taskId)).toBe(true);
       expect(await repository.isTaskSelectedForDay(date2, taskId)).toBe(true);
       expect(await repository.isTaskSelectedForDay(date3, taskId)).toBe(true);
       expect(await repository.isTaskSelectedForDay(date1, otherTaskId)).toBe(true);

       // Remove task from all days
       await repository.removeTaskFromAllDays(taskId);

       // Verify task is removed from all days
       expect(await repository.isTaskSelectedForDay(date1, taskId)).toBe(false);
       expect(await repository.isTaskSelectedForDay(date2, taskId)).toBe(false);
       expect(await repository.isTaskSelectedForDay(date3, taskId)).toBe(false);
       
       // Verify other task is not affected
       expect(await repository.isTaskSelectedForDay(date1, otherTaskId)).toBe(true);

       // Verify counts are updated
       expect(await repository.countTasksForDay(date1)).toBe(1); // Only otherTaskId
       expect(await repository.countTasksForDay(date2)).toBe(0);
       expect(await repository.countTasksForDay(date3)).toBe(0);

       // Verify getLastSelectionDateForTask returns null
       expect(await repository.getLastSelectionDateForTask(taskId)).toBeNull();
     });

     it('should handle removeTaskFromAllDays for non-existent task', async () => {
       const taskId = TaskId.generate();

       // Should not throw error
       await expect(repository.removeTaskFromAllDays(taskId)).resolves.not.toThrow();
     });

     it('should handle removeTaskFromAllDays for already soft-deleted task', async () => {
       const taskId = TaskId.generate();
       const date = new DateOnly('2024-01-15');

       await repository.addTaskToDay(date, taskId);
       await repository.removeTaskFromDay(date, taskId); // Soft delete

       // Should not throw error when removing already deleted task
       await expect(repository.removeTaskFromAllDays(taskId)).resolves.not.toThrow();
       
       // Should still be false
       expect(await repository.isTaskSelectedForDay(date, taskId)).toBe(false);
     });
  });
});