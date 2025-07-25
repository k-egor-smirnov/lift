/**
 * DI Tokens for dependency injection
 */

// Database
export const DATABASE_TOKEN = Symbol('Database');
export const EVENT_BUS_TOKEN = Symbol('EventBus');

// Repositories
export const TASK_REPOSITORY_TOKEN = Symbol('TaskRepository');
export const DAILY_SELECTION_REPOSITORY_TOKEN = Symbol('DailySelectionRepository');

// Use Cases
export const CREATE_TASK_USE_CASE_TOKEN = Symbol('CreateTaskUseCase');
export const UPDATE_TASK_USE_CASE_TOKEN = Symbol('UpdateTaskUseCase');
export const REORDER_TASKS_USE_CASE_TOKEN = Symbol('ReorderTasksUseCase');
export const COMPLETE_TASK_USE_CASE_TOKEN = Symbol('CompleteTaskUseCase');
export const REVERT_TASK_COMPLETION_USE_CASE_TOKEN = Symbol('RevertTaskCompletionUseCase');
export const GET_TODAY_TASKS_USE_CASE_TOKEN = Symbol('GetTodayTasksUseCase');
export const ADD_TASK_TO_TODAY_USE_CASE_TOKEN = Symbol('AddTaskToTodayUseCase');
export const REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN = Symbol('RemoveTaskFromTodayUseCase');
export const GET_TASK_LOGS_USE_CASE_TOKEN = Symbol('GetTaskLogsUseCase');
export const CREATE_USER_LOG_USE_CASE_TOKEN = Symbol('CreateUserLogUseCase');
export const DEFER_TASK_USE_CASE_TOKEN = Symbol('DeferTaskUseCase');
export const UNDEFER_TASK_USE_CASE_TOKEN = Symbol('UndeferTaskUseCase');

// Services
export const LOG_SERVICE_TOKEN = Symbol('LogService');
export const DEFERRED_TASK_SERVICE_TOKEN = Symbol('DeferredTaskService');