import { create } from 'zustand';
import { TodayTaskInfo, GetTodayTasksUseCase, GetTodayTasksRequest } from '../../../../shared/application/use-cases/GetTodayTasksUseCase';
import { AddTaskToTodayUseCase, AddTaskToTodayRequest } from '../../../../shared/application/use-cases/AddTaskToTodayUseCase';
import { RemoveTaskFromTodayUseCase, RemoveTaskFromTodayRequest } from '../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase';
import { CompleteTaskUseCase } from '../../../../shared/application/use-cases/CompleteTaskUseCase';
import { DateOnly } from '../../../../shared/domain/value-objects/DateOnly';

/**
 * Today view model state
 */
export interface TodayViewModelState {
  // State
  tasks: TodayTaskInfo[];
  loading: boolean;
  error: string | null;
  currentDate: string;
  totalCount: number;
  completedCount: number;
  activeCount: number;

  // Actions
  loadTodayTasks: (date?: string) => Promise<void>;
  addTaskToToday: (taskId: string) => Promise<boolean>;
  removeTaskFromToday: (taskId: string) => Promise<boolean>;
  completeTask: (taskId: string) => Promise<boolean>;
  refreshToday: () => Promise<void>;
  clearError: () => void;

  // Computed properties
  getActiveTasks: () => TodayTaskInfo[];
  getCompletedTasks: () => TodayTaskInfo[];
  isToday: () => boolean;
}

/**
 * Dependencies for TodayViewModel
 */
export interface TodayViewModelDependencies {
  getTodayTasksUseCase: GetTodayTasksUseCase;
  addTaskToTodayUseCase: AddTaskToTodayUseCase;
  removeTaskFromTodayUseCase: RemoveTaskFromTodayUseCase;
  completeTaskUseCase: CompleteTaskUseCase;
}

/**
 * Create TodayViewModel store
 */
export const createTodayViewModel = (dependencies: TodayViewModelDependencies) => {
  const { getTodayTasksUseCase, addTaskToTodayUseCase, removeTaskFromTodayUseCase, completeTaskUseCase } = dependencies;

  return create<TodayViewModelState>((set, get) => ({
    // Initial state
    tasks: [],
    loading: false,
    error: null,
    currentDate: DateOnly.today().value,
    totalCount: 0,
    completedCount: 0,
    activeCount: 0,

    // Computed properties
    getActiveTasks: () => {
      const { tasks } = get();
      return tasks.filter(info => !info.completedInSelection && info.task.isActive);
    },

    getCompletedTasks: () => {
      const { tasks } = get();
      return tasks.filter(info => info.completedInSelection || info.task.isCompleted);
    },

    isToday: () => {
      const { currentDate } = get();
      return currentDate === DateOnly.today().value;
    },

    // Actions
    loadTodayTasks: async (date?: string) => {
      set({ loading: true, error: null });
      
      try {
        const request: GetTodayTasksRequest = {
          date,
          includeCompleted: true
        };

        const result = await getTodayTasksUseCase.execute(request);
        
        if (result.success) {
          set({
            tasks: result.data.tasks,
            currentDate: result.data.date,
            totalCount: result.data.totalCount,
            completedCount: result.data.completedCount,
            activeCount: result.data.activeCount,
            loading: false
          });
        } else {
          set({ 
            error: (result as any).error.message,
            loading: false 
          });
        }
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load today\'s tasks',
          loading: false 
        });
      }
    },

    addTaskToToday: async (taskId: string) => {
      set({ error: null });
      
      try {
        const { currentDate } = get();
        const request: AddTaskToTodayRequest = {
          taskId,
          date: currentDate
        };

        const result = await addTaskToTodayUseCase.execute(request);
        
        if (result.success) {
          // Reload today's tasks to get the updated list
          await get().loadTodayTasks(currentDate);
          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to add task to today' });
        return false;
      }
    },

    removeTaskFromToday: async (taskId: string) => {
      set({ error: null });
      
      try {
        const { currentDate } = get();
        const request: RemoveTaskFromTodayRequest = {
          taskId,
          date: currentDate
        };

        const result = await removeTaskFromTodayUseCase.execute(request);
        
        if (result.success) {
          // Reload today's tasks to get the updated list
          await get().loadTodayTasks(currentDate);
          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to remove task from today' });
        return false;
      }
    },

    completeTask: async (taskId: string) => {
      set({ error: null });
      
      try {
        const result = await completeTaskUseCase.execute({ taskId });
        
        if (result.success) {
          // Reload today's tasks to get the updated list
          const { currentDate } = get();
          await get().loadTodayTasks(currentDate);
          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to complete task' });
        return false;
      }
    },

    refreshToday: async () => {
      const { currentDate } = get();
      await get().loadTodayTasks(currentDate);
    },

    clearError: () => {
      set({ error: null });
    },
  }));
};

/**
 * Today ViewModel hook type
 */
export type TodayViewModel = ReturnType<typeof createTodayViewModel>;