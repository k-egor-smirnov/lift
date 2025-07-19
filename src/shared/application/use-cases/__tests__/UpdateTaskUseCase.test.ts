import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateTaskUseCase, UpdateTaskRequest } from '../UpdateTaskUseCase';
import { TaskRepository } from '../../../domain/repositories/TaskRepository';
import { EventBus } from '../../../domain/events/EventBus';
import { Task } from '../../../domain/entities/Task';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../../domain/types';
import { ResultUtils } from '../../../domain/Result';

// Mock implementations
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

const mockEventBus: EventBus = {
  publish: vi.fn(),
  publishAll: vi.fn(),
  subscribe: vi.fn(),
  subscribeToAll: vi.fn(),
  clear: vi.fn()
};

describe('UpdateTaskUseCase', () => {
  let useCase: UpdateTaskUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new UpdateTaskUseCase(mockTaskRepository, mockEventBus);
  });

  describe('execute', () => {
    it('should update task title successfully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const originalTitle = NonEmptyTitle.fromString('Original Title');
      const task = new Task(taskId, originalTitle, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: 'Updated Title'
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.title.value).toBe('Updated Title');
      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);
      
      // Verify the event published
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock.calls[0][0];
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].eventType).toBe('TASK_TITLE_CHANGED');
    });

    it('should update task category successfully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        category: TaskCategory.FOCUS
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.category).toBe(TaskCategory.FOCUS);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);
      
      // Verify the events published (should include review event for INBOX -> other)
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock.calls[0][0];
      expect(publishedEvents.length).toBeGreaterThanOrEqual(1);
      expect(publishedEvents.some(e => e.eventType === 'TASK_CATEGORY_CHANGED')).toBe(true);
    });

    it('should update both title and category successfully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const originalTitle = NonEmptyTitle.fromString('Original Title');
      const task = new Task(taskId, originalTitle, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: 'Updated Title',
        category: TaskCategory.FOCUS
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.title.value).toBe('Updated Title');
      expect(task.category).toBe(TaskCategory.FOCUS);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);
      expect(mockEventBus.publishAll).toHaveBeenCalledTimes(1);
      
      // Verify both events published
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock.calls[0][0];
      expect(publishedEvents.length).toBe(2);
      expect(publishedEvents.some(e => e.eventType === 'TASK_TITLE_CHANGED')).toBe(true);
      expect(publishedEvents.some(e => e.eventType === 'TASK_CATEGORY_CHANGED')).toBe(true);
    });

    it('should fail with invalid task ID', async () => {
      // Arrange
      const request: UpdateTaskRequest = {
        taskId: 'invalid-id',
        title: 'New Title'
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('INVALID_TASK_ID');
      }

      expect(mockTaskRepository.findById).not.toHaveBeenCalled();
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it('should fail when task not found', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: 'New Title'
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
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it('should fail with empty title', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: ''
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('INVALID_TITLE');
        expect(result.error.message).toContain('title cannot be empty');
      }

      expect(mockTaskRepository.findById).toHaveBeenCalledWith(taskId);
      expect(mockTaskRepository.save).not.toHaveBeenCalled();
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it('should handle no changes gracefully', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: 'Test Task', // Same title
        category: TaskCategory.SIMPLE // Same category
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockTaskRepository.save).toHaveBeenCalledWith(task);
      
      // Should not publish events for no changes
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it('should handle repository save failure', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Test Task');
      const task = new Task(taskId, title, TaskCategory.SIMPLE, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        title: 'Updated Title'
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockRejectedValue(new Error('Database error'));

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('UPDATE_FAILED');
        expect(result.error.message).toContain('Database error');
      }

      expect(mockTaskRepository.save).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publishAll).not.toHaveBeenCalled();
    });

    it('should handle INBOX to other category transition with review event', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const title = NonEmptyTitle.fromString('Inbox Task');
      const task = new Task(taskId, title, TaskCategory.INBOX, TaskStatus.ACTIVE);
      
      const request: UpdateTaskRequest = {
        taskId: taskId.value,
        category: TaskCategory.SIMPLE
      };

      vi.mocked(mockTaskRepository.findById).mockResolvedValue(task);
      vi.mocked(mockTaskRepository.save).mockResolvedValue(undefined);
      vi.mocked(mockEventBus.publishAll).mockResolvedValue(undefined);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(task.wasEverReviewed).toBe(true);
      
      // Should publish both review and category change events
      const publishedEvents = vi.mocked(mockEventBus.publishAll).mock.calls[0][0];
      expect(publishedEvents.length).toBe(2);
      expect(publishedEvents.some(e => e.eventType === 'TASK_REVIEWED')).toBe(true);
      expect(publishedEvents.some(e => e.eventType === 'TASK_CATEGORY_CHANGED')).toBe(true);
    });
  });
});