import { injectable, inject } from "tsyringe";
import { Result, ResultUtils } from "../../domain/Result";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import {
  LLMService,
  LLMSummarizationRequest,
} from "../../infrastructure/services/LLMService";
import { LLMSettings } from "../../domain/types/LLMSettings";
import { LogEntry } from "./GetTaskLogsUseCase";
import { Task } from "../../domain/entities/Task";
import { TaskStatus, TaskCategory } from "../../domain/types";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Request for log summarization
 */
export interface SummarizeLogsRequest {
  dateFrom?: Date;
  dateTo?: Date;
  includeTaskCreation?: boolean;
  includeTaskCompletion?: boolean;
  includeUserLogs?: boolean;
  includeSystemLogs?: boolean;
  maxTokens?: number;
}

/**
 * Response for log summarization
 */
export interface SummarizeLogsResponse {
  summary: string;
  period: {
    from: Date;
    to: Date;
  };
  stats: {
    tasksCreated: number;
    tasksCompleted: number;
    userLogsCount: number;
    systemLogsCount: number;
    totalLogsProcessed: number;
  };
  tokensUsed?: number;
}

/**
 * Error for log summarization
 */
export class SummarizeLogsError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "SummarizeLogsError";
  }
}

/**
 * Use case for summarizing logs using LLM
 */
@injectable()
export class SummarizeLogsUseCase {
  constructor(
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase,
    @inject(tokens.LLM_SERVICE_TOKEN) private readonly llmService: LLMService
  ) {}

  async execute(
    request: SummarizeLogsRequest,
    settings: LLMSettings
  ): Promise<Result<SummarizeLogsResponse, SummarizeLogsError>> {
    try {
      // Set default date range (last 7 days if not specified)
      const dateTo = request.dateTo || new Date();
      const dateFrom =
        request.dateFrom ||
        new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Collect data for summarization
      const data = await this.collectSummarizationData({
        dateFrom,
        dateTo,
        includeTaskCreation: request.includeTaskCreation ?? true,
        includeTaskCompletion: request.includeTaskCompletion ?? true,
        includeUserLogs: request.includeUserLogs ?? true,
        includeSystemLogs: request.includeSystemLogs ?? true,
      });

      if (data.totalLogsProcessed === 0) {
        return ResultUtils.error(
          new SummarizeLogsError(
            "No logs found for the specified period",
            "NO_LOGS_FOUND"
          )
        );
      }

      // Format content for LLM
      const content = this.formatContentForLLM(data, dateFrom, dateTo);

      // Call LLM service
      const llmRequest: LLMSummarizationRequest = {
        content,
        maxTokens: request.maxTokens,
      };

      const llmResult = await this.llmService.summarizeLogs(
        llmRequest,
        settings
      );

      if (ResultUtils.isFailure(llmResult)) {
        return ResultUtils.error(
          new SummarizeLogsError(
            `LLM summarization failed: ${llmResult.error.message}`,
            "LLM_ERROR"
          )
        );
      }

      return ResultUtils.ok({
        summary: llmResult.data.summary,
        period: {
          from: dateFrom,
          to: dateTo,
        },
        stats: {
          tasksCreated: data.createdTasks.length,
          tasksCompleted: data.completedTasks.length,
          userLogsCount: data.userLogs.length,
          systemLogsCount: data.systemLogs.length,
          totalLogsProcessed: data.totalLogsProcessed,
        },
        tokensUsed: llmResult.data.tokensUsed,
      });
    } catch (error) {
      return ResultUtils.error(
        new SummarizeLogsError(
          `Failed to summarize logs: ${error instanceof Error ? error.message : "Unknown error"}`,
          "SUMMARIZATION_FAILED"
        )
      );
    }
  }

