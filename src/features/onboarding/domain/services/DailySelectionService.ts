import { Task } from '../../../../shared/domain/entities/Task';
import { TaskRepository } from '../../../../shared/domain/repositories/TaskRepository';
import { DailySelectionRepository } from '../../../../shared/domain/repositories/DailySelectionRepository';
import { TaskId } from '../../../../shared/domain/value-objects/TaskId';
import { DateOnly } from '../../../../shared/domain/value-objects/DateOnly';
import { LogService } from '../../../../shared/application/services/LogService';

/**
 * Service for managing daily task selection integration
 */
export class DailySelectionService {
  constructor(
    private taskRepository: TaskRepository,
    private dailySelectionRepository: DailySelectionRepository,
    private logService: LogService
  ) {}

  /**
   * Add a task to today's selection from daily modal
   */
  async addTaskToToday(taskId: string): Promise<void> {
    try {
      const taskIdObj = new TaskId(taskId);
      const today = DateOnly.today();
      
      // Get the task to validate it exists
      const task = await this.taskRepository.findById(taskIdObj);
      if (!task) {
        throw new Error(`Task with id ${taskId} not found`);
      }

      // Add to daily selection
      await this.dailySelectionRepository.addTaskToDay(today, taskIdObj);

      // Log the action
      await this.logService.createLog(
        taskId,
        `Task "${task.title.value}" added to today from daily modal`
      );

      console.log(`Task "${task.title.value}" added to today from daily modal`);
    } catch (error) {
      console.error('Error adding task to today:', error);
      throw error;
    }
  }

  /**
   * Remove a task from today's selection
   */
  async removeTaskFromToday(taskId: string): Promise<void> {
    try {
      const taskIdObj = new TaskId(taskId);
      const today = DateOnly.today();
      
      // Get the task for logging
      const task = await this.taskRepository.findById(taskIdObj);
      
      // Remove from daily selection
      await this.dailySelectionRepository.removeTaskFromDay(today, taskIdObj);

      // Log the action
      await this.logService.createLog(
        taskId,
        `Task "${task?.title.value || 'Unknown'}" removed from today via daily modal`
      );

      console.log(`Task removed from today via daily modal`);
    } catch (error) {
      console.error('Error removing task from today:', error);
      throw error;
    }
  }

  /**
   * Check if a task is already in today's selection
   */
  async isTaskInToday(taskId: string): Promise<boolean> {
    try {
      const taskIdObj = new TaskId(taskId);
      const today = DateOnly.today();
      const todayTaskIds = await this.dailySelectionRepository.getTaskIdsForDay(today);
      return todayTaskIds.some(id => id.equals(taskIdObj));
    } catch (error) {
      console.error('Error checking if task is in today:', error);
      return false;
    }
  }

  /**
   * Get all tasks currently selected for today
   */
  async getTodayTasks(): Promise<Task[]> {
    try {
      const today = DateOnly.today();
      const taskIds = await this.dailySelectionRepository.getTaskIdsForDay(today);
      const tasks: Task[] = [];
      
      for (const taskId of taskIds) {
        const task = await this.taskRepository.findById(taskId);
        if (task) {
          tasks.push(task);
        }
      }
      
      return tasks;
    } catch (error) {
      console.error('Error getting today tasks:', error);
      return [];
    }
  }

  /**
   * Clear all selections for today
   * This should be called when a new day starts
   */
  async clearTodaySelection(): Promise<void> {
    try {
      const today = DateOnly.today();
      await this.dailySelectionRepository.clearDay(today);
      
      await this.logService.createLog(
        'system',
        `Daily selection cleared for ${today.value}`
      );

      console.log('Daily selection cleared for today');
    } catch (error) {
      console.error('Error clearing daily selection:', error);
      throw error;
    }
  }
}