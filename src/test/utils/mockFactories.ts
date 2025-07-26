import { vi, expect } from 'vitest';
import { Task } from '../../shared/domain/entities/Task';
import { TaskId } from '../../shared/domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../shared/domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../shared/domain/types';
import { TaskRepository } from '../../shared/domain/repositories/TaskRepository';
import { EventBus } from '../../shared/domain/events/EventBus';
import { TodoDatabase } from '../../shared/infrastructure/database/TodoDatabase';
import { DailySelectionRepository } from '../../shared/domain/repositories/DailySelectionRepository';
import { UserSettingsRepository } from '../../shared/domain/repositories/UserSettingsRepository';

// Type for mocked objects
type MockedObject<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? ReturnType<typeof vi.fn> : T[K];
};

/**
 * Factory for creating mock Task entities
 */
export const createMockTask = (overrides: Partial<{
  id: TaskId;
  title: NonEmptyTitle;
  category: TaskCategory;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  inboxEnteredAt?: Date;
}> = {}): Task => {
  const defaults = {
    id: TaskId.generate(),
    title: NonEmptyTitle.fromString('Test Task'),
    category: TaskCategory.SIMPLE,
    status: TaskStatus.ACTIVE,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    deletedAt: undefined,
    inboxEnteredAt: undefined,
  };

  const merged = { ...defaults, ...overrides };
  return new Task(
    merged.id,
    merged.title,
    merged.category,
    merged.status,
    merged.createdAt.getTime(),
    merged.createdAt,
    merged.updatedAt,
    merged.deletedAt,
    merged.inboxEnteredAt
  );
};

/**
 * Factory for creating mock TaskRepository
 */
export const createMockTaskRepository = (): MockedObject<TaskRepository> => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  findByCategory: vi.fn(),
  findByStatus: vi.fn(),
  findByCategoryAndStatus: vi.fn(),
  findOverdueTasks: vi.fn(),
  save: vi.fn(),
  saveMany: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  count: vi.fn(),
  countByCategory: vi.fn(),
});

/**
 * Factory for creating mock EventBus
 */
export const createMockEventBus = (): MockedObject<EventBus> => ({
  publish: vi.fn(),
  publishAll: vi.fn(),
  subscribe: vi.fn(),
  subscribeToAll: vi.fn(),
  clear: vi.fn(),
});

/**
 * Factory for creating mock TodoDatabase
 */
export const createMockDatabase = (): MockedObject<TodoDatabase> => {
  const mockDb = {
    transaction: vi.fn(),
    tasks: {
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(),
      toArray: vi.fn(),
      count: vi.fn(),
    },
    dailySelections: {
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(),
      toArray: vi.fn(),
    },
    taskLogs: {
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(),
      toArray: vi.fn(),
      count: vi.fn(),
      reverse: vi.fn(),
      offset: vi.fn(),
      limit: vi.fn(),
    },
    userSettings: {
      add: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      where: vi.fn(),
      toArray: vi.fn(),
    },
  } as any;

  // Mock transaction to execute callback immediately
  mockDb.transaction.mockImplementation(async (mode: any, tables: any, callback: any) => {
    return await callback();
  });

  return mockDb;
};

/**
 * Factory for creating mock DailySelectionRepository
 */
export const createMockDailySelectionRepository = (): MockedObject<DailySelectionRepository> => ({
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
  getLastSelectionDateForTask: vi.fn(),
});

/**
 * Factory for creating mock UserSettingsRepository
 */
export const createMockUserSettingsRepository = (): MockedObject<UserSettingsRepository> => ({
  get: vi.fn(),
  set: vi.fn(),
  getMany: vi.fn(),
  setMany: vi.fn(),
  has: vi.fn(),
  remove: vi.fn(),
  getAll: vi.fn(),
  clear: vi.fn(),
});

/**
 * Common test data generators
 */
export const testData = {
  /**
   * Generate a valid task ID
   */
  taskId: () => TaskId.generate(),

  /**
   * Generate a valid task title
   */
  taskTitle: (title = 'Test Task') => NonEmptyTitle.fromString(title),

  /**
   * Generate a date for testing
   */
  date: (dateString = '2023-01-01') => new Date(dateString),

  /**
   * Generate multiple mock tasks
   */
  tasks: (count: number, overrides: Partial<Parameters<typeof createMockTask>[0]> = {}) => {
    return Array.from({ length: count }, (_, index) => 
      createMockTask({
        title: NonEmptyTitle.fromString(`Test Task ${index + 1}`),
        ...overrides,
      })
    );
  },
};

/**
 * Common test assertions and utilities
 */
export const testUtils = {
  /**
   * Assert that a mock was called with specific arguments
   */
  expectCalledWith: (mockFn: any, ...args: any[]) => {
    expect(mockFn).toHaveBeenCalledWith(...args);
  },

  /**
   * Assert that a mock was called a specific number of times
   */
  expectCalledTimes: (mockFn: any, times: number) => {
    expect(mockFn).toHaveBeenCalledTimes(times);
  },

  /**
   * Reset all mocks in an object
   */
  resetMocks: (mockObject: Record<string, any>) => {
    Object.values(mockObject).forEach(mock => {
      if (vi.isMockFunction(mock)) {
        mock.mockReset();
      }
    });
  },
};