import type { CurrentWorkspace } from "../../../workspaces/application/ports/CurrentWorkspace";
import type {
  DailyStatisticsReadModel,
  StatisticsRepository,
} from "../../../workspaces/application/ports/StatisticsRepository";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

export interface DailyStatistics {
  date: string;
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface WeeklyStatistics {
  weekStart: string;
  weekEnd: string;
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface MonthlyStatistics {
  month: string;
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

const aggregate = (records: readonly DailyStatisticsReadModel[]) =>
  records.reduce(
    (total, record) => ({
      simpleCompleted: total.simpleCompleted + record.simpleCompleted,
      focusCompleted: total.focusCompleted + record.focusCompleted,
      inboxReviewed: total.inboxReviewed + record.inboxReviewed,
    }),
    { simpleCompleted: 0, focusCompleted: 0, inboxReviewed: 0 }
  );

/** Query-only facade over deterministic daily statistic projections. */
export class StatisticsService {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly repository: StatisticsRepository
  ) {}

  async getDailyStatistics(date: Date): Promise<DailyStatistics> {
    const dateKey = this.formatDateKey(date);
    const record = (
      await this.repository.getRange(
        this.workspace.requireId(),
        dateKey,
        dateKey
      )
    )[0];
    return {
      date: dateKey,
      simpleCompleted: record?.simpleCompleted ?? 0,
      focusCompleted: record?.focusCompleted ?? 0,
      inboxReviewed: record?.inboxReviewed ?? 0,
    };
  }

  async getWeeklyStatistics(date: Date): Promise<WeeklyStatistics> {
    const { start, end } = this.weekBounds(date);
    const weekStart = this.formatDateKey(start);
    const weekEnd = this.formatDateKey(end);
    const records = await this.repository.getRange(
      this.workspace.requireId(),
      weekStart,
      weekEnd
    );
    return { weekStart, weekEnd, ...aggregate(records) };
  }

  async getMonthlyStatistics(date: Date): Promise<MonthlyStatistics> {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const records = await this.repository.getRange(
      this.workspace.requireId(),
      this.formatDateKey(start),
      this.formatDateKey(end)
    );
    return {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      ...aggregate(records),
    };
  }

  async getDailyStatisticsRange(
    startDate: Date,
    endDate: Date
  ): Promise<DailyStatistics[]> {
    const startKey = this.formatDateKey(startDate);
    const endKey = this.formatDateKey(endDate);
    const records = await this.repository.getRange(
      this.workspace.requireId(),
      startKey,
      endKey
    );
    const byDate = new Map(records.map((record) => [record.date, record]));
    const result: DailyStatistics[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const date = this.formatDateKey(current);
      const record = byDate.get(date);
      result.push({
        date,
        simpleCompleted: record?.simpleCompleted ?? 0,
        focusCompleted: record?.focusCompleted ?? 0,
        inboxReviewed: record?.inboxReviewed ?? 0,
      });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  private formatDateKey(date: Date): string {
    return DateOnly.fromDate(date).value;
  }

  private weekBounds(date: Date): { start: Date; end: Date } {
    const start = new Date(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
}
