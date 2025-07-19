import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateUserLogUseCase, CreateUserLogRequest } from '../CreateUserLogUseCase';
import { TodoDatabase, TaskLogRecord } from '../../../infrastructure/database/TodoDatabase';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { ResultUtils } from '../../../domain/Result';

// Mock database
const mockDatabase = {
  taskLogs: {
    add: vi.fn()
  }
} as unknown as TodoDatabase;

describe('CreateUserLogUseCase', () => {
  let useCase: CreateUserLogUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CreateUserLogUseCase(mockDatabase);
  });

  describe('execute', () => {
    it('should create user log with task ID', async () => {
      // Arrange
      const taskId = TaskId.generate();
      const message = 'Working on this task';
      const request: CreateUserLogRequest = {
        taskId: taskId.value,
        message,
        metadata: { priority: 'high' }
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDatabase.taskLogs.add).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: taskId.value,
          type: 'USER',
          message: message,
          metadata: { priority: 'high' }
        })
      );
    });

    it('should create custom log without task ID', async () => {
      // Arrange
      const message = 'General note about my work';
      const request: CreateUserLogRequest = {
        message,
        metadata: { category: 'general' }
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      expect(mockDatabase.taskLogs.add).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: undefined,
          type: 'USER',
          message: message,
          metadata: { category: 'general' }
        })
      );
    });

    it('should trim whitespace from message', async () => {
      // Arrange
      const message = '  Working on this task  ';
      const request: CreateUserLogRequest = {
        message
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock.calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe('Working on this task');
    });

    it('should fail with empty message', async () => {
      // Arrange
      const request: CreateUserLogRequest = {
        message: ''
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('EMPTY_MESSAGE');
        expect(result.error.message).toContain('cannot be empty');
      }

      expect(mockDatabase.taskLogs.add).not.toHaveBeenCalled();
    });

    it('should fail with whitespace-only message', async () => {
      // Arrange
      const request: CreateUserLogRequest = {
        message: '   '
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('EMPTY_MESSAGE');
      }

      expect(mockDatabase.taskLogs.add).not.toHaveBeenCalled();
    });

    it('should fail with message exceeding 500 characters', async () => {
      // Arrange
      const longMessage = 'a'.repeat(501);
      const request: CreateUserLogRequest = {
        message: longMessage
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('MESSAGE_TOO_LONG');
        expect(result.error.message).toContain('500 characters');
      }

      expect(mockDatabase.taskLogs.add).not.toHaveBeenCalled();
    });

    it('should accept message with exactly 500 characters', async () => {
      // Arrange
      const maxMessage = 'a'.repeat(500);
      const request: CreateUserLogRequest = {
        message: maxMessage
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock.calls[0][0] as TaskLogRecord;
      expect(addCall.message).toBe(maxMessage);
    });

    it('should fail with invalid task ID', async () => {
      // Arrange
      const request: CreateUserLogRequest = {
        taskId: 'invalid-id',
        message: 'Valid message'
      };

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('INVALID_TASK_ID');
      }

      expect(mockDatabase.taskLogs.add).not.toHaveBeenCalled();
    });

    it('should handle database failure', async () => {
      // Arrange
      const request: CreateUserLogRequest = {
        message: 'Valid message'
      };

      vi.mocked(mockDatabase.taskLogs.add).mockRejectedValue(new Error('Database error'));

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result)) {
        expect(result.error.code).toBe('CREATION_FAILED');
        expect(result.error.message).toContain('Database error');
      }
    });

    it('should include createdAt timestamp', async () => {
      // Arrange
      const request: CreateUserLogRequest = {
        message: 'Test message'
      };

      vi.mocked(mockDatabase.taskLogs.add).mockResolvedValue(1);

      // Act
      const result = await useCase.execute(request);

      // Assert
      expect(ResultUtils.isSuccess(result)).toBe(true);
      const addCall = vi.mocked(mockDatabase.taskLogs.add).mock.calls[0][0] as TaskLogRecord;
      expect(addCall.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getMaxMessageLength', () => {
    it('should return correct maximum message length', () => {
      // Act
      const maxLength = CreateUserLogUseCase.getMaxMessageLength();

      // Assert
      expect(maxLength).toBe(500);
    });
  });
});