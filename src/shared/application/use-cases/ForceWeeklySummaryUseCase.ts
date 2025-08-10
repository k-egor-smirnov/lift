import { injectable, inject } from "tsyringe";
import { UseCase } from "../UseCase";
import { Result, ResultUtils } from "../../domain/Result";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../domain/entities/Summary";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { EventBus } from "../../domain/events/EventBus";
import { SummaryUpdatedEvent } from "../../domain/events/SummaryEvents";
import { GetSummaryDataUseCase, SummaryData } from "./GetSummaryDataUseCase";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import * as tokens from "../../infrastructure/di/tokens";

export interface ForceWeeklySummaryRequest {
  summaryId: string;
  ignoreFailedDailies?: boolean;
}

export interface ForceWeeklySummaryResponse {
  success: boolean;
  fullSummary: string;
  shortSummary: string;
}

/**
 * Interface for LLM summarization service
 */
export interface LLMSummarizationRequest {
  type: SummaryType;
  data: SummaryData | string[];
  context?: any;
}

export interface LLMSummarizationResponse {
  fullSummary: string;
  shortSummary: string;
}

export interface LLMSummarizationService {
  generateSummary(
    request: LLMSummarizationRequest
  ): Promise<Result<LLMSummarizationResponse, Error>>;
}

/**
 * Use case for forcing weekly summary processing, optionally ignoring failed daily summaries
 */
