import { injectable, inject } from "tsyringe";
import type { Result } from "../../domain/Result";
import { ResultFactory } from "../../domain/Result";
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
import * as tokens from "../../infrastructure/di/tokens";
import { UseCase } from "../UseCase";

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
@injectable()
export class ScheduleSummariesUseCase
  implements UseCase<ScheduleSummariesRequest, ScheduleSummariesResponse>
{
  constructor(
    @inject(tokens.SUMMARY_REPOSITORY_TOKEN)
    private readonly summaryRepository: SummaryRepository,
    @inject(tokens.CREATE_SUMMARY_USE_CASE_TOKEN)
    private readonly createSummaryUseCase: CreateSummaryUseCase,
    @inject(tokens.EVENT_BUS_TOKEN)
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
        return ResultFactory.failure(dailyResult.error);
      }
      scheduledDaily = dailyResult.data;

      // Step 2: Schedule missing weekly summaries (only for complete weeks)
      const weeklyResult = await this.scheduleMissingWeeklySummaries(upToDate);
      if (weeklyResult.isFailure()) {
        return ResultFactory.failure(weeklyResult.error);
      }
      scheduledWeekly = weeklyResult.data;

      // Step 3: Schedule missing monthly summaries (only for complete months)
      const monthlyResult =
        await this.scheduleMissingMonthlySummaries(upToDate);
      if (monthlyResult.isFailure()) {
        return ResultFactory.failure(monthlyResult.error);
      }
      scheduledMonthly = monthlyResult.data;

      return ResultFactory.success({
        scheduledDaily,
        scheduledWeekly,
        scheduledMonthly,
        totalScheduled: scheduledDaily + scheduledWeekly + scheduledMonthly,
      });
    } catch (error) {
      return ResultFactory.failure(error as Error);
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
      return ResultFactory.failure(missingDatesResult.error);
    }

    const missingDates = missingDatesResult.data;
    if (!missingDates) {
      return ResultFactory.success(0);
    }

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
            createResult.data.summaryId
          )
        );
        scheduled++;
      }
    }

    return ResultFactory.success(scheduled);
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
      return ResultFactory.failure(missingWeeksResult.error);
    }

    const missingWeeks = missingWeeksResult.data;
    if (!missingWeeks) {
      return ResultFactory.success(0);
    }

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

      if (dailySummariesResult.isFailure() || !dailySummariesResult.data) {
        continue; // Skip this week on error
      }

      const relatedSummaryIds = dailySummariesResult.data.map((s) => s.id);

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
            createResult.data.summaryId
          )
        );
        scheduled++;
      }
    }

    return ResultFactory.success(scheduled);
  }

  private async scheduleMissingMonthlySummaries(
    upToDate: DateOnly
  ): Promise<Result<number, Error>> {
    const startDate = this.getEarliestSummaryDate(upToDate);

    // Find missing monthly summaries
    const missingMonthsResult =
      await this.summaryRepository.findMissingMonthlySummaries(
        startDate.value,
        upToDate.value
      );

    if (missingMonthsResult.isFailure()) {
      return ResultFactory.failure(missingMonthsResult.error);
    }

    const missingMonths = missingMonthsResult.data;
    if (!missingMonths) {
      return ResultFactory.success(0);
    }

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

      if (weeklySummariesResult.isFailure() || !weeklySummariesResult.data) {
        continue; // Skip this month on error
      }

      const relatedSummaryIds = weeklySummariesResult.data.map((s) => s.id);

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
            createResult.data.summaryId
          )
        );
        scheduled++;
      }
    }

    return ResultFactory.success(scheduled);
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

    if (dailySummariesResult.isFailure() || !dailySummariesResult.data) {
      return false;
    }

    const dailySummaries = dailySummariesResult.data;
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

    if (weeklySummariesResult.isFailure() || !weeklySummariesResult.data) {
      return false;
    }

    const weeklySummaries = weeklySummariesResult.data;
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
    const firstDay = DateOnly.fromString(
      `${year}-${String(monthNum).padStart(2, "0")}-01`
    );
    // Get last day of month by going to first day of next month and subtracting 1 day
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextYear = monthNum === 12 ? year + 1 : year;
    const firstDayNextMonth = DateOnly.fromString(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
    );
    const lastDay = firstDayNextMonth.subtractDays(1);

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
}
