import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ulid } from "ulid";

// Mock Date to return consistent date for tests - must be before other imports
const MOCK_DATE = "2023-12-01T00:00:00.000Z";
vi.useFakeTimers();
vi.setSystemTime(new Date(MOCK_DATE));

import { Task } from "../../../../../shared/domain/entities/Task";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../../../../shared/domain/value-objects/NonEmptyTitle";
import { TaskCategory, TaskStatus } from "../../../../../shared/domain/types";
import {
  GetTodayTasksUseCase,
  TodayTaskInfo,
} from "../../../../../shared/application/use-cases/GetTodayTasksUseCase";
import { AddTaskToTodayUseCase } from "../../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import { RemoveTaskFromTodayUseCase } from "../../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { CompleteTaskUseCase } from "../../../../../shared/application/use-cases/CompleteTaskUseCase";
import { ResultUtils } from "../../../../../shared/domain/Result";
import {
  createTodayViewModel,
  TodayViewModelDependencies,
} from "../TodayViewModel";

// Mock dependencies
const mockGetTodayTasksUseCase: GetTodayTasksUseCase = {
  execute: vi.fn(),
} as any;

const mockAddTaskToTodayUseCase: AddTaskToTodayUseCase = {
  execute: vi.fn(),
} as any;

const mockRemoveTaskFromTodayUseCase: RemoveTaskFromTodayUseCase = {
  execute: vi.fn(),
} as any;

const mockCompleteTaskUseCase: CompleteTaskUseCase = {
  execute: vi.fn(),
} as any;

const dependencies: TodayViewModelDependencies = {
  getTodayTasksUseCase: mockGetTodayTasksUseCase,
  addTaskToTodayUseCase: mockAddTaskToTodayUseCase,
  removeTaskFromTodayUseCase: mockRemoveTaskFromTodayUseCase,
  completeTaskUseCase: mockCompleteTaskUseCase,
};

// Helper function to create test tasks
const createTestTask = (
  title: string,
  category: TaskCategory,
  status: TaskStatus = TaskStatus.ACTIVE
): Task => {
  const now = new Date();
  return new Task(
    TaskId.fromString(ulid()),
    NonEmptyTitle.fromString(title),
    category,
    status,
    now.getTime(), // order parameter should be number
    now,
    now
  );
};

// Helper function to create TodayTaskInfo
const createTodayTaskInfo = (
  task: Task,
  completedInSelection: boolean = false
): TodayTaskInfo => ({
  task,
  completedInSelection,
  selectedAt: new Date(),
});

