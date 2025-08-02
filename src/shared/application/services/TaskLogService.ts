import { injectable, inject } from "tsyringe";
import { LogEntry } from "../use-cases/GetTaskLogsUseCase";
import { GetTaskLogsUseCase } from "../use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../use-cases/CreateUserLogUseCase";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Service for managing task logs
 * This service encapsulates log-related business logic and provides a clean API
 */
@injectable()
export class TaskLogService {
  constructor(
    @inject(tokens.GET_TASK_LOGS_USE_CASE_TOKEN)
    private getTaskLogsUseCase: GetTaskLogsUseCase,
    @inject(tokens.CREATE_USER_LOG_USE_CASE_TOKEN)
    private createUserLogUseCase: CreateUserLogUseCase
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

      if (result.success) {
        return result.data.logs;
      } else {
        console.error("Failed to load logs:", (result as any).error?.message);
        return [];
      }
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

      if (result.success) {
        return true;
      } else {
        console.error("Failed to create log:", (result as any).error?.message);
        return false;
      }
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
