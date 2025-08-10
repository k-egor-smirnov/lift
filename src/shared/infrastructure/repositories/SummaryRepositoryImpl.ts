import { injectable, inject } from "tsyringe";
import { SummaryRepository } from "../../domain/repositories/SummaryRepository";
import {
  Summary,
  SummaryType,
  SummaryStatus,
} from "../../domain/entities/Summary";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import type { Result } from "../../domain/Result";
import { ResultFactory } from "../../domain/Result";
import { TodoDatabase } from "../database/TodoDatabase";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { TaskLogService } from "../services/TaskLogService";
import * as tokens from "../di/tokens";

interface SummaryRecord {
  id: string;
  type: SummaryType;
  status: SummaryStatus;
  dateKey: string;
  title: string;
  content?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  error?: string;
}

/**
 * Repository implementation for Summary entity using IndexedDB
 */
@injectable()
export class SummaryRepositoryImpl implements SummaryRepository {
  constructor(
    @inject(tokens.DATABASE_TOKEN) private db: TodoDatabase,
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private taskRepository: TaskRepository,
    @inject(tokens.TASK_LOG_SERVICE_TOKEN)
    private taskLogService: TaskLogService
  ) {}

  async save(summary: Summary): Promise<Result<void, Error>> {
    try {
      const record = this.mapEntityToRecord(summary);
      await this.db.summaries.put(record);
      return ResultFactory.success(undefined);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to save summary: ${error}`)
      );
    }
  }

  async findById(id: string): Promise<Result<Summary | null, Error>> {
    try {
      const record = await this.db.summaries.get(id);
      if (!record) {
        return ResultFactory.success(null);
      }
      const summary = this.mapRecordToEntity(record);
      return ResultFactory.success(summary);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find summary by id: ${error}`)
      );
    }
  }

  async findByDateAndType(
    dateKey: string,
    type: SummaryType
  ): Promise<Result<Summary | null, Error>> {
    try {
      const record = await this.db.summaries
        .where("[dateKey+type]")
        .equals([dateKey, type])
        .first();

      if (!record) {
        return ResultFactory.success(null);
      }

      const summary = this.mapRecordToEntity(record);
      return ResultFactory.success(summary);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find summary by date and type: ${error}`)
      );
    }
  }

  async findByType(type: SummaryType): Promise<Result<Summary[], Error>> {
    try {
      const records = await this.db.summaries
        .where("type")
        .equals(type)
        .sortBy("dateKey");

      // Filter out records with invalid dateKey before mapping
      const validRecords = records.filter(
        (record) => record.dateKey && record.dateKey !== "undefined"
      );

      const summaries = validRecords.map((record) =>
        this.mapRecordToEntity(record)
      );
      return ResultFactory.success(summaries);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find summaries by type: ${error}`)
      );
    }
  }

  async findByStatus(status: SummaryStatus): Promise<Result<Summary[], Error>> {
    try {
      const records = await this.db.summaries
        .where("status")
        .equals(status)
        .sortBy("createdAt");

      // Filter out records with invalid dateKey before mapping
      const validRecords = records.filter(
        (record) => record.dateKey && record.dateKey !== "undefined"
      );

      const summaries = validRecords.map((record) =>
        this.mapRecordToEntity(record)
      );
      return ResultFactory.success(summaries);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find summaries by status: ${error}`)
      );
    }
  }

  async findByDateRange(
    startDate: DateOnly,
    endDate: DateOnly,
    type?: SummaryType
  ): Promise<Result<Summary[], Error>> {
    try {
      const startKey = startDate.toString();
      const endKey = endDate.toString();

      let query = this.db.summaries
        .where("dateKey")
        .between(startKey, endKey, true, true);

      if (type) {
        const records = await query.toArray();
        const filteredRecords = records.filter(
          (record) =>
            record.type === type &&
            record.dateKey &&
            record.dateKey !== "undefined"
        );
        const summaries = filteredRecords.map((record) =>
          this.mapRecordToEntity(record)
        );
        return ResultFactory.success(summaries);
      }

      const records = await query.sortBy("dateKey");
      // Filter out records with invalid dateKey before mapping
      const validRecords = records.filter(
        (record) => record.dateKey && record.dateKey !== "undefined"
      );
      const summaries = validRecords.map((record) =>
        this.mapRecordToEntity(record)
      );
      return ResultFactory.success(summaries);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find summaries by date range: ${error}`)
      );
    }
  }

  async findDailySummariesForWeek(
    weekStart: DateOnly,
    weekEnd: DateOnly
  ): Promise<Result<Summary[], Error>> {
    return this.findByDateRange(weekStart, weekEnd, SummaryType.DAILY);
  }

  async findWeeklySummariesForMonth(
    month: string
  ): Promise<Result<Summary[], Error>> {
    try {
      // Month format: YYYY-MM
      const year = parseInt(month.split("-")[0]);
      const monthNum = parseInt(month.split("-")[1]);

      // Get first and last day of month
      const firstDay = new Date(year, monthNum - 1, 1);
      const lastDay = new Date(year, monthNum, 0);

      const startDate = DateOnly.fromDate(firstDay);
      const endDate = DateOnly.fromDate(lastDay);

      return this.findByDateRange(startDate, endDate, SummaryType.WEEKLY);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find weekly summaries for month: ${error}`)
      );
    }
  }

  async findMissingDailySummaries(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<DateOnly[], Error>> {
    try {
      const existingSummariesResult = await this.findByDateRange(
        startDate,
        endDate,
        SummaryType.DAILY
      );
      if (existingSummariesResult.isFailure()) {
        return ResultFactory.failure(existingSummariesResult.error);
      }

      const existingDates = new Set(
        existingSummariesResult.data?.map((summary) => summary.dateKey) || []
      );

      const missingDates: DateOnly[] = [];
      let current = DateOnly.fromString(startDate.toString());
      const end = DateOnly.fromString(endDate.toString());

      while (current.toDate() <= end.toDate()) {
        if (!existingDates.has(current.toString())) {
          // Проверяем, была ли активность в эту дату
          const hasActivity = await this.hasActivityOnDate(current);
          if (hasActivity) {
            missingDates.push(DateOnly.fromString(current.toString()));
          }
        }
        current = current.addDays(1);
      }

      return ResultFactory.success(missingDates);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find missing daily summaries: ${error}`)
      );
    }
  }

  async findMissingWeeklySummaries(
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Array<{ weekStart: DateOnly; weekEnd: DateOnly }>, Error>> {
    try {
      // Find existing weekly summaries
      const existingSummariesResult = await this.findByDateRange(
        startDate,
        endDate,
        SummaryType.WEEKLY
      );
      if (existingSummariesResult.isFailure()) {
        return ResultFactory.failure(existingSummariesResult.error);
      }

      const existingWeeks = new Set(
        existingSummariesResult.data?.map((summary) => summary.dateKey) || []
      );

      const missingWeeks: Array<{ weekStart: DateOnly; weekEnd: DateOnly }> =
        [];
      let current = DateOnly.fromString(startDate.toString());

      // Find Monday of the week containing startDate
      const dayOfWeek = current.toDate().getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      current = current.addDays(mondayOffset);

      while (current.toDate() <= endDate.toDate()) {
        const weekKey = current.toString();
        if (!existingWeeks.has(weekKey)) {
          // Check if all daily summaries for this week are completed
          const weekEnd = current.addDays(6);

          const dailySummariesResult = await this.findDailySummariesForWeek(
            current,
            weekEnd
          );
          if (dailySummariesResult.isSuccess() && dailySummariesResult.data) {
            const completedDailies = dailySummariesResult.data.filter(
              (summary) => summary.status === SummaryStatus.DONE
            );

            // Only add if we have at least some daily summaries completed
            if (completedDailies.length > 0) {
              missingWeeks.push({
                weekStart: DateOnly.fromString(current.toString()),
                weekEnd: weekEnd,
              });
            }
          }
        }

        // Move to next Monday
        current = current.addDays(7);
      }

      return ResultFactory.success(missingWeeks);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find missing weekly summaries: ${error}`)
      );
    }
  }

  async findMissingMonthlySummaries(
    startMonth: string,
    endMonth: string
  ): Promise<Result<string[], Error>> {
    try {
      // Generate list of months in range
      const months: string[] = [];
      const [startYear, startMonthNum] = startMonth.split("-").map(Number);
      const [endYear, endMonthNum] = endMonth.split("-").map(Number);

      const current = new Date(startYear, startMonthNum - 1, 1);
      const end = new Date(endYear, endMonthNum - 1, 1);

      while (current <= end) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
        months.push(monthKey);
        current.setMonth(current.getMonth() + 1);
      }

      // Find existing monthly summaries
      const existingSummariesResult = await this.findByType(
        SummaryType.MONTHLY
      );
      if (existingSummariesResult.isFailure()) {
        return ResultFactory.failure(existingSummariesResult.error);
      }

      const existingMonths = new Set(
        existingSummariesResult.data?.map((summary) => summary.dateKey) || []
      );

      const missingMonths: string[] = [];

      for (const month of months) {
        if (!existingMonths.has(month)) {
          // Check if we have completed weekly summaries for this month
          const weeklySummariesResult =
            await this.findWeeklySummariesForMonth(month);
          if (weeklySummariesResult.isSuccess() && weeklySummariesResult.data) {
            const completedWeeklies = weeklySummariesResult.data.filter(
              (summary) => summary.status === SummaryStatus.DONE
            );

            // Only add if we have at least some weekly summaries completed
            if (completedWeeklies.length > 0) {
              missingMonths.push(month);
            }
          }
        }
      }

      return ResultFactory.success(missingMonths);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find missing monthly summaries: ${error}`)
      );
    }
  }

  async delete(id: string): Promise<Result<void, Error>> {
    try {
      await this.db.summaries.delete(id);
      return ResultFactory.success(undefined);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to delete summary: ${error}`)
      );
    }
  }

  async count(): Promise<Result<number, Error>> {
    try {
      const count = await this.db.summaries.count();
      return ResultFactory.success(count);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to count summaries: ${error}`)
      );
    }
  }

  async countByType(type: SummaryType): Promise<Result<number, Error>> {
    try {
      const count = await this.db.summaries.where("type").equals(type).count();
      return ResultFactory.success(count);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to count summaries by type: ${error}`)
      );
    }
  }

  async countByStatus(status: SummaryStatus): Promise<Result<number, Error>> {
    try {
      const count = await this.db.summaries
        .where("status")
        .equals(status)
        .count();
      return ResultFactory.success(count);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to count summaries by status: ${error}`)
      );
    }
  }

  /**
   * Проверяет, была ли активность пользователя в указанную дату
   * (создание/завершение задач или создание логов)
   */
  private async hasActivityOnDate(date: DateOnly): Promise<boolean> {
    try {
      // Проверяем созданные задачи
      const createdTasksResult =
        await this.taskRepository.findTasksCreatedInDateRange(date, date);
      if (
        createdTasksResult.isSuccess() &&
        createdTasksResult.data &&
        createdTasksResult.data.length > 0
      ) {
        return true;
      }

      // Проверяем завершенные задачи
      const completedTasksResult =
        await this.taskRepository.findTasksCompletedInDateRange(date, date);
      if (
        completedTasksResult.isSuccess() &&
        completedTasksResult.data &&
        completedTasksResult.data.length > 0
      ) {
        return true;
      }

      // Проверяем пользовательские логи
      const startDateTime = date.toDate();
      const endDateTime = new Date(date.toDate());
      endDateTime.setHours(23, 59, 59, 999);

      const userLogsResult = await this.taskLogService.getTaskLogsInDateRange(
        startDateTime,
        endDateTime
      );
      if (
        userLogsResult.isSuccess() &&
        userLogsResult.data &&
        userLogsResult.data.length > 0
      ) {
        return true;
      }

      // Проверяем системные логи
      const systemLogsResult =
        await this.taskLogService.getSystemLogsInDateRange(
          startDateTime,
          endDateTime
        );
      if (
        systemLogsResult.isSuccess() &&
        systemLogsResult.data &&
        systemLogsResult.data.length > 0
      ) {
        return true;
      }

      return false;
    } catch (error) {
      // В случае ошибки считаем, что активность была (безопасный подход)
      return true;
    }
  }

  async findAll(options?: {
    type?: SummaryType;
    status?: SummaryStatus;
    limit?: number;
    offset?: number;
    sortBy?: "createdAt" | "processedAt";
    sortOrder?: "asc" | "desc";
  }): Promise<Result<Summary[], Error>> {
    try {
      let query = this.db.summaries.toCollection();

      // Apply filters
      if (options?.type) {
        query = query.filter((record) => record.type === options.type);
      }
      if (options?.status) {
        query = query.filter((record) => record.status === options.status);
      }

      // Apply sorting
      const sortBy = options?.sortBy || "createdAt";
      const sortOrder = options?.sortOrder || "desc";

      let records = await query.toArray();

      records.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];

        if (!aValue && !bValue) return 0;
        if (!aValue) return sortOrder === "asc" ? -1 : 1;
        if (!bValue) return sortOrder === "asc" ? 1 : -1;

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortOrder === "asc" ? comparison : -comparison;
      });

      // Apply pagination
      if (options?.offset) {
        records = records.slice(options.offset);
      }
      if (options?.limit) {
        records = records.slice(0, options.limit);
      }

      // Filter out records with invalid dateKey before mapping
      const validRecords = records.filter(
        (record) => record.dateKey && record.dateKey !== "undefined"
      );

      const summaries = validRecords.map((record) =>
        this.mapRecordToEntity(record)
      );
      return ResultFactory.success(summaries);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find all summaries: ${error}`)
      );
    }
  }

  async findDailySummaryByDate(
    date: DateOnly
  ): Promise<Result<Summary | null, Error>> {
    return this.findByDateAndType(date.toString(), SummaryType.DAILY);
  }

  async findWeeklySummaryByRange(
    weekStart: DateOnly
  ): Promise<Result<Summary | null, Error>> {
    return this.findByDateAndType(weekStart.toString(), SummaryType.WEEKLY);
  }

  async findMonthlySummaryByMonth(
    month: string
  ): Promise<Result<Summary | null, Error>> {
    return this.findByDateAndType(month, SummaryType.MONTHLY);
  }

  async findByTypeAndDateRange(
    type: SummaryType,
    startDate: DateOnly,
    endDate: DateOnly
  ): Promise<Result<Summary[], Error>> {
    return this.findByDateRange(startDate, endDate, type);
  }

  async findPendingSummaries(): Promise<Result<Summary[], Error>> {
    try {
      const records = await this.db.summaries
        .where("status")
        .anyOf([SummaryStatus.NEW, SummaryStatus.FAILED])
        .sortBy("createdAt");

      // Filter out records with invalid dateKey before mapping
      const validRecords = records.filter(
        (record) => record.dateKey && record.dateKey !== "undefined"
      );

      const summaries = validRecords.map((record) =>
        this.mapRecordToEntity(record)
      );
      return ResultFactory.success(summaries);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to find pending summaries: ${error}`)
      );
    }
  }

  async getStatistics(): Promise<Result<any, Error>> {
    try {
      const totalSummaries = await this.db.summaries.count();
      const dailySummaries = await this.countByType(SummaryType.DAILY);
      const weeklySummaries = await this.countByType(SummaryType.WEEKLY);
      const monthlySummaries = await this.countByType(SummaryType.MONTHLY);
      const completedSummaries = await this.countByStatus(SummaryStatus.DONE);
      const pendingSummaries = await this.countByStatus(SummaryStatus.NEW);
      const failedSummaries = await this.countByStatus(SummaryStatus.FAILED);

      if (
        dailySummaries.isFailure() ||
        weeklySummaries.isFailure() ||
        monthlySummaries.isFailure() ||
        completedSummaries.isFailure() ||
        pendingSummaries.isFailure() ||
        failedSummaries.isFailure()
      ) {
        return ResultFactory.failure(new Error("Failed to get statistics"));
      }

      const statistics = {
        totalSummaries,
        dailySummaries: dailySummaries.data,
        weeklySummaries: weeklySummaries.data,
        monthlySummaries: monthlySummaries.data,
        completedSummaries: completedSummaries.data,
        pendingSummaries: pendingSummaries.data,
        failedSummaries: failedSummaries.data,
      };

      return ResultFactory.success(statistics);
    } catch (error) {
      return ResultFactory.failure(
        new Error(`Failed to get statistics: ${error}`)
      );
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapRecordToEntity(record: SummaryRecord): Summary {
    // Parse dateKey to DateOnly for the main date parameter
    if (!record.dateKey || record.dateKey === "undefined") {
      throw new Error(`Invalid dateKey in summary record: ${record.dateKey}`);
    }
    const date = DateOnly.fromString(record.dateKey);

    // Extract week start/end and month from metadata if available
    const weekStart =
      record.metadata?.weekStart && record.metadata.weekStart !== "undefined"
        ? DateOnly.fromString(record.metadata.weekStart)
        : undefined;

    const month = record.metadata?.month;

    return new Summary(
      record.id,
      record.type,
      date,
      weekStart,
      undefined,
      month,
      record.content || "",
      record.title || "",
      record.status,
      record.createdAt,
      record.updatedAt,
      [],
      record.error,
      record.metadata?.retryCount || 0
    );
  }

  /**
   * Map domain entity to database record
   */
  private mapEntityToRecord(summary: Summary): SummaryRecord {
    // Build metadata object with week/month info
    const metadata: Record<string, any> = {};
    if (summary.weekStart) {
      metadata.weekStart = summary.weekStart.toString();
    }
    if (summary.weekEnd) {
      metadata.weekEnd = summary.weekEnd.toString();
    }
    if (summary.month) {
      metadata.month = summary.month;
    }
    if (summary.retryCount !== undefined) {
      metadata.retryCount = summary.retryCount;
    }

    return {
      id: summary.id,
      type: summary.type,
      status: summary.status,
      dateKey: summary.dateKey,
      title: summary.shortSummary,
      content: summary.fullSummary,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      error: summary.errorMessage,
    };
  }
}
