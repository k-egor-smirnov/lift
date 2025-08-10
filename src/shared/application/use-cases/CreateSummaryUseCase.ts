import { injectable, inject } from "tsyringe";
import { UseCase } from "../UseCase";
import { Result, ResultFactory } from "../../domain/Result";
import { Summary, SummaryType } from "../../domain/entities/Summary";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { EventBus } from "../../domain/events/EventBus";
import {
  SummaryCreatedEvent,
  DailyDataCollectionRequestedEvent,
  WeeklySummarizationRequestedEvent,
  MonthlySummarizationRequestedEvent,
} from "../../domain/events/SummaryEvents";
import * as tokens from "../../infrastructure/di/tokens";

export interface CreateSummaryRequest {
  type: SummaryType;
  date?: DateOnly; // For daily summaries
  weekStart?: DateOnly; // For weekly summaries
  weekEnd?: DateOnly; // For weekly summaries
  month?: string; // For monthly summaries (YYYY-MM format)
  relatedSummaryIds?: string[]; // IDs of related summaries (daily for weekly, weekly for monthly)
}

export interface CreateSummaryResponse {
  summaryId: string;
}

/**
 * Use case for creating a new summary
 */
@injectable()
export class CreateSummaryUseCase
  implements UseCase<CreateSummaryRequest, CreateSummaryResponse>
{
  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository,
    @inject(tokens.EVENT_BUS_TOKEN)
    private readonly eventBus: EventBus
  ) {}

  async execute(
    request: CreateSummaryRequest
  ): Promise<Result<CreateSummaryResponse, Error>> {
    try {
      // Validate request based on summary type
      const validationResult = this.validateRequest(request);
      if (validationResult.isFailure()) {
        return ResultFactory.failure(validationResult.error);
      }

      // Check if summary already exists
      const existingResult = await this.checkExistingSummary(request);
      if (existingResult.isFailure()) {
        return ResultFactory.failure(existingResult.error);
      }

      if (existingResult.value) {
        return ResultFactory.success({ summaryId: existingResult.value.id });
      }

      // Create new summary
      const summary = this.createSummary(request);

      // Save summary
      const saveResult = await this.summaryRepository.save(summary);
      if (saveResult.isFailure()) {
        return ResultFactory.failure(saveResult.error);
      }

      // Emit domain event
      await this.eventBus.publish(new SummaryCreatedEvent(summary));

      // Emit processing event based on summary type
      await this.emitProcessingEvent(summary, request);

      return ResultFactory.success({ summaryId: summary.id });
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  private validateRequest(request: CreateSummaryRequest): Result<void, Error> {
    switch (request.type) {
      case SummaryType.DAILY:
        if (!request.date) {
          return ResultFactory.failure(
            new Error("Date is required for daily summaries")
          );
        }
        break;

      case SummaryType.WEEKLY:
        if (!request.weekStart || !request.weekEnd) {
          return ResultFactory.failure(
            new Error(
              "Week start and end dates are required for weekly summaries"
            )
          );
        }
        if (request.weekStart.isAfter(request.weekEnd)) {
          return ResultFactory.failure(
            new Error("Week start date must be before or equal to end date")
          );
        }
        break;

      case SummaryType.MONTHLY:
        if (!request.month) {
          return ResultFactory.failure(
            new Error("Month is required for monthly summaries")
          );
        }
        if (!/^\d{4}-\d{2}$/.test(request.month)) {
          return ResultFactory.failure(
            new Error("Month must be in YYYY-MM format")
          );
        }
        break;

      default:
        return ResultFactory.failure(
          new Error(`Unknown summary type: ${request.type}`)
        );
    }

    return ResultFactory.success(undefined);
  }

  private async checkExistingSummary(
    request: CreateSummaryRequest
  ): Promise<Result<Summary | null, Error>> {
    switch (request.type) {
      case SummaryType.DAILY:
        return await this.summaryRepository.findDailySummaryByDate(
          request.date!
        );

      case SummaryType.WEEKLY:
        return await this.summaryRepository.findWeeklySummaryByRange(
          request.weekStart!,
          request.weekEnd!
        );

      case SummaryType.MONTHLY:
        return await this.summaryRepository.findMonthlySummaryByMonth(
          request.month!
        );

      default:
        return ResultFactory.success(null);
    }
  }

  private createSummary(request: CreateSummaryRequest): Summary {
    const summaryId = this.generateSummaryId(request);

    switch (request.type) {
      case SummaryType.DAILY: {
        const dailyResult = Summary.create(
          summaryId,
          SummaryType.DAILY,
          request.date!
        );
        return dailyResult.summary;
      }

      case SummaryType.WEEKLY: {
        const weeklyResult = Summary.create(
          summaryId,
          SummaryType.WEEKLY,
          request.weekStart!, // Use weekStart as the main date
          request.weekStart!,
          request.weekEnd!
        );
        return weeklyResult.summary;
      }

      case SummaryType.MONTHLY: {
        // For monthly summaries, use the first day of the month as the date
        const monthDate = DateOnly.fromString(`${request.month!}-01`);
        const monthlyResult = Summary.create(
          summaryId,
          SummaryType.MONTHLY,
          monthDate,
          undefined,
          undefined,
          request.month!
        );
        return monthlyResult.summary;
      }

      default:
        throw new Error(`Unknown summary type: ${request.type}`);
    }
  }

  private generateSummaryId(request: CreateSummaryRequest): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    switch (request.type) {
      case SummaryType.DAILY:
        return `daily_${request.date!.toString()}_${timestamp}_${random}`;
      case SummaryType.WEEKLY:
        return `weekly_${request.weekStart!.toString()}_${request.weekEnd!.toString()}_${timestamp}_${random}`;
      case SummaryType.MONTHLY:
        return `monthly_${request.month!}_${timestamp}_${random}`;
      default:
        return `summary_${timestamp}_${random}`;
    }
  }

  private async emitProcessingEvent(
    summary: Summary,
    request: CreateSummaryRequest
  ): Promise<void> {
    switch (request.type) {
      case SummaryType.DAILY:
        await this.eventBus.publish(
          new DailyDataCollectionRequestedEvent(request.date!, summary.id)
        );
        break;

      case SummaryType.WEEKLY:
        await this.eventBus.publish(
          new WeeklySummarizationRequestedEvent(
            request.weekStart!,
            request.weekEnd!,
            summary.id
          )
        );
        break;

      case SummaryType.MONTHLY:
        await this.eventBus.publish(
          new MonthlySummarizationRequestedEvent(request.month!, summary.id)
        );
        break;
    }
  }
}
