import { create } from "zustand";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskCategory, TaskStatus } from "../../../../shared/domain/types";
import {
  CreateTaskUseCase,
  CreateTaskRequest,
} from "../../../../shared/application/use-cases/CreateTaskUseCase";
import {
  UpdateTaskUseCase,
  UpdateTaskRequest,
} from "../../../../shared/application/use-cases/UpdateTaskUseCase";
import { CompleteTaskUseCase } from "../../../../shared/application/use-cases/CompleteTaskUseCase";
import { DeleteTaskUseCase } from "../../../../shared/application/use-cases/DeleteTaskUseCase";
import { TaskRepository } from "../../../../shared/domain/repositories/TaskRepository";
import { GetTodayTasksUseCase } from "../../../../shared/application/use-cases/GetTodayTasksUseCase";

/**
 * Task filter options
 */
export interface TaskFilter {
  category?: TaskCategory;
  status?: TaskStatus;
  showOverdue?: boolean;
}

/**
 * Task view model state
 */
export interface TaskViewModelState {
  // State
  tasks: Task[];
  loading: boolean;
  error: string | null;
  filter: TaskFilter;
  overdueDays: number;

  // Actions
  loadTasks: () => Promise<void>;
  createTask: (request: CreateTaskRequest) => Promise<boolean>;
  updateTask: (request: UpdateTaskRequest) => Promise<boolean>;
  completeTask: (taskId: string) => Promise<boolean>;
  revertTaskCompletion: (taskId: string) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  setFilter: (filter: TaskFilter) => void;
  setOverdueDays: (days: number) => void;
  clearError: () => void;

  // Computed properties (as functions)
  getFilteredTasks: () => Task[];
  getTasksByCategory: () => Record<TaskCategory, Task[]>;
  getOverdueTasks: () => Task[];
  getOverdueCount: () => number;
  getTodayTaskIds: () => Promise<string[]>;
}

/**
 * Dependencies for TaskViewModel
 */
export interface TaskViewModelDependencies {
  taskRepository: TaskRepository;
  createTaskUseCase: CreateTaskUseCase;
  updateTaskUseCase: UpdateTaskUseCase;
  completeTaskUseCase: CompleteTaskUseCase;
  deleteTaskUseCase: DeleteTaskUseCase;
  getTodayTasksUseCase: GetTodayTasksUseCase;
}

/**
 * Create TaskViewModel store
 */
export const createTaskViewModel = (
  dependencies: TaskViewModelDependencies
) => {
  const {
    taskRepository,
    createTaskUseCase,
    updateTaskUseCase,
    completeTaskUseCase,
    deleteTaskUseCase,
    getTodayTasksUseCase,
  } = dependencies;

  return create<TaskViewModelState>((set, get) => ({
    // Initial state
    tasks: [],
    loading: false,
    error: null,
    filter: {},
    overdueDays: 3, // Default from requirements

    // Computed properties as functions
    getFilteredTasks: () => {
      const { tasks, filter, overdueDays } = get();
      let filtered = tasks.filter((task) => task.isActive);

      if (filter.category) {
        filtered = filtered.filter((task) => task.category === filter.category);
      }

      if (filter.status) {
        filtered = filtered.filter((task) => task.status === filter.status);
      }

      if (filter.showOverdue) {
        filtered = filtered.filter((task) => task.isOverdue(overdueDays));
      }

      return filtered;
    },

    getTasksByCategory: () => {
      const { tasks } = get();
      const activeTasks = tasks.filter((task) => task.isActive);

      return {
        [TaskCategory.SIMPLE]: activeTasks.filter(
          (task) => task.category === TaskCategory.SIMPLE
        ),
        [TaskCategory.FOCUS]: activeTasks.filter(
          (task) => task.category === TaskCategory.FOCUS
        ),
        [TaskCategory.INBOX]: activeTasks.filter(
          (task) => task.category === TaskCategory.INBOX
        ),
        [TaskCategory.DEFERRED]: activeTasks.filter(
          (task) => task.category === TaskCategory.DEFERRED
        ),
      };
    },

    getOverdueTasks: () => {
      const { tasks, overdueDays } = get();
      return tasks.filter(
        (task) =>
          task.isActive &&
          task.category === TaskCategory.INBOX &&
          task.isOverdue(overdueDays)
      );
    },

    getOverdueCount: () => {
      const { tasks, overdueDays } = get();
      return tasks.filter(
        (task) =>
          task.isActive &&
          task.category === TaskCategory.INBOX &&
          task.isOverdue(overdueDays)
      ).length;
    },

    getTodayTaskIds: async () => {
      try {
        const result = await getTodayTasksUseCase.execute({
          includeCompleted: true,
        });

        if (result.success) {
          return result.data.tasks.map((taskInfo) => taskInfo.task.id.value);
        } else {
          const errorMessage = (result as any).error.message;
          set({ error: errorMessage });
          return [];
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Error getting today task IDs";
        set({ error: errorMessage });
        return [];
      }
    },

    // Actions
    loadTasks: async () => {
      set({ loading: true, error: null });

      try {
        const tasks = await taskRepository.findAll();
        set({ tasks, loading: false });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to load tasks",
          loading: false,
        });
      }
    },

    createTask: async (request: CreateTaskRequest) => {
      set({ error: null });

      try {
        const result = await createTaskUseCase.execute(request);

        if (result.success) {
          // Reload tasks to get the updated list
          await get().loadTasks();

          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to create task",
        });
        return false;
      }
    },

    updateTask: async (request: UpdateTaskRequest) => {
      set({ error: null });

      try {
        const result = await updateTaskUseCase.execute(request);

        if (result.success) {
          // Reload tasks to get the updated list
          await get().loadTasks();

          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to update task",
        });
        return false;
      }
    },

    completeTask: async (taskId: string) => {
      set({ error: null });

      try {
        const result = await completeTaskUseCase.execute({ taskId });

        if (result.success) {
          // Reload tasks to get the updated list
          await get().loadTasks();

          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to complete task",
        });
        return false;
      }
    },

    revertTaskCompletion: async (taskId: string) => {
      set({ error: null });

      try {
        // Find the task and revert completion
        const task = get().tasks.find((t) => t.id.value === taskId);
        if (!task) {
          set({ error: "Task not found" });
          return false;
        }

        // For now, let's reload tasks - this should be improved with a dedicated use case
        // TODO: Implement proper revert completion use case
        await get().loadTasks();
        return true;
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to revert task completion",
        });
        return false;
      }
    },

    deleteTask: async (taskId: string) => {
      set({ error: null });

      try {
        const result = await deleteTaskUseCase.execute({ taskId });

        if (result.success) {
          // Reload tasks to get the updated list
          await get().loadTasks();

          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to delete task",
        });
        return false;
      }
    },

    setFilter: (filter: TaskFilter) => {
      set({ filter });
    },

    setOverdueDays: (days: number) => {
      set({ overdueDays: days });
    },

    clearError: () => {
      set({ error: null });
    },
  }));
};

/**
 * Task ViewModel hook type
 */
export type TaskViewModel = ReturnType<typeof createTaskViewModel>;
