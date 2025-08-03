import { create } from "zustand";
import { Task } from "../../../../shared/domain/entities/Task";
import { TaskRepository } from "../../../../shared/domain/repositories/TaskRepository";

export interface TrashViewModelState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  loadTasks: () => Promise<void>;
  clearTrash: () => Promise<void>;
}

export interface TrashViewModelDependencies {
  taskRepository: TaskRepository;
}

export const createTrashViewModel = (
  deps: TrashViewModelDependencies
) => {
  const { taskRepository } = deps;
  return create<TrashViewModelState>((set) => ({
    tasks: [],
    loading: false,
    error: null,
    loadTasks: async () => {
      set({ loading: true, error: null });
      try {
        const tasks = await taskRepository.findDeleted();
        set({ tasks, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load tasks",
        });
      }
    },
    clearTrash: async () => {
      try {
        await taskRepository.clearDeleted();
        set({ tasks: [] });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Failed to clear" });
      }
    },
  }));
};

export type TrashViewModel = ReturnType<typeof createTrashViewModel>;
