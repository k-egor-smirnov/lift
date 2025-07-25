import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { OnboardingService } from '../OnboardingService';
import { TaskRepository } from '../../../../../shared/domain/repositories/TaskRepository';
import { DailySelectionRepository } from '../../../../../shared/domain/repositories/DailySelectionRepository';
import { LogService } from '../../../../../shared/application/services/LogService';
import { Task } from '../../../../../shared/domain/entities/Task';
import { TaskId } from '../../../../../shared/domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../../../shared/domain/value-objects/NonEmptyTitle';
import { DateOnly } from '../../../../../shared/domain/value-objects/DateOnly';
import { TaskCategory, TaskStatus } from '../../../../../shared/domain/types';

// Mock repositories
const mockTaskRepository: jest.Mocked<TaskRepository> = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findByCategoryAndStatus: vi.fn(),
  findOverdueTasks: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  countByCategory: vi.fn(),
  exists: vi.fn()
};

const mockDailySelectionRepository: jest.Mocked<DailySelectionRepository> = {
  addTaskToDay: vi.fn(),
  removeTaskFromDay: vi.fn(),
  getTasksForDay: vi.fn(),
  getTaskIdsForDay: vi.fn(),
  isTaskSelectedForDay: vi.fn(),
  markTaskCompleted: vi.fn(),
  getTaskCompletionStatus: vi.fn(),
  getDailySelectionsForRange: vi.fn(),
  clearDay: vi.fn(),
  countTasksForDay: vi.fn(),
  getLastSelectionDateForTask: vi.fn()
};

const mockLogService: jest.Mocked<LogService> = {
  createLog: vi.fn(),
  getLogs: vi.fn(),
  getLogsByType: vi.fn(),
  getLogsByDateRange: vi.fn(),
  clearLogs: vi.fn(),
  clearLogsByType: vi.fn()
};

