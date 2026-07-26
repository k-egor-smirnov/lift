import { AddTaskToTodayUseCase } from "../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import { CreateSystemLogUseCase } from "../../../../shared/application/use-cases/CreateSystemLogUseCase";
import { RemoveTaskFromTodayUseCase } from "../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { GetTodayTasksUseCase } from "../../../../shared/application/use-cases/GetTodayTasksUseCase";

/** Application orchestration for explicit daily-selection user actions. */
export class DailySelectionService {
  constructor(
    private readonly getTodayTasksUseCase: Pick<
      GetTodayTasksUseCase,
      "execute"
    >,
    private readonly addTaskToTodayUseCase: Pick<
      AddTaskToTodayUseCase,
      "execute"
    >,
    private readonly removeTaskFromTodayUseCase: Pick<
      RemoveTaskFromTodayUseCase,
      "execute"
    >,
    private readonly createSystemLogUseCase: Pick<
      CreateSystemLogUseCase,
      "execute"
    >
  ) {}

  async addTaskToToday(taskId: string): Promise<void> {
    const result = await this.addTaskToTodayUseCase.execute({ taskId });
    if (!result.success) throw new Error(result.error.message);

    await this.createSystemLogUseCase.execute({
      taskId,
      action: "added_to_today",
    });
  }

  async removeTaskFromToday(taskId: string): Promise<void> {
    const result = await this.removeTaskFromTodayUseCase.execute({ taskId });
    if (!result.success) throw new Error(result.error.message);

    await this.createSystemLogUseCase.execute({
      taskId,
      action: "removed_from_today",
    });
  }

  async isTaskInToday(taskId: string): Promise<boolean> {
    return (await this.getTodayTaskIds()).includes(taskId);
  }

  async getTodayTaskIds(): Promise<string[]> {
    const result = await this.getTodayTasksUseCase.execute({
      includeCompleted: true,
    });
    if (!result.success) throw new Error(result.error.message);
    return result.data.tasks.map((task) => task.taskId);
  }
}
