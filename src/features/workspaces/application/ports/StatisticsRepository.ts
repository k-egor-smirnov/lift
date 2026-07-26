export interface DailyStatisticsReadModel {
  readonly workspaceId: string;
  readonly date: string;
  readonly simpleCompleted: number;
  readonly focusCompleted: number;
  readonly inboxReviewed: number;
}

export interface StatisticsRepository {
  getRange(
    workspaceId: string,
    startDate: string,
    endDate: string
  ): Promise<readonly DailyStatisticsReadModel[]>;
}
