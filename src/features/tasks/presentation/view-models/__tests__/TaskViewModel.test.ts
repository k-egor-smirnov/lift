import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ulid } from 'ulid';
import { Task } from '../../../../../shared/domain/entities/Task';
import { TaskId } from '../../../../../shared/domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../../../shared/domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../../../../shared/domain/types';
import { TaskRepository } from '../../../../../shared/domain/repositories/TaskRepository';
import { CreateTaskUseCase } from '../../../../../shared/application/use-cases/CreateTaskUseCase';
import { UpdateTaskUseCase } from '../../../../../shared/application/use-cases/UpdateTaskUseCase';
import { CompleteTaskUseCase } from '../../../../../shared/application/use-cases/CompleteTaskUseCase';
import { GetTodayTasksUseCase } from '../../../../../shared/application/use-cases/GetTodayTasksUseCase';
import { ResultUtils } from '../../../../../shared/domain/Result';
import { createTaskViewModel, TaskViewModelDependencies } from '../TaskViewModel';

// Mock Date to ensure consistent test results
vi.useFakeTimers();
vi.setSystemTime(new Date('2023-12-01T00:00:00.000Z'));

// Mock dependencies
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

const mockCreateTaskUseCase: CreateTaskUseCase = {
  execute: vi.fn(),
} as any;

const mockUpdateTaskUseCase: UpdateTaskUseCase = {
  execute: vi.fn(),
} as any;

const mockCompleteTaskUseCase: CompleteTaskUseCase = {
  execute: vi.fn(),
} as any;

const mockGetTodayTasksUseCase: GetTodayTasksUseCase = {
  execute: vi.fn(),
} as any;

const dependencies: TaskViewModelDependencies = {
  taskRepository: mockTaskRepository,
  createTaskUseCase: mockCreateTaskUseCase,
  updateTaskUseCase: mockUpdateTaskUseCase,
  completeTaskUseCase: mockCompleteTaskUseCase,
  getTodayTasksUseCase: mockGetTodayTasksUseCase,
};

// Helper function to create test tasks
const createTestTask = (
  title: string,
  category: TaskCategory,
  status: TaskStatus = TaskStatus.ACTIVE,
  createdDaysAgo: number = 0
): Task => {
  // Use fixed date from mock (2023-12-01) instead of current date
  const createdAt = new Date('2023-12-01T12:00:00Z');
  createdAt.setDate(createdAt.getDate() - createdDaysAgo);
  
  return new Task(
    TaskId.fromString(ulid()),
    NonEmptyTitle.fromString(title),
    category,
    status,
    createdAt.getTime(), // order parameter should be number
    createdAt,
    createdAt,
    undefined,
    category === TaskCategory.INBOX ? createdAt : undefined
  );
};

