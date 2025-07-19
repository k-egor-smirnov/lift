import { create } from 'zustand';
import { LogEntry, GetTaskLogsResponse } from '../../../../shared/application/use-cases/GetTaskLogsUseCase';
import { GetTaskLogsUseCase, GetTaskLogsRequest } from '../../../../shared/application/use-cases/GetTaskLogsUseCase';
import { CreateUserLogUseCase, CreateUserLogRequest } from '../../../../shared/application/use-cases/CreateUserLogUseCase';

/**
 * Log filter options
 */
export interface LogFilter {
  taskId?: string;
  logType?: 'SYSTEM' | 'USER' | 'CONFLICT';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Log view model state
 */
export interface LogViewModelState {
  // State
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
  filter: LogFilter;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  // Actions
  loadLogs: (request?: GetTaskLogsRequest) => Promise<void>;
  loadNextPage: () => Promise<void>;
  loadPreviousPage: () => Promise<void>;
  createUserLog: (request: CreateUserLogRequest) => Promise<boolean>;
  setFilter: (filter: LogFilter) => void;
  clearError: () => void;
  refreshLogs: () => Promise<void>;

  // Computed properties (as functions)
  getFilteredLogs: () => LogEntry[];
  getLogsByType: () => Record<string, LogEntry[]>;
  hasLogs: () => boolean;
}

/**
 * Dependencies for LogViewModel
 */
export interface LogViewModelDependencies {
  getTaskLogsUseCase: GetTaskLogsUseCase;
  createUserLogUseCase: CreateUserLogUseCase;
}

/**
 * Create LogViewModel store
 */
export const createLogViewModel = (dependencies: LogViewModelDependencies) => {
  const { getTaskLogsUseCase, createUserLogUseCase } = dependencies;

  return create<LogViewModelState>((set, get) => ({
    // Initial state
    logs: [],
    loading: false,
    error: null,
    filter: {
      sortOrder: 'desc'
    },
    pagination: {
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false
    },

    // Computed properties as functions
    getFilteredLogs: () => {
      const { logs, filter } = get();
      let filtered = [...logs];

      if (filter.taskId) {
        filtered = filtered.filter(log => log.taskId === filter.taskId);
      }

      if (filter.logType) {
        filtered = filtered.filter(log => log.type === filter.logType);
      }

      return filtered;
    },

    getLogsByType: () => {
      const { logs } = get();
      return logs.reduce((acc, log) => {
        if (!acc[log.type]) {
          acc[log.type] = [];
        }
        acc[log.type].push(log);
        return acc;
      }, {} as Record<string, LogEntry[]>);
    },

    hasLogs: () => {
      const { logs } = get();
      return logs.length > 0;
    },

    // Actions
    loadLogs: async (request?: GetTaskLogsRequest) => {
      set({ loading: true, error: null });
      
      try {
        const { filter, pagination } = get();
        
        const loadRequest: GetTaskLogsRequest = {
          taskId: request?.taskId || filter.taskId,
          logType: request?.logType || filter.logType,
          page: request?.page || pagination.page,
          pageSize: request?.pageSize || pagination.pageSize,
          sortOrder: request?.sortOrder || filter.sortOrder || 'desc'
        };

        const result = await getTaskLogsUseCase.execute(loadRequest);
        
        if (result.success) {
          const response = result.data as GetTaskLogsResponse;
          set({ 
            logs: response.logs,
            pagination: response.pagination,
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
          error: error instanceof Error ? error.message : 'Failed to load logs',
          loading: false 
        });
      }
    },

    loadNextPage: async () => {
      const { pagination } = get();
      if (pagination.hasNextPage) {
        await get().loadLogs({ page: pagination.page + 1 });
      }
    },

    loadPreviousPage: async () => {
      const { pagination } = get();
      if (pagination.hasPreviousPage) {
        await get().loadLogs({ page: pagination.page - 1 });
      }
    },

    createUserLog: async (request: CreateUserLogRequest) => {
      set({ error: null });
      
      try {
        const result = await createUserLogUseCase.execute(request);
        
        if (result.success) {
          // Refresh logs to show the new entry
          await get().refreshLogs();
          return true;
        } else {
          set({ error: (result as any).error.message });
          return false;
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to create log' });
        return false;
      }
    },

    setFilter: (filter: LogFilter) => {
      set({ filter: { ...get().filter, ...filter } });
      // Reset to first page when filter changes
      get().loadLogs({ page: 1 });
    },

    clearError: () => {
      set({ error: null });
    },

    refreshLogs: async () => {
      const { pagination } = get();
      await get().loadLogs({ page: pagination.page });
    },
  }));
};

/**
 * Log ViewModel hook type
 */
export type LogViewModel = ReturnType<typeof createLogViewModel>;