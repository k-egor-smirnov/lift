import { injectable, inject } from "tsyringe";
import { UseCase } from "../UseCase";
import type { Result } from "../../domain/Result";
import { ResultUtils } from "../../domain/Result";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../domain/entities/Summary";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { EventBus } from "../../domain/events/EventBus";
import { GetSummaryDataUseCase } from "./GetSummaryDataUseCase";
import type { SummaryData } from "./GetSummaryDataUseCase";
import { TodoDatabase } from "../../infrastructure/database/TodoDatabase";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import * as tokens from "../../infrastructure/di/tokens";

export interface ProcessSummaryRequest {
  summaryId: string;
}

export interface ProcessSummaryResponse {
  success: boolean;
  fullSummary?: string;
  shortSummary?: string;
  error?: string;
}

export interface LLMSummarizationRequest {
  type: SummaryType;
  data: SummaryData | string[]; // Raw data for daily, or previous summaries for weekly/monthly
  context?: {
    date?: DateOnly;
    weekStart?: DateOnly;
    weekEnd?: DateOnly;
    month?: string;
  };
}

export interface LLMSummarizationResponse {
  fullSummary: string;
  shortSummary: string;
}

/**
 * Use case for processing a summary using LLM
 */
@injectable()
export class ProcessSummaryUseCase
  implements UseCase<ProcessSummaryRequest, ProcessSummaryResponse>
{
  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository,
    @inject(tokens.GET_SUMMARY_DATA_USE_CASE_TOKEN)
    private readonly getSummaryDataUseCase: GetSummaryDataUseCase,
    @inject(tokens.LLM_SUMMARIZATION_SERVICE_TOKEN)
    private readonly llmService: LLMSummarizationService,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus,
    @inject(tokens.DATABASE_TOKEN) private readonly database: TodoDatabase
  ) {}

  async execute(
    request: ProcessSummaryRequest
  ): Promise<Result<ProcessSummaryResponse, Error>> {
    try {
      // Get summary
      const summaryResult = await this.summaryRepository.findById(
        request.summaryId
      );
      if (summaryResult.isFailure()) {
        return ResultUtils.error(summaryResult.error);
      }

      const summary = summaryResult.data;
      if (!summary) {
        return ResultUtils.error(
          new Error(`Summary not found: ${request.summaryId}`)
        );
      }

      // Check if summary can be processed
      if (summary.status === SummaryStatus.PROCESSING) {
        return ResultUtils.error(
          new Error("Summary is already being processed")
        );
      }

      if (summary.status === SummaryStatus.DONE) {
        return ResultUtils.ok({
          success: true,
          fullSummary: summary.fullSummary,
          shortSummary: summary.shortSummary,
        });
      }

      // Mark as processing and save in transaction
      const processingEvents = summary.startProcessing();

      await this.database.transaction(
        "rw",
        [this.database.summaries, this.database.eventStore],
        async () => {
          await this.summaryRepository.save(summary);
          await this.eventBus.publishAll(processingEvents);
        }
      );

      try {
        // Get data for summarization
        const dataResult = await this.getSummarizationData(summary);
        if (dataResult.isFailure()) {
          await this.handleProcessingError(summary, dataResult.error);
          return ResultUtils.error(dataResult.error);
        }

        // Process with LLM
        const llmRequest: LLMSummarizationRequest = {
          type: summary.type,
          data: dataResult.data,
          context: this.buildContext(summary),
        };

        const llmResult = await this.llmService.generateSummary(llmRequest);
        if (llmResult.isFailure()) {
          await this.handleProcessingError(summary, llmResult.error);
          return ResultUtils.error(llmResult.error);
        }

        // Complete summary and save in transaction
        const completeEvents = summary.complete(
          llmResult.data.fullSummary,
          llmResult.data.shortSummary
        );

        await this.database.transaction(
          "rw",
          [this.database.summaries, this.database.eventStore],
          async () => {
            await this.summaryRepository.save(summary);
            await this.eventBus.publishAll(completeEvents);
          }
        );

        return ResultUtils.ok({
          success: true,
          fullSummary: summary.fullSummary,
          shortSummary: summary.shortSummary,
        });
      } catch (error) {
        await this.handleProcessingError(summary, error as Error);
        return ResultUtils.error(error as Error);
      }
    } catch (error) {
      return ResultUtils.error(error as Error);
    }
  }

  private async getSummarizationData(
    summary: Summary
  ): Promise<Result<SummaryData | string[], Error>> {
    switch (summary.type) {
      case SummaryType.DAILY:
        // For daily summaries, get raw data
        return await this.getSummaryDataUseCase.execute({
          startDate: summary.date!,
          endDate: summary.date!,
        });

      case SummaryType.WEEKLY:
        // For weekly summaries, get short summaries from daily summaries
        return await this.getDailySummariesForWeek(summary);

      case SummaryType.MONTHLY:
        // For monthly summaries, get short summaries from weekly summaries
        return await this.getWeeklySummariesForMonth(summary);

      default:
        return ResultUtils.error(
          new Error(`Unknown summary type: ${summary.type}`)
        );
    }
  }

  private async getDailySummariesForWeek(
    summary: Summary
  ): Promise<Result<string[], Error>> {
    const dailySummariesResult =
      await this.summaryRepository.findDailySummariesForWeek(
        summary.weekStart!,
        summary.weekEnd!
      );

    if (dailySummariesResult.isFailure()) {
      return ResultUtils.error(dailySummariesResult.error);
    }

    const dailySummaries = dailySummariesResult.data;
    const shortSummaries = dailySummaries
      .filter((s) => s.status === SummaryStatus.DONE)
      .map((s) => s.shortSummary || "No summary available")
      .filter((s) => s.trim().length > 0);

    return ResultUtils.ok(shortSummaries);
  }

  private async getWeeklySummariesForMonth(
    summary: Summary
  ): Promise<Result<string[], Error>> {
    const weeklySummariesResult =
      await this.summaryRepository.findWeeklySummariesForMonth(summary.month!);

    if (weeklySummariesResult.isFailure()) {
      return ResultUtils.error(weeklySummariesResult.error);
    }

    const weeklySummaries = weeklySummariesResult.data;
    const shortSummaries = weeklySummaries
      .filter((s) => s.status === SummaryStatus.DONE)
      .map((s) => s.shortSummary || "No summary available")
      .filter((s) => s.trim().length > 0);

    return ResultUtils.ok(shortSummaries);
  }

  private buildContext(summary: Summary): any {
    const context: any = {};

    switch (summary.type) {
      case SummaryType.DAILY:
        context.date = summary.date;
        break;
      case SummaryType.WEEKLY:
        context.weekStart = summary.weekStart;
        context.weekEnd = summary.weekEnd;
        break;
      case SummaryType.MONTHLY:
        context.month = summary.month;
        break;
    }

    return context;
  }

  private async handleProcessingError(
    summary: Summary,
    error: Error
  ): Promise<void> {
    try {
      const failedEvents = summary.markAsFailed(error.message);

      await this.database.transaction(
        "rw",
        [this.database.summaries, this.database.eventStore],
        async () => {
          await this.summaryRepository.save(summary);
          await this.eventBus.publishAll(failedEvents);
        }
      );
    } catch (saveError) {
      // Log error but don't throw to avoid masking original error
      console.error("Failed to save error state:", saveError);
    }
  }
}

/**
 * Interface for LLM summarization service (to be implemented in infrastructure layer)
 */
export interface LLMSummarizationService {
  generateSummary(
    request: LLMSummarizationRequest
  ): Promise<Result<LLMSummarizationResponse, Error>>;
}
