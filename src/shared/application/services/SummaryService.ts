import { Result, ResultFactory } from "../../domain/Result";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../domain/entities/Summary";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { ScheduleSummariesUseCase } from "../use-cases/ScheduleSummariesUseCase";
import { CreateSummaryUseCase } from "../use-cases/CreateSummaryUseCase";
import { ProcessSummaryUseCase } from "../use-cases/ProcessSummaryUseCase";

export interface SummaryServiceConfig {
  autoScheduleEnabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface SummaryOverview {
  totalSummaries: number;
  completedSummaries: number;
  pendingSummaries: number;
  failedSummaries: number;
  lastDailySummary?: DateOnly;
  lastWeeklySummary?: { weekStart: DateOnly; weekEnd: DateOnly };
  lastMonthlySummary?: string;
}

/**
 * Service for managing the summarization system
 */
export class SummaryService {
  private readonly config: SummaryServiceConfig;

  constructor(
    private readonly summaryRepository: SummaryRepository,
    private readonly scheduleSummariesUseCase: ScheduleSummariesUseCase,
    private readonly createSummaryUseCase: CreateSummaryUseCase,
    private readonly processSummaryUseCase: ProcessSummaryUseCase,
    config?: Partial<SummaryServiceConfig>
  ) {
    this.config = {
      autoScheduleEnabled: true,
      maxRetries: 3,
      retryDelayMs: 5000,
      ...config,
    };
  }

  /**
   * Initialize the summarization system
   * This should be called when the app starts
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      if (this.config.autoScheduleEnabled) {
        const scheduleResult = await this.scheduleMissingSummaries();
        if (scheduleResult.isFailure()) {
          console.error(
            "Failed to schedule missing summaries:",
            scheduleResult.error
          );
          // Don't fail initialization, just log the error
        }
      }

      return ResultFactory.success(undefined);
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  /**
   * Schedule all missing summaries up to today
   */
  async scheduleMissingSummaries(
    upToDate?: DateOnly
  ): Promise<Result<void, Error>> {
    const result = await this.scheduleSummariesUseCase.execute({
      upToDate: upToDate || DateOnly.today(),
    });

    if (result.isFailure()) {
      return ResultFactory.failure(result.error);
    }

    console.log(`Scheduled summaries:`, result.value);
    return ResultFactory.success(undefined);
  }

