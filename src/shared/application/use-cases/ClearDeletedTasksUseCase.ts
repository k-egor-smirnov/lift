import { injectable, inject } from 'tsyringe';
import { TaskRepository } from '../../domain/repositories/TaskRepository';
import { EventBus } from '../../domain/events/EventBus';
import { TodoDatabase } from '../../infrastructure/database/TodoDatabase';
import { BaseTaskUseCase, TaskOperationError } from './BaseTaskUseCase';
import { Result, ResultUtils } from '../../domain/Result';
import { DebouncedSyncService } from '../services/DebouncedSyncService';
import * as tokens from '../../infrastructure/di/tokens';

export interface ClearDeletedTasksResponse {
  deleted: number;
}

@injectable()
export class ClearDeletedTasksUseCase extends BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN) taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN) debouncedSyncService: DebouncedSyncService
  ) {
    super(taskRepository, eventBus, database, debouncedSyncService);
  }

  async execute(): Promise<Result<ClearDeletedTasksResponse, TaskOperationError>> {
    try {
      const deletedTasks = await this.taskRepository.findDeleted();
      let count = 0;

      for (const task of deletedTasks) {
        const result = await this.executeInTransaction<void>(task, 'delete', []);
        if (ResultUtils.isFailure(result)) {
          return ResultUtils.error(result.error);
        }
        count++;
      }

      return ResultUtils.ok({ deleted: count });
    } catch (error) {
      return ResultUtils.error(
        new TaskOperationError(
          error instanceof Error ? error.message : 'Failed to clear trash',
          'CLEAR_TRASH_FAILED'
        )
      );
    }
  }
}
