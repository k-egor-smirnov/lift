import { create } from "zustand";
import {
  TodayTaskInfo,
  GetTodayTasksUseCase,
  GetTodayTasksRequest,
} from "../../../../shared/application/use-cases/GetTodayTasksUseCase";
import {
  AddTaskToTodayUseCase,
  AddTaskToTodayRequest,
} from "../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import {
  RemoveTaskFromTodayUseCase,
  RemoveTaskFromTodayRequest,
} from "../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { CompleteTaskUseCase } from "../../../../shared/application/use-cases/CompleteTaskUseCase";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";
import { taskEventBus } from "../../../../shared/infrastructure/events/TaskEventBus";
import {
  TaskEventType,
  AnyTaskEvent,
} from "../../../../shared/domain/events/TaskEvent";
import { TodayViewModelDependencies } from "./TodayViewModel";

/**
 * Today view model state
 */
export interface TodayViewModelState {
  // State
  tasks: TodayTaskInfo[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  currentDate: string;
  totalCount: number;
  completedCount: number;
  activeCount: number;
  autoRefreshEnabled: boolean;
  initialized: boolean;

  // Dependencies
  dependencies: TodayViewModelDependencies | null;

  // Actions
  initialize: (dependencies: TodayViewModelDependencies) => void;
  loadTodayTasks: (date?: string, silent?: boolean) => Promise<void>;
  addTaskToToday: (taskId: string) => Promise<boolean>;
  removeTaskFromToday: (taskId: string) => Promise<boolean>;
  completeTask: (taskId: string) => Promise<boolean>;
  refreshToday: () => Promise<void>;
  clearError: () => void;
  enableAutoRefresh: () => void;
  disableAutoRefresh: () => void;

  // Computed properties
  getActiveTasks: () => TodayTaskInfo[];
  getCompletedTasks: () => TodayTaskInfo[];
  getTodayTaskIds: () => string[];
  isToday: () => boolean;
}

// Global event subscription management
let unsubscribeFromEvents: (() => void) | null = null;

/**
 * Global TodayViewModel store that persists across component remounts
 */
export const useTodayViewModelStore = create<TodayViewModelState>((set, get) => ({
  // Initial state
  tasks: [],
  loading: false,
  refreshing: false,
  error: null,
  currentDate: DateOnly.today().value,
  totalCount: 0,
  completedCount: 0,
  activeCount: 0,
  autoRefreshEnabled: false,
  initialized: false,
  dependencies: null,

  // Initialize with dependencies
  initialize: (dependencies: TodayViewModelDependencies) => {
    const { initialized } = get();
    if (initialized) {
      // Already initialized, just update dependencies if needed
      set({ dependencies });
      return;
    }

    set({ 
      dependencies, 
      initialized: true,
      autoRefreshEnabled: true 
    });

    // Enable auto-refresh after initialization
    get().enableAutoRefresh();
  },

  // Computed properties
  getActiveTasks: () => {
    const { tasks } = get();
    return tasks.filter(
      (info) => !info.completedInSelection && info.task.isActive
    );
  },

  getCompletedTasks: () => {
    const { tasks } = get();
    return tasks.filter(
      (info) => info.completedInSelection || info.task.isCompleted
    );
  },

  getTodayTaskIds: () => {
    const { tasks } = get();
    return tasks.map((info) => info.task.id.value);
  },

  isToday: () => {
    const { currentDate } = get();
    return currentDate === DateOnly.today().value;
  },

  // Actions
  loadTodayTasks: async (date?: string, silent = false) => {
    const { dependencies, tasks: currentTasks } = get();
    if (!dependencies) {
      console.error("TodayViewModel not initialized with dependencies");
      return;
    }

    // For optimistic loading: only show loading spinner on initial load or when no data exists
    if (!silent && currentTasks.length === 0) {
      set({ loading: true, error: null });
    } else if (silent || currentTasks.length > 0) {
      // Silent refresh - show refreshing indicator instead of loading
      set({ refreshing: true, error: null });
    }

    try {
      const request: GetTodayTasksRequest = {
        date,
        includeCompleted: true,
      };

      const result = await dependencies.getTodayTasksUseCase.execute(request);

      if (result.success) {
        set({
          tasks: result.data.tasks,
          currentDate: result.data.date,
          totalCount: result.data.totalCount,
          completedCount: result.data.completedCount,
          activeCount: result.data.activeCount,
          loading: false,
          refreshing: false,
        });
      } else {
        set({
          error: (result as any).error.message,
          loading: false,
          refreshing: false,
        });
      }
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to load today's tasks",
        loading: false,
        refreshing: false,
      });
    }
  },

  addTaskToToday: async (taskId: string) => {
    const { dependencies } = get();
    if (!dependencies) {
      console.error("TodayViewModel not initialized with dependencies");
      return false;
    }

    set({ error: null });

    try {
      const { currentDate } = get();
      const request: AddTaskToTodayRequest = {
        taskId,
        date: currentDate,
      };

      const result = await dependencies.addTaskToTodayUseCase.execute(request);

      if (result.success) {
        // Reload today's tasks to get the updated list (silent refresh)
        await get().loadTodayTasks(currentDate, true);
        return true;
      } else {
        set({ error: (result as any).error.message });
        return false;
      }
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to add task to today",
      });
      return false;
    }
  },

  removeTaskFromToday: async (taskId: string) => {
    const { dependencies } = get();
    if (!dependencies) {
      console.error("TodayViewModel not initialized with dependencies");
      return false;
    }

    set({ error: null });

    try {
      const { currentDate } = get();
      const request: RemoveTaskFromTodayRequest = {
        taskId,
        date: currentDate,
      };

      const result = await dependencies.removeTaskFromTodayUseCase.execute(request);

      if (result.success) {
        // Reload today's tasks to get the updated list (silent refresh)
        await get().loadTodayTasks(currentDate, true);
        return true;
      } else {
        set({ error: (result as any).error.message });
        return false;
      }
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove task from today",
      });
      return false;
    }
  },

  completeTask: async (taskId: string) => {
    const { dependencies } = get();
    if (!dependencies) {
      console.error("TodayViewModel not initialized with dependencies");
      return false;
    }

    set({ error: null });

    try {
      const result = await dependencies.completeTaskUseCase.execute({ taskId });

      if (result.success) {
        // Reload today's tasks to get the updated list (silent refresh)
        const { currentDate } = get();
        await get().loadTodayTasks(currentDate, true);
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

  refreshToday: async () => {
    // Always use the current date (which respects mocked date)
    const today = DateOnly.today().value;
    set({ currentDate: today });
    await get().loadTodayTasks(today);
  },

  clearError: () => {
    set({ error: null });
  },

  enableAutoRefresh: () => {
    set({ autoRefreshEnabled: true });

    // Debounce timer for batching multiple events
    let debounceTimer: NodeJS.Timeout | null = null;

    // Subscribe to task events for auto-refresh
    if (!unsubscribeFromEvents) {
      unsubscribeFromEvents = taskEventBus.subscribeToAll(
        async (event: AnyTaskEvent) => {
          const { autoRefreshEnabled } = get();
          if (!autoRefreshEnabled) return;

          // Auto-refresh on relevant events
          if (
            [
              TaskEventType.TASK_CREATED,
              TaskEventType.TASK_UPDATED,
              TaskEventType.TASK_COMPLETED,
              TaskEventType.TASK_DELETED,
              TaskEventType.TASK_ADDED_TO_TODAY,
              TaskEventType.TASK_REMOVED_FROM_TODAY,
            ].includes(event.type)
          ) {
            // Clear existing timer to debounce rapid successive events
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }

            // Set new timer to batch events within 200ms window
            debounceTimer = setTimeout(async () => {
              const { currentDate } = get();
              await get().loadTodayTasks(currentDate, true);
              debounceTimer = null;
            }, 200);
          }
        }
      );
    }
  },

  disableAutoRefresh: () => {
    set({ autoRefreshEnabled: false });

    // Unsubscribe from events
    if (unsubscribeFromEvents) {
      unsubscribeFromEvents();
      unsubscribeFromEvents = null;
    }
  },
}));