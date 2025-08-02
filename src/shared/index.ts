// Domain exports
export * from './domain/entities/Task';
export * from './domain/value-objects/TaskId';
export * from './domain/value-objects/DateOnly';
export * from './domain/types';
export * from './domain/repositories/TaskRepository';
export * from './domain/repositories/DailySelectionRepository';
export * from './domain/repositories/DayResetRepository';
export * from './domain/events/TaskEvent';

// Application exports
export * from './application/use-cases';
export * from './application/services/TaskLogService';
export * from './application/services/DeferredTaskService';

// Infrastructure exports
export * from './infrastructure/di';
export * from './infrastructure/database/TodoDatabase';
export * from './infrastructure/events/TaskEventBus';
export * from './infrastructure/events/TaskEventAdapter';
export * from './infrastructure/repositories/TaskRepositoryImpl';
export * from './infrastructure/repositories/DailySelectionRepositoryImpl';
export * from './infrastructure/repositories/SupabaseDayResetRepository';

// UI exports
export * from './ui';

// Hooks exports
export * from './hooks';