describe('TaskViewModel', () => {
  let viewModel: ReturnType<typeof createTaskViewModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    viewModel = createTaskViewModel(dependencies);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = viewModel.getState();
      
      expect(state.tasks).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.filter).toEqual({});
      expect(state.overdueDays).toBe(3);
    });
  });

  describe('loadTasks', () => {
    it('should load tasks successfully', async () => {
      const mockTasks = [
        createTestTask('Task 1', TaskCategory.SIMPLE),
        createTestTask('Task 2', TaskCategory.FOCUS),
      ];

      vi.mocked(mockTaskRepository.findAll).mockResolvedValue(mockTasks);

      await viewModel.getState().loadTasks();

      const state = viewModel.getState();
      expect(state.tasks).toEqual(mockTasks);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
    });

    it('should handle loading error', async () => {
      const error = new Error('Database error');
      vi.mocked(mockTaskRepository.findAll).mockRejectedValue(error);

      await viewModel.getState().loadTasks();

      const state = viewModel.getState();
      expect(state.tasks).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Database error');
    });

    it('should set loading state during operation', async () => {
      let resolvePromise: (value: Task[]) => void;
      const promise = new Promise<Task[]>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(mockTaskRepository.findAll).mockReturnValue(promise);

      const loadPromise = viewModel.getState().loadTasks();
      
      // Check loading state is true during operation
      expect(viewModel.getState().loading).toBe(true);

      resolvePromise!([]);
      await loadPromise;

      // Check loading state is false after operation
      expect(viewModel.getState().loading).toBe(false);
    });
  });

  describe('createTask', () => {
    it('should create task successfully', async () => {
      const request = { title: 'New Task', category: TaskCategory.SIMPLE };
      const mockResponse = { taskId: 'new-task-id' };

      vi.mocked(mockCreateTaskUseCase.execute).mockResolvedValue(
        ResultUtils.ok(mockResponse)
      );
      vi.mocked(mockTaskRepository.findAll).mockResolvedValue([]);

      const result = await viewModel.getState().createTask(request);

      expect(result).toBe(true);
      expect(mockCreateTaskUseCase.execute).toHaveBeenCalledWith(request);
      expect(mockTaskRepository.findAll).toHaveBeenCalled(); // loadTasks called
    });

    it('should handle creation error', async () => {
      const request = { title: 'New Task', category: TaskCategory.SIMPLE };
      const error = { message: 'Creation failed', code: 'CREATION_FAILED' };

      vi.mocked(mockCreateTaskUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().createTask(request);

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe('Creation failed');
    });
  });

  describe('completeTask', () => {
    it('should complete task successfully', async () => {
      const taskId = 'task-1';

      vi.mocked(mockCompleteTaskUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );
      vi.mocked(mockTaskRepository.findAll).mockResolvedValue([]);

      const result = await viewModel.getState().completeTask(taskId);

      expect(result).toBe(true);
      expect(mockCompleteTaskUseCase.execute).toHaveBeenCalledWith({ taskId });
      expect(mockTaskRepository.findAll).toHaveBeenCalled(); // loadTasks called
    });

    it('should handle completion error', async () => {
      const taskId = 'task-1';
      const error = { message: 'Completion failed', code: 'COMPLETION_FAILED' };

      vi.mocked(mockCompleteTaskUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().completeTask(taskId);

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe('Completion failed');
    });
  });

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      const request = { taskId: 'task-1', title: 'Updated Task' };

      vi.mocked(mockUpdateTaskUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );
      vi.mocked(mockTaskRepository.findAll).mockResolvedValue([]);

      const result = await viewModel.getState().updateTask(request);

      expect(result).toBe(true);
      expect(mockUpdateTaskUseCase.execute).toHaveBeenCalledWith(request);
      expect(mockTaskRepository.findAll).toHaveBeenCalled(); // loadTasks called
    });
  });

  describe('Computed Properties', () => {
    let mockTasks: Task[];

    beforeEach(() => {
      mockTasks = [
        createTestTask('Simple Task', TaskCategory.SIMPLE, TaskStatus.ACTIVE),
        createTestTask('Focus Task', TaskCategory.FOCUS, TaskStatus.ACTIVE),
        createTestTask('Inbox Task', TaskCategory.INBOX, TaskStatus.ACTIVE),
        createTestTask('Completed Task', TaskCategory.SIMPLE, TaskStatus.COMPLETED),
        createTestTask('Overdue Inbox', TaskCategory.INBOX, TaskStatus.ACTIVE, 5), // 5 days old
      ];

      // Set tasks directly for testing computed properties using the store's setState method
      const store = viewModel as any;
      store.setState({ tasks: mockTasks });
    });

    describe('getFilteredTasks', () => {
      it('should return all active tasks when no filter is applied', () => {
        const state = viewModel.getState();
        const filtered = state.getFilteredTasks();
        
        expect(filtered).toHaveLength(4); // Excludes completed task
        expect(filtered.every(task => task.isActive)).toBe(true);
      });

      it('should filter by category', () => {
        viewModel.getState().setFilter({ category: TaskCategory.SIMPLE });
        
        const state = viewModel.getState();
        const filtered = state.getFilteredTasks();
        
        expect(filtered).toHaveLength(1);
        expect(filtered[0].category).toBe(TaskCategory.SIMPLE);
        expect(filtered[0].status).toBe(TaskStatus.ACTIVE);
      });

      it('should filter by status', () => {
        viewModel.getState().setFilter({ status: TaskStatus.COMPLETED });
        
        const state = viewModel.getState();
        const filtered = state.getFilteredTasks();
        
        expect(filtered).toHaveLength(0); // No completed tasks in active filter
      });

      it('should filter overdue tasks', () => {
        viewModel.getState().setFilter({ showOverdue: true });
        
        const state = viewModel.getState();
        const filtered = state.getFilteredTasks();
        
        expect(filtered).toHaveLength(1);
        expect(filtered[0].category).toBe(TaskCategory.INBOX);
        expect(filtered[0].isOverdue(3)).toBe(true);
      });
    });

    describe('getTasksByCategory', () => {
      it('should group active tasks by category', () => {
        const state = viewModel.getState();
        const grouped = state.getTasksByCategory();
        
        expect(grouped[TaskCategory.SIMPLE]).toHaveLength(1);
        expect(grouped[TaskCategory.FOCUS]).toHaveLength(1);
        expect(grouped[TaskCategory.INBOX]).toHaveLength(2);
      });
    });

    describe('getOverdueTasks', () => {
      it('should return overdue inbox tasks', () => {
        const state = viewModel.getState();
        const overdue = state.getOverdueTasks();
        
        expect(overdue).toHaveLength(1);
        expect(overdue[0].category).toBe(TaskCategory.INBOX);
        expect(overdue[0].isOverdue(3)).toBe(true);
      });

      it('should respect overdueDays setting', () => {
        viewModel.getState().setOverdueDays(10); // Increase threshold
        
        const state = viewModel.getState();
        const overdue = state.getOverdueTasks();
        
        expect(overdue).toHaveLength(0); // No tasks are 10+ days old
      });
    });

    describe('getOverdueCount', () => {
      it('should return count of overdue tasks', () => {
        const state = viewModel.getState();
        
        expect(state.getOverdueCount()).toBe(1);
      });
    });
  });

  describe('Filter Management', () => {
    it('should set filter correctly', () => {
      const filter = { category: TaskCategory.FOCUS, showOverdue: true };
      
      viewModel.getState().setFilter(filter);
      
      expect(viewModel.getState().filter).toEqual(filter);
    });

    it('should set overdue days correctly', () => {
      viewModel.getState().setOverdueDays(7);
      
      expect(viewModel.getState().overdueDays).toBe(7);
    });
  });

  describe('Error Management', () => {
    it('should clear error', () => {
      const store = viewModel as any;
      store.setState({ error: 'Some error' });
      
      viewModel.getState().clearError();
      
      expect(viewModel.getState().error).toBe(null);
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      const task = createTestTask('Test Task', TaskCategory.SIMPLE);
      const store = viewModel as any;
      store.setState({ tasks: [task] });

      vi.mocked(mockTaskRepository.save).mockResolvedValue();
      vi.mocked(mockTaskRepository.findAll).mockResolvedValue([]);

      const result = await viewModel.getState().deleteTask(task.id.value);

      expect(result).toBe(true);
      expect(mockTaskRepository.save).toHaveBeenCalled();
      expect(mockTaskRepository.findAll).toHaveBeenCalled(); // loadTasks called
    });

    it('should handle delete error when task not found', async () => {
      const store = viewModel as any;
      store.setState({ tasks: [] });

      const result = await viewModel.getState().deleteTask('non-existent');

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe('Task not found');
    });
  });

  describe('getTodayTaskIds', () => {
    it('should return today task ids successfully', async () => {
      const expectedTaskIds = ['task-1', 'task-2', 'task-3'];
      const mockTasks = expectedTaskIds.map(id => 
        createTestTask(`Task ${id}`, TaskCategory.SIMPLE)
      );
      // Override the task IDs to match expected values
      mockTasks.forEach((task, index) => {
        (task as any).id = { value: expectedTaskIds[index] };
      });
      
      const mockResponse = {
        tasks: mockTasks.map(task => ({
          task,
          completedInSelection: false,
          selectedAt: new Date()
        })),
        date: '2024-01-01',
        totalCount: 3,
        completedCount: 0,
        activeCount: 3
      };

      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok(mockResponse)
      );

      const result = await viewModel.getState().getTodayTaskIds();

      expect(result).toEqual(expectedTaskIds);
      expect(mockGetTodayTasksUseCase.execute).toHaveBeenCalled();
    });

    it('should handle error when getting today task ids', async () => {
      const error = { message: 'Failed to get today tasks', code: 'GET_TODAY_TASKS_FAILED' };

      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().getTodayTaskIds();

      expect(result).toEqual([]);
      expect(viewModel.getState().error).toBe('Failed to get today tasks');
    });
  });
});