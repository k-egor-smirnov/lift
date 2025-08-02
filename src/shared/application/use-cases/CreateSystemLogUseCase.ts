import { injectable, inject } from 'tsyringe';
import { TaskId } from '../../domain/value-objects/TaskId';
import { TodoDatabase, TaskLogRecord } from '../../infrastructure/database/TodoDatabase';
import { Result, ResultUtils } from '../../domain/Result';
import { DebouncedSyncService } from '../services/DebouncedSyncService';
import * as tokens from '../../infrastructure/di/tokens';
import i18n from '../../lib/i18n';
import { ulid } from 'ulid';

/**
 * System log types for automatic generation
 */
export type SystemLogAction = 
  | 'created'
  | 'category_changed'
  | 'completed'
  | 'reverted'
  | 'title_changed'
  | 'overdue'
  | 'conflict_resolved'
  | 'added_to_today'
  | 'removed_from_today'
  | 'daily_selection_cleared'
  | 'daily_modal_check'
  | 'new_day_transition'
  | 'new_day_transition_error';

/**
 * Request for creating a system log
 */
export interface CreateSystemLogRequest {
  taskId: string;
  action: SystemLogAction;
  metadata?: Record<string, any>;
  message?: string; // Optional custom message, will be auto-generated if not provided
}

/**
 * Domain errors for system log creation
 */
export class CreateSystemLogError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CreateSystemLogError';
  }
}

/**
 * Use case for creating system logs automatically
 */
@injectable()
export class CreateSystemLogUseCase {
  constructor(
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN) private readonly debouncedSyncService: DebouncedSyncService
  ) {}

  async execute(request: CreateSystemLogRequest): Promise<Result<void, CreateSystemLogError>> {
    try {
      // Parse and validate task ID
      let taskId: TaskId;
      try {
        taskId = TaskId.fromString(request.taskId);
      } catch (error) {
        return ResultUtils.error(
          new CreateSystemLogError('Invalid task ID format', 'INVALID_TASK_ID')
        );
      }

      // Generate message if not provided
      const message = request.message || this.generateSystemMessage(request.action, request.metadata);

      // Create log record
      const logRecord: TaskLogRecord = {
        id: ulid(),
        taskId: taskId.value,
        type: 'SYSTEM',
        message,
        metadata: request.metadata,
        createdAt: new Date()
      };

      // Save to database
      await this.database.taskLogs.add(logRecord);

      // Trigger debounced sync after successful creation
      this.debouncedSyncService.triggerSync();

      return ResultUtils.ok(undefined);
    } catch (error) {
      return ResultUtils.error(
        new CreateSystemLogError(
          `Failed to create system log: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CREATION_FAILED'
        )
      );
    }
  }

  /**
   * Generate automatic system messages based on action type
   */
  private generateSystemMessage(action: SystemLogAction, metadata?: Record<string, any>): string {
    switch (action) {
      case 'created':
        return `Task created in ${metadata?.category || 'unknown'} category`;
      
      case 'category_changed':
        return `Category changed from ${metadata?.fromCategory || 'unknown'} to ${metadata?.toCategory || 'unknown'}`;
      
      case 'completed':
        return `Task completed in ${metadata?.categoryAtCompletion || 'unknown'} category`;
      
      case 'reverted':
        return 'Task completion reverted';
      
      case 'title_changed':
        return `Title changed from "${metadata?.fromTitle || 'unknown'}" to "${metadata?.toTitle || 'unknown'}"`;
      
      case 'overdue':
        return `Task marked as overdue (${metadata?.daysOverdue || 'unknown'} days in Inbox)`;
      
      case 'conflict_resolved':
        return `Sync conflict resolved using ${metadata?.strategy || 'unknown'} strategy`;
      
      case 'added_to_today':
        return i18n.t('logs.actions.added_to_today');
      
      case 'removed_from_today':
        return i18n.t('logs.actions.removed_from_today');
      
      case 'daily_selection_cleared':
        return i18n.t('logs.actions.daily_selection_cleared');
      
      case 'daily_modal_check':
        return i18n.t('logs.actions.daily_modal_check');
      
      case 'new_day_transition':
        return i18n.t('logs.actions.new_day_transition');
      
      case 'new_day_transition_error':
        return i18n.t('logs.actions.new_day_transition_error');
      
      default:
        return `System action: ${action}`;
    }
  }
}