  /**
   * Create a specific summary manually
   */
  async createSummary(
    type: SummaryType,
    options: {
      date?: DateOnly;
      weekStart?: DateOnly;
      weekEnd?: DateOnly;
      month?: string;
    }
  ): Promise<Result<string, Error>> {
    const result = await this.createSummaryUseCase.execute({
      type,
      ...options,
    });

    if (result.isFailure()) {
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(result.value.summaryId);
  }

  /**
   * Process a specific summary
   */
  async processSummary(summaryId: string): Promise<Result<void, Error>> {
    const result = await this.processSummaryUseCase.execute({ summaryId });

    if (result.isFailure()) {
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(undefined);
  }

  /**
   * Retry failed summaries
   */
  async retryFailedSummaries(): Promise<Result<number, Error>> {
    const failedSummariesResult = await this.summaryRepository.findByStatus(
      SummaryStatus.FAILED
    );
    if (failedSummariesResult.isFailure()) {
      return ResultFactory.failure(failedSummariesResult.error);
    }

    const failedSummaries = failedSummariesResult.value;
    let retriedCount = 0;

    for (const summary of failedSummaries) {
      if (summary.retryCount >= this.config.maxRetries) {
        continue; // Skip summaries that have exceeded max retries
      }

      const retryResult = summary.retry();
      if (retryResult.isFailure()) {
        continue; // Skip if retry is not allowed
      }

      const saveResult = await this.summaryRepository.save(summary);
      if (saveResult.isFailure()) {
        continue; // Skip if save failed
      }

      // Process the summary
      const processResult = await this.processSummary(summary.id);
      if (processResult.isSuccess()) {
        retriedCount++;
      }

      // Add delay between retries
      if (this.config.retryDelayMs > 0) {
        await this.delay(this.config.retryDelayMs);
      }
    }

    return ResultFactory.success(retriedCount);
  }

  /**
   * Get summary by ID
   */
  async getSummary(id: string): Promise<Result<Summary | null, Error>> {
    return await this.summaryRepository.findById(id);
  }

  /**
   * Get daily summary for a specific date
   */
  async getDailySummary(
    date: DateOnly
  ): Promise<Result<Summary | null, Error>> {
    return await this.summaryRepository.findDailySummaryByDate(date);
  }

  /**
   * Get weekly summary for a specific week
   */
  async getWeeklySummary(
    weekStart: DateOnly,
    weekEnd: DateOnly
  ): Promise<Result<Summary | null, Error>> {
    return await this.summaryRepository.findWeeklySummaryByRange(
      weekStart,
      weekEnd
    );
  }

  /**
   * Get monthly summary for a specific month
   */
  async getMonthlySummary(
    month: string
  ): Promise<Result<Summary | null, Error>> {
    return await this.summaryRepository.findMonthlySummaryByMonth(month);
  }

  /**
   * Get summaries by type and date range
   */
  async getSummariesByTypeAndDateRange(
    type: SummaryType,
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Summary[], Error>> {
    return await this.summaryRepository.findByTypeAndDateRange(
      type,
      startDate,
      endDate
    );
  }

  /**
   * Get pending summaries (NEW or FAILED status)
   */
  async getPendingSummaries(): Promise<Result<Summary[], Error>> {
    return await this.summaryRepository.findPendingSummaries();
  }

  /**
   * Get summary statistics and overview
   */
  async getSummaryOverview(): Promise<Result<SummaryOverview, Error>> {
    try {
      const statsResult = await this.summaryRepository.getStatistics();
      if (statsResult.isFailure()) {
        return Result.failure(statsResult.error);
      }

      const stats = statsResult.value;
      const overview: SummaryOverview = {
        totalSummaries: stats.totalSummaries,
        completedSummaries: stats.completedSummaries,
        pendingSummaries: stats.pendingSummaries,
        failedSummaries: stats.failedSummaries,
      };

      // Get last summaries
      const today = DateOnly.today();
      const thirtyDaysAgo = today.addDays(-30);

      // Last daily summary
      const dailySummariesResult =
        await this.summaryRepository.findByTypeAndDateRange(
          SummaryType.DAILY,
          thirtyDaysAgo,
          today
        );
      if (dailySummariesResult.isSuccess()) {
        const completedDaily = dailySummariesResult.value
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) => b.date!.compareTo(a.date!));
        if (completedDaily.length > 0) {
          overview.lastDailySummary = completedDaily[0].date!;
        }
      }

      // Last weekly summary
      const weeklySummariesResult =
        await this.summaryRepository.findByTypeAndDateRange(
          SummaryType.WEEKLY,
          thirtyDaysAgo,
          today
        );
      if (weeklySummariesResult.isSuccess()) {
        const completedWeekly = weeklySummariesResult.value
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) => b.weekStart!.compareTo(a.weekStart!));
        if (completedWeekly.length > 0) {
          const lastWeekly = completedWeekly[0];
          overview.lastWeeklySummary = {
            weekStart: lastWeekly.weekStart!,
            weekEnd: lastWeekly.weekEnd!,
          };
        }
      }

      // Last monthly summary
      const monthlySummariesResult =
        await this.summaryRepository.findByTypeAndDateRange(
          SummaryType.MONTHLY,
          thirtyDaysAgo,
          today
        );
      if (monthlySummariesResult.isSuccess()) {
        const completedMonthly = monthlySummariesResult.value
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) => b.month!.localeCompare(a.month!));
        if (completedMonthly.length > 0) {
          overview.lastMonthlySummary = completedMonthly[0].month!;
        }
      }

      return Result.success(overview);
    } catch (error) {
      return Result.failure(error as Error);
    }
  }

  /**
   * Delete a summary
   */
  async deleteSummary(id: string): Promise<Result<void, Error>> {
    return await this.summaryRepository.delete(id);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
