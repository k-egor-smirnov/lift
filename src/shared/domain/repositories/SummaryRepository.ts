import { Summary, SummaryType, SummaryStatus } from "../entities/Summary";
import { DateOnly } from "../value-objects/DateOnly";
import { Result } from "../Result";

/**
 * Repository interface for Summary entities
 */
export interface SummaryRepository {
  /**
   * Save a summary
   */
  save(summary: Summary): Promise<Result<void, Error>>;

  /**
   * Find summary by ID
   */
  findById(id: string): Promise<Result<Summary | null, Error>>;

  /**
   * Find daily summary by date
   */
  findDailySummaryByDate(
    date: DateOnly
  ): Promise<Result<Summary | null, Error>>;

  /**
   * Find weekly summary by week range
   */
  findWeeklySummaryByRange(
    weekStart: DateOnly,
    weekEnd: DateOnly
  ): Promise<Result<Summary | null, Error>>;

  /**
   * Find monthly summary by month
   */
  findMonthlySummaryByMonth(
    month: string
  ): Promise<Result<Summary | null, Error>>;

  /**
   * Find summaries by status
   */
  findByStatus(status: SummaryStatus): Promise<Result<Summary[], Error>>;

  /**
   * Find summaries by type and date range
   */
  findByTypeAndDateRange(
    type: SummaryType,
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Summary[], Error>>;

  /**
   * Find all summaries that need processing (NEW or FAILED status)
   */
  findPendingSummaries(): Promise<Result<Summary[], Error>>;

  /**
   * Find daily summaries for a week (for weekly summarization)
   */
  findDailySummariesForWeek(
    weekStart: DateOnly,
    weekEnd: DateOnly
  ): Promise<Result<Summary[], Error>>;

  /**
   * Find weekly summaries for a month (for monthly summarization)
   */
  findWeeklySummariesForMonth(month: string): Promise<Result<Summary[], Error>>;

  /**
   * Find missing daily summaries in date range
   */
  findMissingDailySummaries(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<DateOnly[], Error>>;

  /**
   * Find missing weekly summaries for completed daily summaries
   */
  findMissingWeeklySummaries(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Array<{ weekStart: DateOnly; weekEnd: DateOnly }>, Error>>;

  /**
   * Find missing monthly summaries for completed weekly summaries
   */
  findMissingMonthlySummaries(
    startMonth: string,
    endMonth: string
  ): Promise<Result<string[], Error>>;

  /**
   * Delete summary by ID
   */
  delete(id: string): Promise<Result<void, Error>>;

  /**
   * Find all summaries with optional filtering and pagination
   */
  findAll(options?: {
    type?: SummaryType;
    status?: SummaryStatus;
    limit?: number;
    offset?: number;
    sortBy?: "createdAt" | "processedAt";
    sortOrder?: "asc" | "desc";
  }): Promise<Result<Summary[], Error>>;

  /**
   * Get summary statistics
   */
  getStatistics(): Promise<Result<SummaryStatistics, Error>>;
}

/**
 * Summary statistics interface
 */
export interface SummaryStatistics {
  totalSummaries: number;
  dailySummaries: number;
  weeklySummaries: number;
  monthlySummaries: number;
  completedSummaries: number;
  pendingSummaries: number;
  failedSummaries: number;
}
