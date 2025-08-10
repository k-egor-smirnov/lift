import "reflect-metadata";
import { container } from "tsyringe";

// Import implementations
import { TodoDatabase } from "../database/TodoDatabase";
import { PersistentEventBusImpl } from "../../domain/events/EventBus";
import { TaskRepositoryImpl } from "../repositories/TaskRepositoryImpl";
import { DailySelectionRepositoryImpl } from "../repositories/DailySelectionRepositoryImpl";
import { SummaryRepositoryImpl } from "../repositories/SummaryRepositoryImpl";
import { TaskEventAdapter } from "../events/TaskEventAdapter";

// Import use cases
import { CreateTaskUseCase } from "../../application/use-cases/CreateTaskUseCase";
import { UpdateTaskUseCase } from "../../application/use-cases/UpdateTaskUseCase";
import { DeleteTaskUseCase } from "../../application/use-cases/DeleteTaskUseCase";
import { ReorderTasksUseCase } from "../../application/use-cases/ReorderTasksUseCase";
import { CompleteTaskUseCase } from "../../application/use-cases/CompleteTaskUseCase";
import { RevertTaskCompletionUseCase } from "../../application/use-cases/RevertTaskCompletionUseCase";
import { GetTodayTasksUseCase } from "../../application/use-cases/GetTodayTasksUseCase";
import { AddTaskToTodayUseCase } from "../../application/use-cases/AddTaskToTodayUseCase";
import { RemoveTaskFromTodayUseCase } from "../../application/use-cases/RemoveTaskFromTodayUseCase";
import { GetTaskLogsUseCase } from "../../application/use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../../application/use-cases/CreateUserLogUseCase";
import { CreateSystemLogUseCase } from "../../application/use-cases/CreateSystemLogUseCase";
import { DeferTaskUseCase } from "../../application/use-cases/DeferTaskUseCase";
import { UndeferTaskUseCase } from "../../application/use-cases/UndeferTaskUseCase";
import { ChangeTaskNoteUseCase } from "../../application/use-cases/ChangeTaskNoteUseCase";
import { SummarizeLogsUseCase } from "../../application/use-cases/SummarizeLogsUseCase";
import { GetSummaryDataUseCase } from "../../application/use-cases/GetSummaryDataUseCase";
import { CreateSummaryUseCase } from "../../application/use-cases/CreateSummaryUseCase";
import { ScheduleSummariesUseCase } from "../../application/use-cases/ScheduleSummariesUseCase";
import { ProcessSummaryUseCase } from "../../application/use-cases/ProcessSummaryUseCase";
import { GetSyncHistoryUseCase } from "../../application/use-cases/GetSyncHistoryUseCase";
import { ForceSummarizationUseCase } from "../../application/use-cases/ForceSummarizationUseCase";
import { ForceWeeklySummaryUseCase } from "../../application/use-cases/ForceWeeklySummaryUseCase";
import { LLMSummarizationServiceImpl } from "../services/LLMSummarizationService";

// Import services
import { DeferredTaskService } from "../../application/services/DeferredTaskService";
import { SummaryService } from "../../application/services/SummaryService";
import { LLMService } from "../services/LLMService";
import { TaskLogService } from "../services/TaskLogService";

// Import tokens
import * as tokens from "./tokens";

/**
 * Configure the DI container with all dependencies
 */
