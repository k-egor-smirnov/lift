import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClearDeletedTasksUseCase } from '../ClearDeletedTasksUseCase';
import { TaskRepository } from '../../../domain/repositories/TaskRepository';
import { EventBus } from '../../../domain/events/EventBus';
import { TodoDatabase } from '../../../infrastructure/database/TodoDatabase';
import { DebouncedSyncService } from '../../services/DebouncedSyncService';
import { Task } from '../../../domain/entities/Task';
import { TaskId } from '../../../domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../../domain/types';
import { ResultUtils } from '../../../domain/Result';

const mockTaskRepository: TaskRepository = {
  findById: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findByCategoryAndStatus: vi.fn(),
  findOverdueTasks: vi.fn(),
  findDeleted: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  countByCategory: vi.fn(),
  exists: vi.fn(),
};

const mockEventBus: EventBus = {
  publish: vi.fn(),
  publishAll: vi.fn(),
  subscribe: vi.fn(),
  subscribeToAll: vi.fn(),
  clear: vi.fn(),
};

const mockDatabase = {
  transaction: vi.fn(),
  tasks: {},
  syncQueue: { add: vi.fn() },
  eventStore: {},
  dailySelectionEntries: {},
} as unknown as TodoDatabase;

const mockDebouncedSync = {
  triggerSync: vi.fn(),
} as unknown as DebouncedSyncService;

describe('ClearDeletedTasksUseCase', () => {
  let useCase: ClearDeletedTasksUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockDatabase.transaction).mockImplementation(async (mode, tables, cb) => {
      return await cb();
    });
    useCase = new ClearDeletedTasksUseCase(
      mockTaskRepository,
      mockEventBus,
      mockDatabase,
      mockDebouncedSync
    );
  });

  it('should delete all soft-deleted tasks', async () => {
    const taskId = TaskId.generate();
    const task = new Task(
      taskId,
      NonEmptyTitle.fromString('Test'),
      TaskCategory.SIMPLE,
      TaskStatus.ACTIVE,
      Date.now(),
      new Date(),
      new Date(),
      new Date()
    );
    vi.mocked(mockTaskRepository.findDeleted).mockResolvedValue([task]);
    vi.mocked(mockTaskRepository.delete).mockResolvedValue();

    const result = await useCase.execute();

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(mockTaskRepository.delete).toHaveBeenCalledWith(taskId);
  });
});