  private async collectSummarizationData(request: {
    dateFrom: Date;
    dateTo: Date;
    includeTaskCreation: boolean;
    includeTaskCompletion: boolean;
    includeUserLogs: boolean;
    includeSystemLogs: boolean;
  }) {
    const { dateFrom, dateTo } = request;

    // Get all logs in the date range
    const allLogs = await this.database.taskLogs
      .where("createdAt")
      .between(dateFrom, dateTo, true, true)
      .toArray();

    // Get all tasks (for context)
    const allTasks = await this.database.tasks.toArray();
    const tasksMap = new Map(allTasks.map((task) => [task.id, task]));

    // Filter and categorize logs
    const userLogs: LogEntry[] = [];
    const systemLogs: LogEntry[] = [];
    const createdTasks: Task[] = [];
    const completedTasks: Task[] = [];

    for (const log of allLogs) {
      const logEntry: LogEntry = {
        id: log.id!,
        taskId: log.taskId,
        type: log.type,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt,
      };

      // Categorize logs
      if (log.type === "USER" && request.includeUserLogs) {
        userLogs.push(logEntry);
      } else if (log.type === "SYSTEM" && request.includeSystemLogs) {
        systemLogs.push(logEntry);

        // Check for task creation/completion events
        if (
          request.includeTaskCreation &&
          log.message.includes("Task created")
        ) {
          const task = tasksMap.get(log.taskId!);
          if (task && task.createdAt >= dateFrom && task.createdAt <= dateTo) {
            createdTasks.push(task);
          }
        }

        if (
          request.includeTaskCompletion &&
          log.message.includes("Task completed")
        ) {
          const task = tasksMap.get(log.taskId!);
          if (task && task.status === TaskStatus.COMPLETED) {
            completedTasks.push(task);
          }
        }
      }
    }

    // Also check for tasks created/completed in the period (in case logs are missing)
    if (request.includeTaskCreation) {
      const additionalCreatedTasks = allTasks.filter(
        (task) =>
          task.createdAt >= dateFrom &&
          task.createdAt <= dateTo &&
          !createdTasks.some((ct) => ct.id.value === task.id)
      );
      createdTasks.push(...additionalCreatedTasks);
    }

    return {
      userLogs,
      systemLogs,
      createdTasks,
      completedTasks,
      totalLogsProcessed: userLogs.length + systemLogs.length,
    };
  }

  private formatContentForLLM(
    data: {
      userLogs: LogEntry[];
      systemLogs: LogEntry[];
      createdTasks: Task[];
      completedTasks: Task[];
    },
    dateFrom: Date,
    dateTo: Date
  ): string {
    const formatDate = (date: Date) => date.toLocaleDateString("ru-RU");

    let content = `Период: ${formatDate(dateFrom)} - ${formatDate(dateTo)}\n\n`;

    // Created tasks
    if (data.createdTasks.length > 0) {
      content += `СОЗДАННЫЕ ЗАДАЧИ (${data.createdTasks.length}):\n`;
      data.createdTasks.forEach((task) => {
        const categoryName = this.getCategoryDisplayName(task.category);
        content += `- "${task.title.value}" (${categoryName})\n`;
      });
      content += "\n";
    }

    // Completed tasks
    if (data.completedTasks.length > 0) {
      content += `ВЫПОЛНЕННЫЕ ЗАДАЧИ (${data.completedTasks.length}):\n`;
      data.completedTasks.forEach((task) => {
        const categoryName = this.getCategoryDisplayName(task.category);
        content += `- "${task.title.value}" (${categoryName})\n`;
      });
      content += "\n";
    }

    // User logs (notes and updates)
    if (data.userLogs.length > 0) {
      content += `ЗАМЕТКИ И ОБНОВЛЕНИЯ (${data.userLogs.length}):\n`;
      data.userLogs.forEach((log) => {
        const date = log.createdAt.toLocaleDateString("ru-RU");
        const taskTitle = this.getTaskTitleFromLogs(log.taskId, data);
        const taskContext = taskTitle ? ` [${taskTitle}]` : "";
        content += `- ${date}${taskContext}: ${log.message}\n`;
      });
      content += "\n";
    }

    // Important system events
    const importantSystemLogs = data.systemLogs.filter(
      (log) =>
        !log.message.includes("Task created") &&
        !log.message.includes("Task completed") &&
        (log.message.includes("moved") ||
          log.message.includes("category changed") ||
          log.message.includes("deferred") ||
          log.message.includes("restored"))
    );

    if (importantSystemLogs.length > 0) {
      content += `ВАЖНЫЕ ИЗМЕНЕНИЯ (${importantSystemLogs.length}):\n`;
      importantSystemLogs.forEach((log) => {
        const date = log.createdAt.toLocaleDateString("ru-RU");
        const taskTitle = this.getTaskTitleFromLogs(log.taskId, data);
        const taskContext = taskTitle ? ` [${taskTitle}]` : "";
        content += `- ${date}${taskContext}: ${log.message}\n`;
      });
    }

    return content;
  }

  private getCategoryDisplayName(category: TaskCategory): string {
    switch (category) {
      case TaskCategory.INBOX:
        return "Входящие";
      case TaskCategory.SIMPLE:
        return "Простые";
      case TaskCategory.FOCUS:
        return "Фокус";
      case TaskCategory.DEFERRED:
        return "Отложенные";
      default:
        return category;
    }
  }

  private getTaskTitleFromLogs(
    taskId: string | undefined,
    data: any
  ): string | null {
    if (!taskId) return null;

    const task =
      data.createdTasks.find((t: Task) => t.id.value === taskId) ||
      data.completedTasks.find((t: Task) => t.id.value === taskId);

    return task ? task.title.value : null;
  }
}
