import { injectable, inject } from "tsyringe";
import { Result, ResultFactory } from "../../domain/Result";
import { TodoDatabase } from "../database/TodoDatabase";
import { TaskLogEntry } from "../../application/use-cases/GetSummaryDataUseCase";
import * as tokens from "../di/tokens";

/**
 * Service for accessing task logs from the database
 */
@injectable()
export class TaskLogService {
  constructor(@inject(tokens.DATABASE_TOKEN) private db: TodoDatabase) {}

  async getTaskLogsInDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Result<TaskLogEntry[], Error>> {
    try {
      const records = await this.db.taskLogs
        .filter((record) => {
          const createdTime = record.createdAt.getTime();
          return (
            createdTime >= startDate.getTime() &&
            createdTime <= endDate.getTime() &&
            record.type !== "SYSTEM"
          );
        })
        .sortBy("createdAt");

      const taskLogs: TaskLogEntry[] = records.map((record) => ({
        id: record.id,
        taskId: record.taskId,
        type: record.type,
        message: record.message,
        metadata: record.metadata,
        createdAt: record.createdAt,
      }));

      return ResultFactory.success(taskLogs);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to get task logs in date range: ${error}`)
      );
    }
  }

  async getSystemLogsInDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Result<TaskLogEntry[], Error>> {
    try {
      const records = await this.db.taskLogs
        .filter((record) => {
          const createdTime = record.createdAt.getTime();
          return (
            createdTime >= startDate.getTime() &&
            createdTime <= endDate.getTime() &&
            record.type === "SYSTEM"
          );
        })
        .sortBy("createdAt");

      const systemLogs: TaskLogEntry[] = records.map((record) => ({
        id: record.id,
        taskId: record.taskId,
        type: record.type,
        message: record.message,
        metadata: record.metadata,
        createdAt: record.createdAt,
      }));

      return ResultFactory.success(systemLogs);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to get system logs in date range: ${error}`)
      );
    }
  }
}
