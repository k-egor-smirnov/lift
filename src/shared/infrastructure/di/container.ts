import 'reflect-metadata';
import { container } from 'tsyringe';

// Import implementations
import { TodoDatabase } from '../database/TodoDatabase';
import { PersistentEventBusImpl } from '../../domain/events/EventBus';
import { TaskRepositoryImpl } from '../repositories/TaskRepositoryImpl';
import { DailySelectionRepositoryImpl } from '../repositories/DailySelectionRepositoryImpl';

// Import use cases
import { CreateTaskUseCase } from '../../application/use-cases/CreateTaskUseCase';
import { UpdateTaskUseCase } from '../../application/use-cases/UpdateTaskUseCase';
import { CompleteTaskUseCase } from '../../application/use-cases/CompleteTaskUseCase';
import { GetTodayTasksUseCase } from '../../application/use-cases/GetTodayTasksUseCase';
import { AddTaskToTodayUseCase } from '../../application/use-cases/AddTaskToTodayUseCase';
import { RemoveTaskFromTodayUseCase } from '../../application/use-cases/RemoveTaskFromTodayUseCase';
import { GetTaskLogsUseCase } from '../../application/use-cases/GetTaskLogsUseCase';
import { CreateUserLogUseCase } from '../../application/use-cases/CreateUserLogUseCase';

// Import services
import { LogService } from '../../application/services/LogService';

// Import tokens
import * as tokens from './tokens';

/**
 * Configure the DI container with all dependencies
 */
export function configureContainer(): void {
  // Register database as singleton
  container.registerSingleton(tokens.DATABASE_TOKEN, TodoDatabase);
  
  // Register event bus as singleton
  container.registerSingleton(tokens.EVENT_BUS_TOKEN, PersistentEventBusImpl);
  
  // Register repositories as singletons
  container.registerSingleton(tokens.TASK_REPOSITORY_TOKEN, TaskRepositoryImpl);
  container.registerSingleton(tokens.DAILY_SELECTION_REPOSITORY_TOKEN, DailySelectionRepositoryImpl);
  
  // Register use cases as singletons
  container.registerSingleton(tokens.CREATE_TASK_USE_CASE_TOKEN, CreateTaskUseCase);
  container.registerSingleton(tokens.UPDATE_TASK_USE_CASE_TOKEN, UpdateTaskUseCase);
  container.registerSingleton(tokens.COMPLETE_TASK_USE_CASE_TOKEN, CompleteTaskUseCase);
  container.registerSingleton(tokens.GET_TODAY_TASKS_USE_CASE_TOKEN, GetTodayTasksUseCase);
  container.registerSingleton(tokens.ADD_TASK_TO_TODAY_USE_CASE_TOKEN, AddTaskToTodayUseCase);
  container.registerSingleton(tokens.REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN, RemoveTaskFromTodayUseCase);
  container.registerSingleton(tokens.GET_TASK_LOGS_USE_CASE_TOKEN, GetTaskLogsUseCase);
  container.registerSingleton(tokens.CREATE_USER_LOG_USE_CASE_TOKEN, CreateUserLogUseCase);
  
  // Register services as singletons
  container.registerSingleton(tokens.LOG_SERVICE_TOKEN, LogService);
}

export { container };