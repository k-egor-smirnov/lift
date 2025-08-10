import { UseCase } from "../UseCase";
import { Result } from "../../domain/Result";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import { EventBus } from "../../domain/events/EventBus";
import { CreateSummaryUseCase } from "./CreateSummaryUseCase";
import { SummaryType } from "../../domain/entities/Summary";
import {
  DailyDataCollectionRequestedEvent,
  WeeklySummarizationRequestedEvent,
  MonthlySummarizationRequestedEvent,
} from "../../domain/events/SummaryEvents";

export interface ScheduleSummariesRequest {
  upToDate?: DateOnly; // Schedule up to this date (default: today)
}

export interface ScheduleSummariesResponse {
  scheduledDaily: number;
  scheduledWeekly: number;
  scheduledMonthly: number;
  totalScheduled: number;
}

interface WeekRange {
  weekStart: DateOnly;
  weekEnd: DateOnly;
}

/**
 * Use case for scheduling missing summaries in correct order
 */
export class ScheduleSummariesUseCase
  implements UseCase<ScheduleSummariesRequest, ScheduleSummariesResponse>
{
  constructor(
    private readonly summaryRepository: SummaryRepository,
    private readonly createSummaryUseCase: CreateSummaryUseCase,
    private readonly eventBus: EventBus
  ) {}

  async execute(
    request: ScheduleSummariesRequest
  ): Promise<Result<ScheduleSummariesResponse, Error>> {
    try {
      const upToDate = request.upToDate || DateOnly.today();

      let scheduledDaily = 0;
      let scheduledWeekly = 0;
      let scheduledMonthly = 0;

      // Step 1: Schedule missing daily summaries
      const dailyResult = await this.scheduleMissingDailySummaries(upToDate);
      if (dailyResult.isFailure()) {
        return Result.failure(dailyResult.error);
      }
      scheduledDaily = dailyResult.value;

      // Step 2: Schedule missing weekly summaries (only for complete weeks)
      const weeklyResult = await this.scheduleMissingWeeklySummaries(upToDate);
      if (weeklyResult.isFailure()) {
        return Result.failure(weeklyResult.error);
      }
      scheduledWeekly = weeklyResult.value;

      // Step 3: Schedule missing monthly summaries (only for complete months)
      const monthlyResult =
        await this.scheduleMissingMonthlySummaries(upToDate);
      if (monthlyResult.isFailure()) {
        return Result.failure(monthlyResult.error);
      }
      scheduledMonthly = monthlyResult.value;

      return Result.success({
        scheduledDaily,
        scheduledWeekly,
        scheduledMonthly,
        totalScheduled: scheduledDaily + scheduledWeekly + scheduledMonthly,
      });
    } catch (error) {
      return Result.failure(error as Error);
    }
  }

  private async scheduleMissingDailySummaries(
    upToDate: DateOnly
  ): Promise<Result<number, Error>> {
    // Find the earliest date we should start from (e.g., 90 days ago or app installation date)
    const startDate = this.getEarliestSummaryDate(upToDate);

    // Find missing daily summaries
    const missingDatesResult =
      await this.summaryRepository.findMissingDailySummaries(
        startDate,
        upToDate
      );

    if (missingDatesResult.isFailure()) {
      return Result.failure(missingDatesResult.error);
    }

    const missingDates = missingDatesResult.value;
    let scheduled = 0;

    // Create summaries for missing dates
    for (const date of missingDates) {
      const createResult = await this.createSummaryUseCase.execute({
        type: SummaryType.DAILY,
        date,
      });

      if (createResult.isSuccess()) {
        // Emit event to trigger data collection and processing
        await this.eventBus.publish(
          new DailyDataCollectionRequestedEvent(
            date,
            createResult.value.summaryId
          )
        );
        scheduled++;
      }
    }

    return Result.success(scheduled);
  }

  private async scheduleMissingWeeklySummaries(
    upToDate: DateOnly
  ): Promise<Result<number, Error>> {
    const startDate = this.getEarliestSummaryDate(upToDate);

    // Find missing weekly summaries
    const missingWeeksResult =
      await this.summaryRepository.findMissingWeeklySummaries(
        startDate,
        upToDate
      );

    if (missingWeeksResult.isFailure()) {
      return Result.failure(missingWeeksResult.error);
    }

    const missingWeeks = missingWeeksResult.value;
    let scheduled = 0;

    // Create summaries for missing weeks (only if all daily summaries are complete)
    for (const week of missingWeeks) {
      const canCreateWeekly = await this.canCreateWeeklySummary(
        week.weekStart,
        week.weekEnd
      );
      if (!canCreateWeekly) {
        continue; // Skip this week if daily summaries are not complete
      }

      // Get related daily summary IDs
      const dailySummariesResult =
        await this.summaryRepository.findDailySummariesForWeek(
          week.weekStart,
          week.weekEnd
        );

      if (dailySummariesResult.isFailure()) {
        continue; // Skip this week on error
      }

      const relatedSummaryIds = dailySummariesResult.value.map((s) => s.id);

      const createResult = await this.createSummaryUseCase.execute({
        type: SummaryType.WEEKLY,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        relatedSummaryIds,
      });

      if (createResult.isSuccess()) {
        // Emit event to trigger weekly summarization
        await this.eventBus.publish(
          new WeeklySummarizationRequestedEvent(
            week.weekStart,
            week.weekEnd,
            createResult.value.summaryId
          )
        );
        scheduled++;
      }
    }

    return Result.success(scheduled);
  }

  private async scheduleMissingMonthlySummaries(
    upToDate: DateOnly
  ): Promise<Result<number, Error>> {
    const startDate = this.getEarliestSummaryDate(upToDate);
    const startMonth = this.formatMonth(startDate);
    const endMonth = this.formatMonth(upToDate);

    // Find missing monthly summaries
    const missingMonthsResult =
      await this.summaryRepository.findMissingMonthlySummaries(
        startMonth,
        endMonth
      );

    if (missingMonthsResult.isFailure()) {
      return Result.failure(missingMonthsResult.error);
    }

    const missingMonths = missingMonthsResult.value;
    let scheduled = 0;

    // Create summaries for missing months (only if all weekly summaries are complete)
    for (const month of missingMonths) {
      const canCreateMonthly = await this.canCreateMonthlySummary(month);
      if (!canCreateMonthly) {
        continue; // Skip this month if weekly summaries are not complete
      }

      // Get related weekly summary IDs
      const weeklySummariesResult =
        await this.summaryRepository.findWeeklySummariesForMonth(month);

      if (weeklySummariesResult.isFailure()) {
        continue; // Skip this month on error
      }

      const relatedSummaryIds = weeklySummariesResult.value.map((s) => s.id);

      const createResult = await this.createSummaryUseCase.execute({
        type: SummaryType.MONTHLY,
        month,
        relatedSummaryIds,
      });

      if (createResult.isSuccess()) {
        // Emit event to trigger monthly summarization
        await this.eventBus.publish(
          new MonthlySummarizationRequestedEvent(
            month,
            createResult.value.summaryId
          )
        );
        scheduled++;
      }
    }

    return Result.success(scheduled);
  }

  private async canCreateWeeklySummary(
    weekStart: DateOnly,
    weekEnd: DateOnly
  ): Promise<boolean> {
    const dailySummariesResult =
      await this.summaryRepository.findDailySummariesForWeek(
        weekStart,
        weekEnd
      );

    if (dailySummariesResult.isFailure()) {
      return false;
    }

    const dailySummaries = dailySummariesResult.value;
    const expectedDays = this.getDaysBetween(weekStart, weekEnd);

    // Check if we have a summary for each day and all are completed
    return expectedDays.every((date) => {
      const summary = dailySummaries.find((s) => s.date?.equals(date));
      return summary && summary.status === "DONE";
    });
  }

  private async canCreateMonthlySummary(month: string): Promise<boolean> {
    const weeklySummariesResult =
      await this.summaryRepository.findWeeklySummariesForMonth(month);

    if (weeklySummariesResult.isFailure()) {
      return false;
    }

    const weeklySummaries = weeklySummariesResult.value;
    const expectedWeeks = this.getWeeksInMonth(month);

    // Check if we have a summary for each week and all are completed
    return expectedWeeks.every((week) => {
      const summary = weeklySummaries.find(
        (s) =>
          s.weekStart?.equals(week.weekStart) && s.weekEnd?.equals(week.weekEnd)
      );
      return summary && summary.status === "DONE";
    });
  }

  private getEarliestSummaryDate(upToDate: DateOnly): DateOnly {
    // Start from 90 days ago or a configured start date
    return upToDate.addDays(-90);
  }

  private getDaysBetween(startDate: DateOnly, endDate: DateOnly): DateOnly[] {
    const days: DateOnly[] = [];
    let current = startDate;

    while (!current.isAfter(endDate)) {
      days.push(current);
      current = current.addDays(1);
    }

    return days;
  }

  private getWeeksInMonth(month: string): WeekRange[] {
    const [year, monthNum] = month.split("-").map(Number);
    const firstDay = new DateOnly(year, monthNum, 1);
    const lastDay = new DateOnly(year, monthNum + 1, 0); // Last day of month

    const weeks: WeekRange[] = [];
    let current = this.getWeekStart(firstDay);

    while (!current.isAfter(lastDay)) {
      const weekEnd = current.addDays(6);
      weeks.push({
        weekStart: current,
        weekEnd: weekEnd,
      });
      current = current.addDays(7);
    }

    return weeks;
  }

  private getWeekStart(date: DateOnly): DateOnly {
    // Assuming Monday is the start of the week
    const dayOfWeek = date.toDate().getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, Monday = 1
    return date.addDays(-daysToSubtract);
  }

  private formatMonth(date: DateOnly): string {
    const jsDate = date.toDate();
    const year = jsDate.getFullYear();
    const month = (jsDate.getMonth() + 1).toString().padStart(2, "0");
    return `${year}-${month}`;
  }
}