export function configureContainer(): void {
  // Register database as singleton
  container.registerSingleton(tokens.DATABASE_TOKEN, TodoDatabase);

  // Register event bus as singleton
  container.registerSingleton(tokens.EVENT_BUS_TOKEN, PersistentEventBusImpl);

  // Register task event adapter as singleton
  container.registerSingleton(
    tokens.TASK_EVENT_ADAPTER_TOKEN,
    TaskEventAdapter
  );

  // Repositories
  container.registerSingleton(tokens.TASK_REPOSITORY_TOKEN, TaskRepositoryImpl);
  container.registerSingleton(
    tokens.DAILY_SELECTION_REPOSITORY_TOKEN,
    DailySelectionRepositoryImpl
  );
  container.registerSingleton(
    tokens.SUMMARY_REPOSITORY_TOKEN,
    SummaryRepositoryImpl
  );

  // Register use cases as singletons
  container.registerSingleton(
    tokens.CREATE_TASK_USE_CASE_TOKEN,
    CreateTaskUseCase
  );
  container.registerSingleton(
    tokens.UPDATE_TASK_USE_CASE_TOKEN,
    UpdateTaskUseCase
  );
  container.registerSingleton(
    tokens.DELETE_TASK_USE_CASE_TOKEN,
    DeleteTaskUseCase
  );
  container.registerSingleton(
    tokens.REORDER_TASKS_USE_CASE_TOKEN,
    ReorderTasksUseCase
  );
  container.registerSingleton(
    tokens.COMPLETE_TASK_USE_CASE_TOKEN,
    CompleteTaskUseCase
  );
  container.registerSingleton(
    tokens.REVERT_TASK_COMPLETION_USE_CASE_TOKEN,
    RevertTaskCompletionUseCase
  );
  container.registerSingleton(
    tokens.GET_TODAY_TASKS_USE_CASE_TOKEN,
    GetTodayTasksUseCase
  );
  container.registerSingleton(
    tokens.ADD_TASK_TO_TODAY_USE_CASE_TOKEN,
    AddTaskToTodayUseCase
  );
  container.registerSingleton(
    tokens.REMOVE_TASK_FROM_TODAY_USE_CASE_TOKEN,
    RemoveTaskFromTodayUseCase
  );
  container.registerSingleton(
    tokens.GET_TASK_LOGS_USE_CASE_TOKEN,
    GetTaskLogsUseCase
  );
  container.registerSingleton(
    tokens.CREATE_USER_LOG_USE_CASE_TOKEN,
    CreateUserLogUseCase
  );
  container.registerSingleton(
    tokens.CREATE_SYSTEM_LOG_USE_CASE_TOKEN,
    CreateSystemLogUseCase
  );
  container.registerSingleton(
    tokens.DEFER_TASK_USE_CASE_TOKEN,
    DeferTaskUseCase
  );
  container.registerSingleton(
    tokens.UNDEFER_TASK_USE_CASE_TOKEN,
    UndeferTaskUseCase
  );
  container.registerSingleton(
    tokens.CHANGE_TASK_NOTE_USE_CASE_TOKEN,
    ChangeTaskNoteUseCase
  );
  container.registerSingleton(
    tokens.SUMMARIZE_LOGS_USE_CASE_TOKEN,
    SummarizeLogsUseCase
  );
  container.registerSingleton(
    tokens.GET_SUMMARY_DATA_USE_CASE_TOKEN,
    GetSummaryDataUseCase
  );
  container.registerSingleton(
    tokens.CREATE_SUMMARY_USE_CASE_TOKEN,
    CreateSummaryUseCase
  );
  container.registerSingleton(
    tokens.SCHEDULE_SUMMARIES_USE_CASE_TOKEN,
    ScheduleSummariesUseCase
  );
  container.registerSingleton(
    tokens.GET_SYNC_HISTORY_USE_CASE_TOKEN,
    GetSyncHistoryUseCase
  );
  container.registerSingleton(
    tokens.PROCESS_SUMMARY_USE_CASE_TOKEN,
    ProcessSummaryUseCase
  );
  container.registerSingleton(
    tokens.FORCE_SUMMARIZATION_USE_CASE_TOKEN,
    ForceSummarizationUseCase
  );
  container.registerSingleton(
    tokens.FORCE_WEEKLY_SUMMARY_USE_CASE_TOKEN,
    ForceWeeklySummaryUseCase
  );

  // Register LLM summarization service
  container.registerSingleton(
    tokens.LLM_SUMMARIZATION_SERVICE_TOKEN,
    LLMSummarizationServiceImpl
  );

  // Register services as singletons
  container.registerSingleton(
    tokens.DEFERRED_TASK_SERVICE_TOKEN,
    DeferredTaskService
  );
  container.registerSingleton(tokens.SUMMARY_SERVICE_TOKEN, SummaryService);
  container.registerSingleton(tokens.LLM_SERVICE_TOKEN, LLMService);
  container.registerSingleton(tokens.TASK_LOG_SERVICE_TOKEN, TaskLogService);
}

/**
 * Initialize services that need startup configuration
 */
export async function initializeServices(): Promise<void> {
  const summaryService = container.resolve<SummaryService>(
    tokens.SUMMARY_SERVICE_TOKEN
  );
  const result = await summaryService.initialize();

  if (result.isFailure()) {
    console.error("Failed to initialize SummaryService:", result.error);
  }
}

export { container };
