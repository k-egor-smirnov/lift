import { injectable } from "tsyringe";
import { TaskId } from "../../domain/value-objects/TaskId";
import { BaseTaskUseCase } from "./BaseTaskUseCase";
import { type Result, ResultUtils } from "../../domain/Result";

/**
 * Use case for changing a task's note
 */
@injectable()
export class ChangeTaskNoteUseCase extends BaseTaskUseCase {
  async execute(taskId: string, note?: string): Promise<Result<void>> {
    try {
      const id = new TaskId(taskId);
      const task = await this.taskRepository.findById(id);

      if (!task) {
        return Result.failure("Task not found");
      }

      const events = task.changeNote(note);
      await this.taskRepository.save(task);
      await this.publishEvents(events);
      await this.debouncedSyncService.scheduleSync();

      return ResultUtils.ok(undefined);
    } catch (error) {
      console.error("Failed to change task note:", error);
      return ResultUtils.error(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
