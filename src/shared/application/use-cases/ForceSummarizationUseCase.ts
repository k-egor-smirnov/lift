import { injectable, inject } from "tsyringe";
import { UseCase } from "../interfaces/UseCase";
import { Result, ResultFactory } from "../../domain/Result";
import {
  CreateSummaryUseCase,
  CreateSummaryRequest,
} from "./CreateSummaryUseCase";
import {
  ProcessSummaryUseCase,
  ProcessSummaryRequest,
} from "./ProcessSummaryUseCase";
import { SummaryType } from "../../domain/entities/Summary";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import * as tokens from "../../infrastructure/di/tokens";

export interface ForceSummarizationRequest {
  type: SummaryType;
  date?: DateOnly; // For daily summaries
  weekStart?: DateOnly; // For weekly summaries
  weekEnd?: DateOnly; // For weekly summaries
  month?: string; // For monthly summaries (YYYY-MM format)
  forceRegenerate?: boolean; // If true, regenerate even if summary exists
}

export interface ForceSummarizationResponse {
  summaryId: string;
  created: boolean; // true if new summary was created, false if existing was used
  processing: boolean; // true if processing was started
  fullSummary?: string;
  shortSummary?: string;
  error?: string;
}

/**
 * Use case for forcing summarization generation for a past period
 */
@injectable()
export class ForceSummarizationUseCase
  implements UseCase<ForceSummarizationRequest, ForceSummarizationResponse>
{
  constructor(
    @inject(tokens.CREATE_SUMMARY_USE_CASE_TOKEN)
    private readonly createSummaryUseCase: CreateSummaryUseCase,
    @inject(tokens.PROCESS_SUMMARY_USE_CASE_TOKEN)
    private readonly processSummaryUseCase: ProcessSummaryUseCase
  ) {}

  async execute(
    request: ForceSummarizationRequest
  ): Promise<Result<ForceSummarizationResponse, Error>> {
    try {
      // Create summary request
      const createRequest: CreateSummaryRequest = {
        type: request.type,
        date: request.date,
        weekStart: request.weekStart,
        weekEnd: request.weekEnd,
        month: request.month,
      };

      // Create or get existing summary
      const createResult =
        await this.createSummaryUseCase.execute(createRequest);

      if (createResult.isFailure()) {
        return ResultFactory.failure(createResult.error);
      }

      const summaryId = createResult.data.summaryId;
      let created = true; // Assume created unless we detect it was existing

      // Process the summary
      const processRequest: ProcessSummaryRequest = {
        summaryId,
      };

      const processResult =
        await this.processSummaryUseCase.execute(processRequest);

      if (processResult.isFailure()) {
        // If processing failed, still return the summary ID but with error
        return ResultFactory.success({
          summaryId,
          created,
          processing: false,
          error: processResult.error.message,
        });
      }

      return ResultFactory.success({
        summaryId,
        created,
        processing: true,
        fullSummary: processResult.data.fullSummary,
        shortSummary: processResult.data.shortSummary,
      });
    } catch (error) {
      return ResultFactory.failure(
        error instanceof Error
          ? error
          : new Error("Failed to force summarization")
      );
    }
  }

  /**
   * Helper method to create force summarization request for daily summary
   */
  static createDailyRequest(
    date: DateOnly,
    forceRegenerate = false
  ): ForceSummarizationRequest {
    return {
      type: SummaryType.DAILY,
      date,
      forceRegenerate,
    };
  }

  /**
   * Helper method to create force summarization request for weekly summary
   */
  static createWeeklyRequest(
    weekStart: DateOnly,
    weekEnd: DateOnly,
    forceRegenerate = false
  ): ForceSummarizationRequest {
    return {
      type: SummaryType.WEEKLY,
      weekStart,
      weekEnd,
      forceRegenerate,
    };
  }

  /**
   * Helper method to create force summarization request for monthly summary
   */
  static createMonthlyRequest(
    month: string,
    forceRegenerate = false
  ): ForceSummarizationRequest {
    return {
      type: SummaryType.MONTHLY,
      month,
      forceRegenerate,
    };
  }
}