@injectable()
export class ForceWeeklySummaryUseCase
  implements UseCase<ForceWeeklySummaryRequest, ForceWeeklySummaryResponse>
{
  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository,
    @inject(tokens.GET_SUMMARY_DATA_USE_CASE_TOKEN)
    private readonly getSummaryDataUseCase: GetSummaryDataUseCase,
    @inject(tokens.LLM_SUMMARIZATION_SERVICE_TOKEN)
    private readonly llmService: LLMSummarizationService,
    @inject(tokens.EVENT_BUS_TOKEN) private readonly eventBus: EventBus
  ) {}

  async execute(
    request: ForceWeeklySummaryRequest
  ): Promise<Result<ForceWeeklySummaryResponse, Error>> {
    try {
      // Get summary
      const summaryResult = await this.summaryRepository.findById(
        request.summaryId
      );
      if (summaryResult.isFailure()) {
        return ResultUtils.error(summaryResult.error);
      }

      const summary = summaryResult.value;
      if (!summary) {
        return ResultUtils.error(
          new Error(`Summary not found: ${request.summaryId}`)
        );
      }

      // Ensure it's a weekly summary
      if (summary.type !== SummaryType.WEEKLY) {
        return ResultUtils.error(
          new Error("This use case only supports weekly summaries")
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

      // Mark as processing
      const processingResult = summary.startProcessing();
      if (processingResult.isFailure()) {
        return ResultUtils.error(processingResult.error);
      }

      await this.summaryRepository.save(summary);
      await this.eventBus.publish(
        new SummaryUpdatedEvent(summary.id, SummaryStatus.PROCESSING)
      );

      try {
        // Get data for summarization
        const dataResult = await this.getWeeklySummarizationData(
          summary,
          request.ignoreFailedDailies
        );
        if (dataResult.isFailure()) {
          await this.handleProcessingError(summary, dataResult.error);
          return ResultUtils.error(dataResult.error);
        }

        // Process with LLM
        const llmRequest: LLMSummarizationRequest = {
          type: summary.type,
          data: dataResult.value,
          context: this.buildContext(summary),
        };

        const llmResult = await this.llmService.generateSummary(llmRequest);
        if (llmResult.isFailure()) {
          await this.handleProcessingError(summary, llmResult.error);
          return ResultUtils.error(llmResult.error);
        }

        // Complete summary
        const completeResult = summary.complete(
          llmResult.value.fullSummary,
          llmResult.value.shortSummary
        );
        if (completeResult.isFailure()) {
          await this.handleProcessingError(summary, completeResult.error);
          return ResultUtils.error(completeResult.error);
        }

        await this.summaryRepository.save(summary);
        await this.eventBus.publish(
          new SummaryUpdatedEvent(summary.id, SummaryStatus.DONE)
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

  private async getWeeklySummarizationData(
    summary: Summary,
    ignoreFailedDailies?: boolean
  ): Promise<Result<string[], Error>> {
    if (!summary.weekStart || !summary.weekEnd) {
      return ResultUtils.error(
        new Error("Weekly summary is missing weekStart or weekEnd dates")
      );
    }

    const dailySummariesResult =
      await this.summaryRepository.findDailySummariesForWeek(
        summary.weekStart,
        summary.weekEnd
      );

    if (dailySummariesResult.isFailure()) {
      return ResultUtils.error(dailySummariesResult.error);
    }

    const dailySummaries = dailySummariesResult.value;

    if (ignoreFailedDailies) {
      // Include completed summaries and use raw data for missing/failed days
      const completedSummaries = dailySummaries
        .filter((s) => s.status === SummaryStatus.DONE)
        .map((s) => s.shortSummary || "No summary available")
        .filter((s) => s.trim().length > 0);

      // For missing or failed days, get raw data
      const missingDays = this.getMissingDays(
        summary.weekStart,
        summary.weekEnd,
        dailySummaries
      );
      const rawDataPromises = missingDays.map(async (date) => {
        const rawDataResult = await this.getSummaryDataUseCase.execute({
          startDate: date,
          endDate: date,
        });

        if (rawDataResult.isSuccess() && rawDataResult.value) {
          return `Raw data for ${date.toString()}: ${this.formatRawData(rawDataResult.value)}`;
        }
        return `No data available for ${date.toString()}`;
      });

      const rawDataResults = await Promise.all(rawDataPromises);
      return ResultUtils.ok([...completedSummaries, ...rawDataResults]);
    } else {
      // Original behavior - only use completed summaries
      const shortSummaries = dailySummaries
        .filter((s) => s.status === SummaryStatus.DONE)
        .map((s) => s.shortSummary || "No summary available")
        .filter((s) => s.trim().length > 0);

      if (shortSummaries.length === 0) {
        return ResultUtils.error(
          new Error("No completed daily summaries found for this week")
        );
      }

      return ResultUtils.ok(shortSummaries);
    }
  }

  private getMissingDays(
    weekStart: DateOnly,
    weekEnd: DateOnly,
    existingSummaries: Summary[]
  ): DateOnly[] {
    const missingDays: DateOnly[] = [];
    const existingDates = new Set(
      existingSummaries
        .filter((s) => s.status === SummaryStatus.DONE)
        .map((s) => s.date?.toString())
        .filter(Boolean)
    );

    let current = weekStart;
    while (current.compareTo(weekEnd) <= 0) {
      if (!existingDates.has(current.toString())) {
        missingDays.push(current);
      }
      current = current.addDays(1);
    }

    return missingDays;
  }

  private formatRawData(data: SummaryData): string {
    let content = "";

    if (data.tasks && data.tasks.length > 0) {
      content +=
        "Tasks: " + data.tasks.map((task) => task.title).join(", ") + ". ";
    }

    if (data.logs && data.logs.length > 0) {
      content +=
        "Logs: " + data.logs.map((log) => log.content).join("; ") + ". ";
    }

    return content || "No activity recorded";
  }

  private buildContext(summary: Summary): any {
    return {
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
    };
  }

  private async handleProcessingError(
    summary: Summary,
    error: Error
  ): Promise<void> {
    try {
      const failResult = summary.markAsFailed(error.message);
      if (failResult.isSuccess()) {
        await this.summaryRepository.save(summary);
        await this.eventBus.publish(
          new SummaryUpdatedEvent(summary.id, SummaryStatus.FAILED)
        );
      }
    } catch (saveError) {
      // Log error but don't throw to avoid masking original error
      console.error("Failed to save error state:", saveError);
    }
  }
}
