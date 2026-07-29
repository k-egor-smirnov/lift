import type {
  DailyStatisticsReadModel,
  StatisticsRepository,
} from "../../application/ports/StatisticsRepository";
import {
  dateOnlyToEpochDay,
  isValidDateOnly,
} from "../../domain/EffectiveDate";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
};

export class DexieStatisticsRepository implements StatisticsRepository {
  constructor(private readonly database: LiftSecureDatabase) {}

  async getRange(
    workspaceIdValue: string,
    startDate: string,
    endDate: string
  ): Promise<readonly DailyStatisticsReadModel[]> {
    const workspaceId = requireNonEmpty(workspaceIdValue, "workspaceId");
    if (
      !isValidDateOnly(startDate) ||
      !isValidDateOnly(endDate) ||
      dateOnlyToEpochDay(startDate) > dateOnlyToEpochDay(endDate)
    ) {
      throw new Error("Invalid statistics date range");
    }
    const records = await this.database.dailyStatisticsProjections
      .where("[workspaceId+date]")
      .between([workspaceId, startDate], [workspaceId, endDate], true, true)
      .toArray();
    return records
      .sort((left, right) =>
        left.date < right.date ? -1 : left.date > right.date ? 1 : 0
      )
      .map((record) => ({ ...record }));
  }
}
