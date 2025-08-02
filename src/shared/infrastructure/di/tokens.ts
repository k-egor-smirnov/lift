/**
 * DI Tokens for dependency injection
 */

// Database
export const DATABASE_TOKEN = Symbol('Database');
export const EVENT_BUS_TOKEN = Symbol('EventBus');
export const TASK_EVENT_ADAPTER_TOKEN = Symbol('TaskEventAdapter');

// Repositories
export const TASK_REPOSITORY_TOKEN = Symbol('TaskRepository');
export const DAILY_SELECTION_REPOSITORY_TOKEN = Symbol('DailySelectionRepository');
export const DAY_RESET_REPOSITORY_TOKEN = Symbol('DayResetRepository');

// Use Cases
export const CREATE_TASK_USE_CASE_TOKEN = Symbol('CreateTaskUseCase');
export const UPDATE_TASK_USE_CASE_TOKEN = Symbol('UpdateTaskUseCase');
export const DELETE_TASK_USE_CASE_TOKEN = Symbol('DeleteTaskUseCase');
export const REORDER_TASKS_USE_CASE_TOKEN = Symbol('ReorderTasksUseCase');
export const COMPLETE_TASK_USE_CASE_TOKEN = Symbol('CompleteTaskUseCase');
export const REVERT_TASK_COMPLETION_USE_CASE_TOKEN = Symbol('RevertTaskCompletionUseCase');
export const GET_TODAY_TASKS_USE_CASE_TOKEN = Symbol('GetTodayTasksUseCase');
export const ADD_TASK_TO_TODAY_USE_CASE_TOKEN = Symbol('AddTaskToTodayUseCase');
export const REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN = Symbol('RemoveTaskFromTodayUseCase');
export const GET_TASK_LOGS_USE_CASE_TOKEN = Symbol('GetTaskLogsUseCase');
export const CREATE_USER_LOG_USE_CASE_TOKEN = Symbol('CreateUserLogUseCase');
export const CREATE_SYSTEM_LOG_USE_CASE_TOKEN = Symbol('CreateSystemLogUseCase');
export const DEFER_TASK_USE_CASE_TOKEN = Symbol('DeferTaskUseCase');
export const UNDEFER_TASK_USE_CASE_TOKEN = Symbol('UndeferTaskUseCase');
export const DAY_RESET_USE_CASE_TOKEN = Symbol('DayResetUseCase');
export const CHECK_DAY_STATUS_USE_CASE_TOKEN = Symbol('CheckDayStatusUseCase');
export const RESTORE_DAY_USE_CASE_TOKEN = Symbol('RestoreDayUseCase');
export const GET_START_OF_DAY_CANDIDATES_USE_CASE_TOKEN = Symbol('GetStartOfDayCandidatesUseCase');
export const CONFIRM_START_OF_DAY_USE_CASE_TOKEN = Symbol('ConfirmStartOfDayUseCase');

// Services
export const DEFERRED_TASK_SERVICE_TOKEN = Symbol('DeferredTaskService');
export const SYNC_SERVICE_TOKEN = Symbol('SyncService');
export const DEBOUNCED_SYNC_SERVICE_TOKEN = Symbol('DebouncedSyncService');
export const SUPABASE_REALTIME_SERVICE_TOKEN = Symbol('SupabaseRealtimeService');

// Supabase
export const SUPABASE_CLIENT_FACTORY_TOKEN = Symbol('SupabaseClientFactory');
export const SYNC_REPOSITORY_TOKEN = Symbol('SyncRepository');