describe("TodayViewModel", () => {
  let viewModel: ReturnType<typeof createTodayViewModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    viewModel = createTodayViewModel(dependencies);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = viewModel.getState();

      expect(state.tasks).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.totalCount).toBe(0);
      expect(state.completedCount).toBe(0);
      expect(state.activeCount).toBe(0);
      expect(state.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
    });
  });

  describe("loadTodayTasks", () => {
    it("should load today's tasks successfully", async () => {
      const mockTasks = [
        createTodayTaskInfo(createTestTask("Task 1", TaskCategory.SIMPLE)),
        createTodayTaskInfo(createTestTask("Task 2", TaskCategory.FOCUS), true),
      ];

      const mockResponse = {
        tasks: mockTasks,
        date: "2023-12-01",
        totalCount: 2,
        completedCount: 1,
        activeCount: 1,
      };

      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok(mockResponse)
      );

      await viewModel.getState().loadTodayTasks();

      const state = viewModel.getState();
      expect(state.tasks).toEqual(mockTasks);
      expect(state.currentDate).toBe("2023-12-01");
      expect(state.totalCount).toBe(2);
      expect(state.completedCount).toBe(1);
      expect(state.activeCount).toBe(1);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
    });

    it("should handle loading error", async () => {
      const error = { message: "Failed to load", code: "LOAD_FAILED" };
      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      await viewModel.getState().loadTodayTasks();

      const state = viewModel.getState();
      expect(state.tasks).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe("Failed to load");
    });

    it("should set loading state during operation", async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise<any>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(mockGetTodayTasksUseCase.execute).mockReturnValue(promise);

      const loadPromise = viewModel.getState().loadTodayTasks();

      // Check loading state is true during operation
      expect(viewModel.getState().loading).toBe(true);

      resolvePromise!(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 0,
          completedCount: 0,
          activeCount: 0,
        })
      );
      await loadPromise;

      // Check loading state is false after operation
      expect(viewModel.getState().loading).toBe(false);
    });
  });

  describe("addTaskToToday", () => {
    it("should add task to today successfully", async () => {
      const taskId = "task-123";

      vi.mocked(mockAddTaskToTodayUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );
      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 1,
          completedCount: 0,
          activeCount: 1,
        })
      );

      const result = await viewModel.getState().addTaskToToday(taskId);

      expect(result).toBe(true);
      expect(mockAddTaskToTodayUseCase.execute).toHaveBeenCalledWith({
        taskId,
        date: expect.any(String),
      });
      expect(mockGetTodayTasksUseCase.execute).toHaveBeenCalled(); // loadTodayTasks called
    });

    it("should handle add task error", async () => {
      const taskId = "task-123";
      const error = { message: "Add failed", code: "ADD_FAILED" };

      vi.mocked(mockAddTaskToTodayUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().addTaskToToday(taskId);

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe("Add failed");
    });
  });

  describe("removeTaskFromToday", () => {
    it("should remove task from today successfully", async () => {
      const taskId = "task-123";

      vi.mocked(mockRemoveTaskFromTodayUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );
      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 0,
          completedCount: 0,
          activeCount: 0,
        })
      );

      const result = await viewModel.getState().removeTaskFromToday(taskId);

      expect(result).toBe(true);
      expect(mockRemoveTaskFromTodayUseCase.execute).toHaveBeenCalledWith({
        taskId,
        date: expect.any(String),
      });
      expect(mockGetTodayTasksUseCase.execute).toHaveBeenCalled(); // loadTodayTasks called
    });

    it("should handle remove task error", async () => {
      const taskId = "task-123";
      const error = { message: "Remove failed", code: "REMOVE_FAILED" };

      vi.mocked(mockRemoveTaskFromTodayUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().removeTaskFromToday(taskId);

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe("Remove failed");
    });
  });

  describe("completeTask", () => {
    it("should complete task successfully", async () => {
      const taskId = "task-123";

      vi.mocked(mockCompleteTaskUseCase.execute).mockResolvedValue(
        ResultUtils.ok(undefined)
      );
      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 1,
          completedCount: 1,
          activeCount: 0,
        })
      );

      const result = await viewModel.getState().completeTask(taskId);

      expect(result).toBe(true);
      expect(mockCompleteTaskUseCase.execute).toHaveBeenCalledWith({ taskId });
      expect(mockGetTodayTasksUseCase.execute).toHaveBeenCalled(); // loadTodayTasks called
    });

    it("should optimistically update state when completing a task", async () => {
      const activeTask = createTodayTaskInfo(
        createTestTask("Task 1", TaskCategory.SIMPLE, TaskStatus.ACTIVE)
      );

      const store = viewModel as any;
      store.setState({
        tasks: [activeTask],
        totalCount: 1,
        completedCount: 0,
        activeCount: 1,
      });

      let resolveComplete: (value: any) => void;
      const executePromise = new Promise<any>((resolve) => {
        resolveComplete = resolve;
      });

      vi.mocked(mockCompleteTaskUseCase.execute).mockReturnValue(
        executePromise as any
      );
      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 1,
          completedCount: 1,
          activeCount: 0,
        })
      );

      const promise = viewModel
        .getState()
        .completeTask(activeTask.task.id.value);

      const intermediateState = viewModel.getState();

      expect(intermediateState.tasks[0].completedInSelection).toBe(true);
      expect(intermediateState.tasks[0].task.isCompleted).toBe(true);
      expect(intermediateState.completedCount).toBe(1);
      expect(intermediateState.activeCount).toBe(0);
      expect(intermediateState.getCompletedTasks()).toHaveLength(1);
      expect(intermediateState.getActiveTasks()).toHaveLength(0);

      resolveComplete!(ResultUtils.ok(undefined));

      await promise;
    });

    it("should handle complete task error", async () => {
      const taskId = "task-123";
      const error = { message: "Complete failed", code: "COMPLETE_FAILED" };

      vi.mocked(mockCompleteTaskUseCase.execute).mockResolvedValue(
        ResultUtils.error(error as any)
      );

      const result = await viewModel.getState().completeTask(taskId);

      expect(result).toBe(false);
      expect(viewModel.getState().error).toBe("Complete failed");
    });

    it("should rollback optimistic update when completion fails", async () => {
      const activeTask = createTodayTaskInfo(
        createTestTask("Task 1", TaskCategory.SIMPLE, TaskStatus.ACTIVE)
      );

      const store = viewModel as any;
      store.setState({
        tasks: [activeTask],
        totalCount: 1,
        completedCount: 0,
        activeCount: 1,
      });

      let resolveComplete: (value: any) => void;
      const executePromise = new Promise<any>((resolve) => {
        resolveComplete = resolve;
      });

      vi.mocked(mockCompleteTaskUseCase.execute).mockReturnValue(
        executePromise as any
      );

      const promise = viewModel
        .getState()
        .completeTask(activeTask.task.id.value);

      const optimisticState = viewModel.getState();
      expect(optimisticState.tasks[0].completedInSelection).toBe(true);
      expect(optimisticState.getCompletedTasks()).toHaveLength(1);
      expect(optimisticState.getActiveTasks()).toHaveLength(0);

      const error = { message: "Complete failed", code: "COMPLETE_FAILED" };
      resolveComplete!(ResultUtils.error(error as any));

      const result = await promise;

      expect(result).toBe(false);
      const finalState = viewModel.getState();
      expect(finalState.tasks[0]).toBe(activeTask);
      expect(finalState.tasks[0].completedInSelection).toBe(false);
      expect(finalState.tasks[0].task.isCompleted).toBe(false);
      expect(finalState.completedCount).toBe(0);
      expect(finalState.activeCount).toBe(1);
      expect(finalState.getCompletedTasks()).toHaveLength(0);
      expect(finalState.getActiveTasks()).toHaveLength(1);
      expect(finalState.error).toBe("Complete failed");
      expect(mockGetTodayTasksUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe("Computed Properties", () => {
    beforeEach(() => {
      const mockTasks = [
        createTodayTaskInfo(
          createTestTask(
            "Active Task 1",
            TaskCategory.SIMPLE,
            TaskStatus.ACTIVE
          ),
          false
        ),
        createTodayTaskInfo(
          createTestTask(
            "Active Task 2",
            TaskCategory.FOCUS,
            TaskStatus.ACTIVE
          ),
          false
        ),
        createTodayTaskInfo(
          createTestTask(
            "Completed Task 1",
            TaskCategory.SIMPLE,
            TaskStatus.COMPLETED
          ),
          false
        ),
        createTodayTaskInfo(
          createTestTask(
            "Selection Completed",
            TaskCategory.FOCUS,
            TaskStatus.ACTIVE
          ),
          true
        ),
      ];

      // Set tasks directly for testing computed properties
      const store = viewModel as any;
      store.setState({
        tasks: mockTasks,
        totalCount: 4,
        completedCount: 2,
        activeCount: 2,
      });
    });

    describe("getActiveTasks", () => {
      it("should return active tasks that are not completed in selection", () => {
        const state = viewModel.getState();
        const activeTasks = state.getActiveTasks();

        expect(activeTasks).toHaveLength(2);
        expect(
          activeTasks.every(
            (info) => !info.completedInSelection && info.task.isActive
          )
        ).toBe(true);
      });
    });

    describe("getCompletedTasks", () => {
      it("should return tasks that are completed in selection or completed in general", () => {
        const state = viewModel.getState();
        const completedTasks = state.getCompletedTasks();

        expect(completedTasks).toHaveLength(2);
        expect(
          completedTasks.every(
            (info) => info.completedInSelection || info.task.isCompleted
          )
        ).toBe(true);
      });
    });

    describe("isToday", () => {
      it("should return true when current date is today", () => {
        const store = viewModel as any;
        store.setState({ currentDate: "2023-12-01" });

        const state = viewModel.getState();
        expect(state.isToday()).toBe(true);
      });

      it("should return false when current date is not today", () => {
        const store = viewModel as any;
        store.setState({ currentDate: "2023-01-01" });

        const state = viewModel.getState();
        expect(state.isToday()).toBe(false);
      });
    });
  });

  describe("Error Management", () => {
    it("should clear error", () => {
      const store = viewModel as any;
      store.setState({ error: "Some error" });

      viewModel.getState().clearError();

      expect(viewModel.getState().error).toBe(null);
    });
  });

  describe("refreshToday", () => {
    it("should reload today's tasks", async () => {
      const store = viewModel as any;
      store.setState({ currentDate: "2023-12-01" });

      vi.mocked(mockGetTodayTasksUseCase.execute).mockResolvedValue(
        ResultUtils.ok({
          tasks: [],
          date: "2023-12-01",
          totalCount: 0,
          completedCount: 0,
          activeCount: 0,
        })
      );

      await viewModel.getState().refreshToday();

      expect(mockGetTodayTasksUseCase.execute).toHaveBeenCalledWith({
        date: "2023-12-01",
        includeCompleted: true,
      });
    });
  });
});