describe('OnboardingService', () => {
  let onboardingService: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    onboardingService = new OnboardingService(
      mockTaskRepository,
      mockDailySelectionRepository,
      mockLogService
    );
  });

  describe('isInMorningWindow', () => {
    it('should return true when current time is in morning window (6-11 AM)', () => {
      // Mock 9 AM
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T09:00:00'));

      const result = onboardingService.isInMorningWindow();
      expect(result).toBe(true);
      
      vi.useRealTimers();
    });

    it('should return false when current time is before morning window', () => {
      // Mock 5 AM
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T05:00:00'));

      const result = onboardingService.isInMorningWindow();
      expect(result).toBe(false);
      
      vi.useRealTimers();
    });

    it('should return false when current time is after morning window', () => {
      // Mock 12 PM
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T12:00:00'));

      const result = onboardingService.isInMorningWindow();
      expect(result).toBe(false);
      
      vi.useRealTimers();
    });

    it('should return false at exactly 11 AM (end of window)', () => {
      // Mock 11 AM
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T11:00:00'));

      const result = onboardingService.isInMorningWindow();
      expect(result).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('getRandomMotivationalMessage', () => {
    it('should return a motivational message', () => {
      const message = onboardingService.getRandomMotivationalMessage();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return different messages on multiple calls', () => {
      const messages = new Set();
      for (let i = 0; i < 20; i++) {
        messages.add(onboardingService.getRandomMotivationalMessage());
      }
      // Should have at least 2 different messages in 20 calls
      expect(messages.size).toBeGreaterThan(1);
    });
  });

  describe('getUnfinishedTasksFromYesterday', () => {
    it('should return unfinished active tasks from yesterday', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T10:00:00'));
      
      const yesterday = DateOnly.yesterday();
      const taskId = TaskId.generate();
      const task = new Task(
        taskId,
        new NonEmptyTitle('Test Task'),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE,
        new Date(),
        new Date()
      );

      // Mock daily selection entry (not completed)
      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([
        {
          date: yesterday,
          taskId: taskId,
          completedFlag: false,
          createdAt: new Date()
        }
      ]);

      // Mock task repository
      mockTaskRepository.findById.mockResolvedValue(task);

      const result = await onboardingService.getUnfinishedTasksFromYesterday();

      expect(mockDailySelectionRepository.getTasksForDay).toHaveBeenCalledWith(yesterday);
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(task);
      
      vi.useRealTimers();
    });

    it('should not return completed tasks from yesterday', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T10:00:00'));
      
      const yesterday = DateOnly.yesterday();
      const taskId = TaskId.generate();

      // Mock daily selection entry (completed)
      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([
        {
          date: yesterday,
          taskId: taskId,
          completedFlag: true,
          createdAt: new Date()
        }
      ]);

      const result = await onboardingService.getUnfinishedTasksFromYesterday();

      expect(mockDailySelectionRepository.getTasksForDay).toHaveBeenCalledWith(yesterday);
      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
      
      vi.useRealTimers();
    });

    it('should not return deleted or completed tasks', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T10:00:00'));
      
      const yesterday = DateOnly.yesterday();
      const taskId = TaskId.generate();
      const deletedTask = new Task(
        taskId,
        new NonEmptyTitle('Deleted Task'),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date(),
        new Date() // deletedAt
      );

      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([
        {
          date: yesterday,
          taskId: taskId,
          completedFlag: false,
          createdAt: new Date()
        }
      ]);

      mockTaskRepository.findById.mockResolvedValue(deletedTask);

      const result = await onboardingService.getUnfinishedTasksFromYesterday();

      expect(result).toHaveLength(0);
      
      vi.useRealTimers();
    });
  });

  describe('getOverdueInboxTasks', () => {
    it('should return overdue inbox tasks', async () => {
      const overdueTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Overdue Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date(),
        new Date(),
        undefined,
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
      );

      mockTaskRepository.findOverdueTasks.mockResolvedValue([overdueTask]);

      const result = await onboardingService.getOverdueInboxTasks(3);

      expect(mockTaskRepository.findOverdueTasks).toHaveBeenCalledWith(3);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(overdueTask);
    });
  });

  describe('getRegularInboxTasks', () => {
    it('should return regular inbox tasks', async () => {
      const regularTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Regular Inbox Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date(),
        undefined,
        new Date() // inboxEnteredAt - recent date
      );

      mockTaskRepository.findByCategoryAndStatus.mockResolvedValue([regularTask]);

      const result = await onboardingService.getRegularInboxTasks();

      expect(mockTaskRepository.findByCategoryAndStatus).toHaveBeenCalledWith(TaskCategory.INBOX, TaskStatus.ACTIVE);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(regularTask);
    });

    it('should filter out overdue tasks', async () => {
      const regularTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Regular Inbox Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date(),
        new Date()
      );

      const overdueTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Overdue Inbox Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date(),
        undefined,
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) // 4 days ago
      );

      mockTaskRepository.findByCategoryAndStatus.mockResolvedValue([regularTask, overdueTask]);

      const result = await onboardingService.getRegularInboxTasks();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(regularTask);
    });
  });

  describe('aggregateDailyModalData', () => {
    it('should aggregate all data for the daily modal', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T09:00:00'));
      
      const unfinishedTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Unfinished Task'),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date()
      );

      const overdueTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Overdue Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date(),
        undefined,
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
      );

      const regularInboxTask = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Regular Inbox Task'),
        TaskCategory.INBOX,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date(),
        undefined,
        new Date()
      );

      // Mock yesterday's unfinished tasks
      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([
        {
          date: DateOnly.yesterday(),
          taskId: unfinishedTask.id,
          completedFlag: false,
          createdAt: new Date()
        }
      ]);
      mockTaskRepository.findById.mockResolvedValue(unfinishedTask);

      // Mock overdue tasks
      mockTaskRepository.findOverdueTasks.mockResolvedValue([overdueTask]);
      
      // Mock regular inbox tasks
      mockTaskRepository.findByCategoryAndStatus.mockResolvedValue([regularInboxTask]);

      const result = await onboardingService.aggregateDailyModalData(3);

      expect(result.unfinishedTasks).toHaveLength(1);
      expect(result.overdueInboxTasks).toHaveLength(1);
      expect(result.regularInboxTasks).toHaveLength(1);
      expect(result.shouldShow).toBe(true);
      expect(typeof result.motivationalMessage).toBe('string');
      expect(result.date).toBe(DateOnly.today().value);
      
      vi.useRealTimers();
    });

    it('should not show modal outside morning window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T15:00:00'));

      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([]);
      mockTaskRepository.findOverdueTasks.mockResolvedValue([]);

      const result = await onboardingService.aggregateDailyModalData(3);

      expect(result.shouldShow).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('shouldShowDailyModal', () => {
    it('should return true when in morning window and has content', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T09:00:00'));

      const task = new Task(
        TaskId.generate(),
        new NonEmptyTitle('Task'),
        TaskCategory.SIMPLE,
        TaskStatus.ACTIVE,
        new Date().getTime(),
        new Date(),
        new Date()
      );

      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([
        {
          date: DateOnly.yesterday(),
          taskId: task.id,
          completedFlag: false,
          createdAt: new Date()
        }
      ]);
      mockTaskRepository.findById.mockResolvedValue(task);
      mockTaskRepository.findOverdueTasks.mockResolvedValue([]);

      const result = await onboardingService.shouldShowDailyModal(3);

      expect(result).toBe(true);
      
      vi.useRealTimers();
    });

    it('should return false when not in morning window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T15:00:00'));

      const result = await onboardingService.shouldShowDailyModal(3);

      expect(result).toBe(false);
      
      vi.useRealTimers();
    });

    it('should return false when no content to show', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-02T09:00:00'));

      mockDailySelectionRepository.getTasksForDay.mockResolvedValue([]);
      mockTaskRepository.findOverdueTasks.mockResolvedValue([]);
      mockTaskRepository.findByCategoryAndStatus.mockResolvedValue([]);

      const result = await onboardingService.shouldShowDailyModal(3);

      expect(result).toBe(false);
      
      vi.useRealTimers();
    });
  });
});