/**
 * Task events that can be emitted when tasks change
 */
export enum TaskEventType {
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_DELETED = 'TASK_DELETED',
  TASK_ADDED_TO_TODAY = 'TASK_ADDED_TO_TODAY',
  TASK_REMOVED_FROM_TODAY = 'TASK_REMOVED_FROM_TODAY'
}

/**
 * Base task event interface
 */
export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: Date;
  data?: any;
}

/**
 * Task created event
 */
export interface TaskCreatedEvent extends TaskEvent {
  type: TaskEventType.TASK_CREATED;
  data: {
    title: string;
    category: string;
  };
}

/**
 * Task updated event
 */
export interface TaskUpdatedEvent extends TaskEvent {
  type: TaskEventType.TASK_UPDATED;
  data: {
    title?: string;
    category?: string;
  };
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent extends TaskEvent {
  type: TaskEventType.TASK_COMPLETED;
}

/**
 * Task deleted event
 */
export interface TaskDeletedEvent extends TaskEvent {
  type: TaskEventType.TASK_DELETED;
}

/**
 * Task added to today event
 */
export interface TaskAddedToTodayEvent extends TaskEvent {
  type: TaskEventType.TASK_ADDED_TO_TODAY;
  data: {
    date: string;
  };
}

/**
 * Task removed from today event
 */
export interface TaskRemovedFromTodayEvent extends TaskEvent {
  type: TaskEventType.TASK_REMOVED_FROM_TODAY;
  data: {
    date: string;
  };
}

/**
 * Union type for all task events
 */
export type AnyTaskEvent = 
  | TaskCreatedEvent 
  | TaskUpdatedEvent 
  | TaskCompletedEvent 
  | TaskDeletedEvent 
  | TaskAddedToTodayEvent 
  | TaskRemovedFromTodayEvent;