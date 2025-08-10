import { injectable, inject } from "tsyringe";
import type { Result } from "../../domain/Result";
import { ResultFactory } from "../../domain/Result";
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
import * as tokens from "../../infrastructure/di/tokens";

export interface SummaryServiceConfig {
  autoScheduleEnabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  autoProcessEnabled: boolean;
  processIntervalMs: number;
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
@injectable()
export class SummaryService {
  private readonly config: SummaryServiceConfig;
  private processIntervalId?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository,
    @inject(tokens.SCHEDULE_SUMMARIES_USE_CASE_TOKEN)
    private readonly scheduleSummariesUseCase: ScheduleSummariesUseCase,
    @inject(tokens.CREATE_SUMMARY_USE_CASE_TOKEN)
    private readonly createSummaryUseCase: CreateSummaryUseCase,
    @inject(tokens.PROCESS_SUMMARY_USE_CASE_TOKEN)
    private readonly processSummaryUseCase: ProcessSummaryUseCase,
    config?: Partial<SummaryServiceConfig>
  ) {
    this.config = {
      autoScheduleEnabled: true,
      maxRetries: 3,
      retryDelayMs: 5000,
      autoProcessEnabled: true,
      processIntervalMs: 10000, // 10 seconds
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

      if (this.config.autoProcessEnabled) {
        this.startAutoProcessing();
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

    console.log(`Scheduled summaries:`, result.data);
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

    return ResultFactory.success(result.data.summaryId);
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

    const failedSummaries = failedSummariesResult.data;
    let retriedCount = 0;

    for (const summary of failedSummaries) {
      if (summary.retryCount >= this.config.maxRetries) {
        continue; // Skip summaries that have exceeded max retries
      }

      try {
        summary.retry();
      } catch (error) {
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
    weekStart: DateOnly
  ): Promise<Result<Summary | null, Error>> {
    return await this.summaryRepository.findWeeklySummaryByRange(weekStart);
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
        return ResultFactory.failure(statsResult.error);
      }

      const stats = statsResult.data;
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
        const completedDaily = dailySummariesResult.data
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) => b.date!.toString().localeCompare(a.date!.toString()));
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
        const completedWeekly = weeklySummariesResult.data
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) =>
            b.weekStart!.toString().localeCompare(a.weekStart!.toString())
          );
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
        const completedMonthly = monthlySummariesResult.data
          .filter((s) => s.status === SummaryStatus.DONE)
          .sort((a, b) => b.month!.localeCompare(a.month!));
        if (completedMonthly.length > 0) {
          overview.lastMonthlySummary = completedMonthly[0].month!;
        }
      }

      return ResultFactory.success(overview);
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  /**
   * Delete a summary
   */
  async deleteSummary(id: string): Promise<Result<void, Error>> {
    return await this.summaryRepository.delete(id);
  }

  /**
   * Start automatic processing of pending summaries
   */
  private startAutoProcessing(): void {
    if (this.processIntervalId) {
      return; // Already started
    }

    console.log("Starting automatic summary processing...");
    this.processIntervalId = setInterval(() => {
      this.processQueue().catch((error) => {
        console.error("Error in automatic summary processing:", error);
      });
    }, this.config.processIntervalMs);

    // Process immediately on start
    this.processQueue().catch((error) => {
      console.error("Error in initial summary processing:", error);
    });
  }

  /**
   * Stop automatic processing
   */
  stopAutoProcessing(): void {
    if (this.processIntervalId) {
      clearInterval(this.processIntervalId);
      this.processIntervalId = undefined;
      console.log("Stopped automatic summary processing");
    }
  }

  /**
   * Process pending summaries in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    this.isProcessing = true;
    try {
      const pendingResult = await this.summaryRepository.findPendingSummaries();
      if (pendingResult.isFailure()) {
        console.error("Failed to get pending summaries:", pendingResult.error);
        return;
      }

      const pendingSummaries = pendingResult.data;
      if (!pendingSummaries || pendingSummaries.length === 0) {
        return; // No pending summaries
      }

      console.log(`Processing ${pendingSummaries.length} pending summaries...`);

      for (const summary of pendingSummaries) {
        // Skip summaries that have exceeded max retries
        if (summary.retryCount >= this.config.maxRetries) {
          // Mark as permanently failed if not already done
          if (summary.status !== SummaryStatus.FAILED) {
            summary.markAsFailed("Exceeded maximum retry attempts");
            await this.summaryRepository.save(summary);
          }
          continue;
        }

        try {
          console.log(
            `Processing summary ${summary.id} (attempt ${summary.retryCount + 1}/${this.config.maxRetries})`
          );

          const processResult = await this.processSummary(summary.id);
          if (processResult.isSuccess()) {
            console.log(`Successfully processed summary ${summary.id}`);
          } else {
            console.error(
              `Failed to process summary ${summary.id}:`,
              processResult.error
            );

            // Increment retry count and save
            const updatedSummary = await this.summaryRepository.findById(
              summary.id
            );
            if (updatedSummary.isSuccess() && updatedSummary.data) {
              try {
                updatedSummary.data.retry();
                await this.summaryRepository.save(updatedSummary.data);
              } catch (error) {
                // Retry failed, skip
              }
            }
          }
        } catch (error) {
          console.error(`Error processing summary ${summary.id}:`, error);

          // Increment retry count on error
          const updatedSummary = await this.summaryRepository.findById(
            summary.id
          );
          if (updatedSummary.isSuccess() && updatedSummary.data) {
            try {
              updatedSummary.data.retry();
              await this.summaryRepository.save(updatedSummary.data);
            } catch (error) {
              // Retry failed, skip
            }
          }
        }

        // Add delay between processing attempts
        if (this.config.retryDelayMs > 0) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manually trigger queue processing
   */
  async triggerQueueProcessing(): Promise<Result<void, Error>> {
    try {
      await this.processQueue();
      return ResultFactory.success(undefined);
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  /**
   * Get queue processing status
   */
  getProcessingStatus(): {
    isProcessing: boolean;
    autoProcessEnabled: boolean;
  } {
    return {
      isProcessing: this.isProcessing,
      autoProcessEnabled:
        this.config.autoProcessEnabled && !!this.processIntervalId,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
