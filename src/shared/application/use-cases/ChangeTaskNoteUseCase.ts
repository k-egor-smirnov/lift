import { injectable, inject } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { BaseTaskUseCase } from "./BaseTaskUseCase";
import { type Result, ResultUtils } from "../../domain/Result";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { EventBus } from "../../domain/events/EventBus";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { DebouncedSyncService } from "../services/DebouncedSyncService";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for changing a task's note
 */
export interface ChangeTaskNoteRequest {
  taskId: TaskId;
  note?: string;
}

/**
 * Use case for changing a task's note
 */
@injectable()
export class ChangeTaskNoteUseCase extends BaseTaskUseCase {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    taskRepository: TaskRepository,
    @inject(tokens.EVENT_BUS_TOKEN) eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) database: TodoDatabase,
    @inject(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN)
    debouncedSyncService: DebouncedSyncService
  ) {
    super(taskRepository, eventBus, database, debouncedSyncService);
  }
  async execute(request: ChangeTaskNoteRequest): Promise<Result<void>> {
    try {
      if (!request.taskId) {
        return ResultUtils.error(new Error("Task ID is required"));
      }

      const task = await this.taskRepository.findById(request.taskId);

      if (!task) {
        return ResultUtils.error(new Error("Task not found"));
      }

      const events = task.changeNote(request.note);
      await this.taskRepository.save(task);
      if (events.length > 0) {
        await this.eventBus.publishAll(events);
      }
      this.debouncedSyncService.triggerSync();

      return ResultUtils.ok(undefined);
    } catch (error) {
      console.error("Failed to change task note:", error);
      return ResultUtils.error(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
