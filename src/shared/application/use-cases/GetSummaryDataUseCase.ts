import { injectable, inject } from "tsyringe";
import { UseCase } from "../UseCase";
import { Result, ResultFactory } from "../../domain/Result";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { Task } from "../../domain/entities/Task";
import { TaskLogService } from "../../infrastructure/services/TaskLogService";
import * as tokens from "../../infrastructure/di/tokens";

export interface GetSummaryDataRequest {
  startDate: DateOnly;
  endDate: DateOnly;
}

export interface TaskLogEntry {
  id: string;
  taskId?: string;
  type: string;
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface SummaryData {
  tasks: Task[];
  taskLogs: TaskLogEntry[];
  systemLogs: TaskLogEntry[];
  dateRange: {
    start: DateOnly;
    end: DateOnly;
  };
}

/**
 * Use case for collecting data needed for summarization
 */
@injectable()
export class GetSummaryDataUseCase
  implements UseCase<GetSummaryDataRequest, SummaryData>
{
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(tokens.TASK_LOG_SERVICE_TOKEN)
    private readonly taskLogService: TaskLogService
  ) {}

  async execute(
    request: GetSummaryDataRequest
  ): Promise<Result<SummaryData, Error>> {
    try {
      // Get tasks in date range
      const tasksResult = await this.getTasksInDateRange(
        request.startDate,
        request.endDate
      );
      if (tasksResult.isFailure()) {
        return ResultFactory.failure(tasksResult.error);
      }

      // Get task logs in date range
      const taskLogsResult = await this.getTaskLogsInDateRange(
        request.startDate,
        request.endDate
      );
      if (taskLogsResult.isFailure()) {
        return ResultFactory.failure(taskLogsResult.error);
      }

      // Get system logs in date range
      const systemLogsResult = await this.getSystemLogsInDateRange(
        request.startDate,
        request.endDate
      );
      if (systemLogsResult.isFailure()) {
        return ResultFactory.failure(systemLogsResult.error);
      }

      const summaryData: SummaryData = {
        tasks: tasksResult.value,
        taskLogs: taskLogsResult.value,
        systemLogs: systemLogsResult.value,
        dateRange: {
          start: request.startDate,
          end: request.endDate,
        },
      };

      return ResultFactory.success(summaryData);
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  private async getTasksInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Task[], Error>> {
    // Get tasks created in date range
    const createdTasksResult =
      await this.taskRepository.findTasksCreatedInDateRange(startDate, endDate);
    if (createdTasksResult.isFailure()) {
      return ResultFactory.failure(createdTasksResult.error);
    }

    // Get tasks completed in date range
    const completedTasksResult =
      await this.taskRepository.findTasksCompletedInDateRange(
        startDate,
        endDate
      );
    if (completedTasksResult.isFailure()) {
      return ResultFactory.failure(completedTasksResult.error);
    }

    // Combine and deduplicate tasks
    const allTasks = [
      ...createdTasksResult.value,
      ...completedTasksResult.value,
    ];
    const uniqueTasks = this.deduplicateTasks(allTasks);

    return ResultFactory.success(uniqueTasks);
  }

  private async getTaskLogsInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<TaskLogEntry[], Error>> {
    const startDateTime = startDate.toDate();
    const endDateTime = new Date(endDate.toDate());
    endDateTime.setHours(23, 59, 59, 999); // End of day

    return await this.taskLogService.getTaskLogsInDateRange(
      startDateTime,
      endDateTime
    );
  }

  private async getSystemLogsInDateRange(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<TaskLogEntry[], Error>> {
    const startDateTime = startDate.toDate();
    const endDateTime = new Date(endDate.toDate());
    endDateTime.setHours(23, 59, 59, 999); // End of day

    return await this.taskLogService.getSystemLogsInDateRange(
      startDateTime,
      endDateTime
    );
  }

  private deduplicateTasks(tasks: Task[]): Task[] {
    const taskMap = new Map<string, Task>();

    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    return Array.from(taskMap.values());
  }
}
