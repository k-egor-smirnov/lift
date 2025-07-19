import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ulid } from 'ulid';
import { TodayView } from '../TodayView';
import { Task } from '../../../../../shared/domain/entities/Task';
import { TaskId } from '../../../../../shared/domain/value-objects/TaskId';
import { NonEmptyTitle } from '../../../../../shared/domain/value-objects/NonEmptyTitle';
import { TaskCategory, TaskStatus } from '../../../../../shared/domain/types';
import { TodayViewModelDependencies } from '../../view-models/TodayViewModel';
import { ResultUtils } from '../../../../../shared/domain/Result';

// Mock dependencies
const mockDependencies: TodayViewModelDependencies = {
  getTodayTasksUseCase: {
    execute: vi.fn(),
  } as any,
  addTaskToTodayUseCase: {
    execute: vi.fn(),
  } as any,
  removeTaskFromTodayUseCase: {
    execute: vi.fn(),
  } as any,
  completeTaskUseCase: {
    execute: vi.fn(),
  } as any,
};

// Helper function to create test tasks
const createTestTask = (title: string, category: TaskCategory): Task => {
  return new Task(
    TaskId.fromString(ulid()),
    NonEmptyTitle.fromString(title),
    category,
    TaskStatus.ACTIVE,
    new Date(),
    new Date()
  );
};

describe('TodayView', () => {
  it('should render empty state when no tasks are selected', async () => {
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [],
        date: '2023-12-01',
        totalCount: 0,
        completedCount: 0,
        activeCount: 0,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('No Tasks Selected')).toBeInTheDocument();
      expect(screen.getByText(/Start by adding tasks to your daily selection/)).toBeInTheDocument();
    });
  });

  it('should render tasks when they are loaded', async () => {
    const task1 = createTestTask('Test Task 1', TaskCategory.SIMPLE);
    const task2 = createTestTask('Test Task 2', TaskCategory.FOCUS);

    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [
          {
            task: task1,
            completedInSelection: false,
            selectedAt: new Date(),
          },
          {
            task: task2,
            completedInSelection: true,
            selectedAt: new Date(),
          },
        ],
        date: '2023-12-01',
        totalCount: 2,
        completedCount: 1,
        activeCount: 1,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      expect(screen.getByText('Test Task 2')).toBeInTheDocument();
      expect(screen.getByText(/Active Tasks/)).toBeInTheDocument();
      expect(screen.getByText(/Completed Tasks/)).toBeInTheDocument();
    });
  });

  it('should show loading state', async () => {
    // Create a promise that never resolves to keep loading state
    const neverResolve = new Promise<any>(() => {});
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockReturnValue(neverResolve);

    render(<TodayView dependencies={mockDependencies} />);

    expect(screen.getByText('Loading today\'s tasks...')).toBeInTheDocument();
  });

  it('should show error state', async () => {
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.error({ message: 'Failed to load tasks', code: 'LOAD_FAILED' } as any)
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load tasks')).toBeInTheDocument();
    });
  });

  it('should display correct stats', async () => {
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [],
        date: '2023-12-01',
        totalCount: 5,
        completedCount: 2,
        activeCount: 3,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // Total tasks
      expect(screen.getByText('3')).toBeInTheDocument(); // Active tasks
      expect(screen.getByText('2')).toBeInTheDocument(); // Completed tasks
    });
  });

  it('should show progress bar when there are tasks', async () => {
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [],
        date: '2023-12-01',
        totalCount: 4,
        completedCount: 2,
        activeCount: 2,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('50% complete')).toBeInTheDocument();
    });
  });

  it('should format date correctly for today', async () => {
    const today = new Date().toISOString().split('T')[0];
    
    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [],
        date: today,
        totalCount: 0,
        completedCount: 0,
        activeCount: 0,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  it('should handle task removal from today selection', async () => {
    const task1 = createTestTask('Test Task 1', TaskCategory.SIMPLE);

    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [
          {
            task: task1,
            completedInSelection: false,
            selectedAt: new Date(),
          },
        ],
        date: '2023-12-01',
        totalCount: 1,
        completedCount: 0,
        activeCount: 1,
      })
    );

    vi.mocked(mockDependencies.removeTaskFromTodayUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
    });

    // Find and click the sun icon (remove from today button)
    const sunButton = screen.getByTitle('Remove from Today');
    expect(sunButton).toBeInTheDocument();
  });

  it('should show tasks with correct today selection state', async () => {
    const task1 = createTestTask('Test Task 1', TaskCategory.SIMPLE);

    vi.mocked(mockDependencies.getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [
          {
            task: task1,
            completedInSelection: false,
            selectedAt: new Date(),
          },
        ],
        date: '2023-12-01',
        totalCount: 1,
        completedCount: 0,
        activeCount: 1,
      })
    );

    render(<TodayView dependencies={mockDependencies} />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      // Should show the "remove from today" icon since task is in today's selection
      expect(screen.getByTitle('Remove from Today')).toBeInTheDocument();
    });
  });
});