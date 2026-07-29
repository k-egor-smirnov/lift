import { LogEntry } from "../use-cases/GetTaskLogsUseCase";
import { GetTaskLogsUseCase } from "../use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../use-cases/CreateUserLogUseCase";

/**
 * Service for managing task logs
 * This service encapsulates log-related business logic and provides a clean API
 */
export class TaskLogService {
  constructor(
    private readonly getTaskLogsUseCase: Pick<GetTaskLogsUseCase, "execute">,
    private readonly createUserLogUseCase: Pick<CreateUserLogUseCase, "execute">
  ) {}

  /**
   * Load logs for a specific task
   */
  async loadTaskLogs(taskId: string): Promise<LogEntry[]> {
    try {
      const result = await this.getTaskLogsUseCase.execute({
        taskId,
        sortOrder: "desc",
      });

      return result.success ? result.data.logs : [];
    } catch (error) {
      console.error("Error loading logs:", error);
      return [];
    }
  }

  /**
   * Create a new user log for a task
   */
  async createLog(taskId: string, message: string): Promise<boolean> {
    try {
      const result = await this.createUserLogUseCase.execute({
        taskId,
        message: message.trim(),
      });

      return result.success;
    } catch (error) {
      console.error("Error creating log:", error);
      return false;
    }
  }

  /**
   * Load logs for multiple tasks and return a map of taskId -> lastLog
   */
  async loadLastLogsForTasks(
    taskIds: string[]
  ): Promise<Record<string, LogEntry>> {
    const lastLogs: Record<string, LogEntry> = {};

    const logPromises = taskIds.map(async (taskId) => {
      const logs = await this.loadTaskLogs(taskId);
      if (logs.length > 0) {
        lastLogs[taskId] = logs[0]; // First log is the most recent due to desc order
      }
    });

    await Promise.all(logPromises);
    return lastLogs;
  }
}
