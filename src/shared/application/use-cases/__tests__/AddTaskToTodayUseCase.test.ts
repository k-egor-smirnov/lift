import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddTaskToTodayUseCase, AddTaskToTodayRequest } from '../AddTaskToTodayUseCase';
import { DailySelectionRepository } from '../../../domain/repositories/DailySelectionRepository';
import { TaskRepository } from '../../../domain/repositories/TaskRepository';
import { Task } from '../../../domain/entities/Task';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../domain/value-objects/NonEmptyTitle';
import { DateOnly } from '../../../domain/value-objects/DateOnly';
import { TaskCategory, TaskStatus } from '../../../domain/types';
import { ResultUtils } from '../../../domain/Result';

// Mock implementations
const mockDailySelectionRepository: DailySelectionRepository = {
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

const mockTaskRepository: TaskRepository = {
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

describe('AddTaskToTodayUseCase', () => {
  let useCase: AddTaskToTodayUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new AddTaskToTodayUseCase(mockDailySelectionRepository, mockTaskRepository);
  });

  describe('execute', () => {
    it('should add task to today successfully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: AddTaskToTodayRequest = {
        taskId: taskId.value
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockDailySelectionRepository.addTaskToDay).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockDailySelectionRepository.addTaskToDay).toHaveBeenCalledWith(
        DateOnly.today(),
        taskId
      );
    });

    it('should add task to specific date successfully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.FOCUS, TaskStatus.ACTIVE);
      const specificDate = '2024-01-15';
      
      const request: AddTaskToTodayRequest = {
        taskId: taskId.value,
        date: specificDate
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockDailySelectionRepository.addTaskToDay).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDailySelectionRepository.addTaskToDay).toHaveBeenCalledWith(
        DateOnly.fromString(specificDate),
        taskId
      );
    });

    it('should fail with invalid task ID', async () => {
      // Arrange
      const request: AddTaskToTodayRequest = {
        taskId: 'invalid-id'
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('INVALID_TASK_ID');
      }

      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
      expect(mockDailySelectionRepository.addTaskToDay).not.toHaveBeenCalled();
    });

    it('should fail when task not found', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: AddTaskToTodayRequest = {
        taskId: taskId.value
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(null);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('TASK_NOT_FOUND');
      }

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockDailySelectionRepository.addTaskToDay).not.toHaveBeenCalled();
    });

    it('should fail with invalid date format', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: AddTaskToTodayRequest = {
        taskId: taskId.value,
        date: 'invalid-date'
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('INVALID_DATE');
      }

      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
      expect(mockDailySelectionRepository.addTaskToDay).not.toHaveBeenCalled();
    });

    it('should handle repository failure', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE);
      
      const request: AddTaskToTodayRequest = {
        taskId: taskId.value
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockDailySelectionRepository.addTaskToDay).mockRejectedValue(new Error('Database error'));

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('ADD_FAILED');
        expect(result.error.message).toContain('Database error');
      }

      expect(mockDailySelectionRepository.addTaskToDay).toHaveBeenCalledTimes(1);
    });
  });
});