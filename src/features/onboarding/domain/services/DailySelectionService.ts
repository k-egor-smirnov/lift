import { Task } from '../../../../shared/domain/entities/Task';
import { TaskRepository } from '../../../../shared/domain/repositories/TaskRepository';
import { DailySelectionRepository } from '../../../../shared/domain/repositories/DailySelectionRepository';
import { TaskId } from '../../../../shared/domain/value-objects/TaskId';
import { DateOnly } from '../../../../shared/domain/value-objects/DateOnly';
import { LogService } from '../../../../shared/application/services/LogService';
import { AddTaskToTodayUseCase } from '../../../../shared/application/use-cases/AddTaskToTodayUseCase';
import { RemoveTaskFromTodayUseCase } from '../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase';

/**
 * Service for managing daily task selection integration
 */
export class DailySelectionService {
  constructor(
    private taskRepository: TaskRepository,
    private dailySelectionRepository: DailySelectionRepository,
    private logService: LogService,
    private addTaskToTodayUseCase: AddTaskToTodayUseCase,
    private removeTaskFromTodayUseCase: RemoveTaskFromTodayUseCase
  ) {}

  /**
   * Add a task to today's selection from daily modal
   */
  async addTaskToToday(taskId: string): Promise<void> {
    try {
      const result = await this.addTaskToTodayUseCase.execute({ taskId });
      
      if (!result.success) {
        throw new Error(result.error.message);
      }

      // Get the task for logging
      const taskIdObj = new TaskId(taskId);
      const task = await this.taskRepository.findById(taskIdObj);
      
      if (task) {
        // Log the action
        await this.logService.createLog(
          taskId,
          `Task "${task.title.value}" added to today from daily modal`
        );
        console.log(`Task "${task.title.value}" added to today from daily modal`);
      }
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
      const result = await this.removeTaskFromTodayUseCase.execute({ taskId });
      
      if (!result.success) {
        throw new Error(result.error.message);
      }

      // Get the task for logging
      const taskIdObj = new TaskId(taskId);
      const task = await this.taskRepository.findById(taskIdObj);
      
      if (task) {
        // Log the action
        await this.logService.createLog(
          taskId,
          `Task "${task.title.value}" removed from today via daily modal`
        );
        console.log(`Task "${task.title.value}" removed from today via daily modal`);
      }
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