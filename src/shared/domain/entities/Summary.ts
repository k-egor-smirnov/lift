import { DateOnly } from "../value-objects/DateOnly";
import { DomainEvent } from "../events/DomainEvent";
import {
  SummaryCreatedEvent,
  SummaryUpdatedEvent,
} from "../events/SummaryEvents";

/**
 * Summary types for different time periods
 */
export enum SummaryType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

/**
 * Summary processing status
 */
export enum SummaryStatus {
  NEW = "NEW",
  PROCESSING = "PROCESSING",
  DONE = "DONE",
  FAILED = "FAILED",
}

/**
 * Domain error for invalid summary operations
 */
export class InvalidSummaryOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSummaryOperationError";
  }
}

/**
 * Summary entity representing AI-generated summaries of tasks and logs
 */
export class Summary {
  private _fullSummary: string;
  private _shortSummary: string;
  private _status: SummaryStatus;
  private _updatedAt: Date;
  private _relatedSummaryIds: string[];
  private _errorMessage?: string;

  constructor(
    public readonly id: string,
    public readonly type: SummaryType,
    public readonly date: DateOnly, // For daily summaries
    public readonly weekStart?: DateOnly, // For weekly summaries
    public readonly weekEnd?: DateOnly, // For weekly summaries
    public readonly month?: string, // For monthly summaries (YYYY-MM format)
    fullSummary: string = "",
    shortSummary: string = "",
    status: SummaryStatus = SummaryStatus.NEW,
    public readonly createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    relatedSummaryIds: string[] = [],
    errorMessage?: string
  ) {
    this.validateSummaryData();

    this._fullSummary = fullSummary;
    this._shortSummary = shortSummary;
    this._status = status;
    this._updatedAt = updatedAt;
    this._relatedSummaryIds = [...relatedSummaryIds];
    this._errorMessage = errorMessage;
  }

  // Getters
  get fullSummary(): string {
    return this._fullSummary;
  }

  get shortSummary(): string {
    return this._shortSummary;
  }

  get status(): SummaryStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get relatedSummaryIds(): string[] {
    return [...this._relatedSummaryIds];
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get isProcessing(): boolean {
    return this._status === SummaryStatus.PROCESSING;
  }

  get isCompleted(): boolean {
    return this._status === SummaryStatus.DONE;
  }

  get hasFailed(): boolean {
    return this._status === SummaryStatus.FAILED;
  }

  /**
   * Get the date key used for database storage
   */
  get dateKey(): string {
    switch (this.type) {
      case SummaryType.DAILY:
        return this.date.toString();
      case SummaryType.WEEKLY:
        return this.weekStart?.toString() || "";
      case SummaryType.MONTHLY:
        return this.month || "";
      default:
        return "";
    }
  }

  /**
   * Create a new summary (factory method that emits creation event)
   */
  static create(
    id: string,
    type: SummaryType,
    date: DateOnly,
    weekStart?: DateOnly,
    weekEnd?: DateOnly,
    month?: string
  ): { summary: Summary; events: DomainEvent[] } {
    const summary = new Summary(id, type, date, weekStart, weekEnd, month);

    const events = [new SummaryCreatedEvent(id, type, date)];

    return { summary, events };
  }

  /**
   * Start processing the summary
   */
  startProcessing(): DomainEvent[] {
    if (this._status === SummaryStatus.PROCESSING) {
      return []; // Already processing
    }

    if (this._status === SummaryStatus.DONE) {
      throw new InvalidSummaryOperationError(
        "Cannot start processing completed summary"
      );
    }

    this._status = SummaryStatus.PROCESSING;
    this._updatedAt = new Date();
    this._errorMessage = undefined;

    return [];
  }

  /**
   * Complete the summary with generated content
   */
  complete(fullSummary: string, shortSummary: string): DomainEvent[] {
    if (this._status !== SummaryStatus.PROCESSING) {
      throw new InvalidSummaryOperationError(
        "Can only complete summary that is being processed"
      );
    }

    if (!fullSummary.trim() || !shortSummary.trim()) {
      throw new InvalidSummaryOperationError("Summary content cannot be empty");
    }

    this._fullSummary = fullSummary.trim();
    this._shortSummary = shortSummary.trim();
    this._status = SummaryStatus.DONE;
    this._updatedAt = new Date();
    this._errorMessage = undefined;

    const events = [new SummaryUpdatedEvent(this.id, this._status)];

    return events;
  }

  /**
   * Mark summary as failed with error message
   */
  markAsFailed(errorMessage: string): DomainEvent[] {
    if (this._status !== SummaryStatus.PROCESSING) {
      throw new InvalidSummaryOperationError(
        "Can only mark as failed summary that is being processed"
      );
    }

    this._status = SummaryStatus.FAILED;
    this._updatedAt = new Date();
    this._errorMessage = errorMessage;

    const events = [new SummaryUpdatedEvent(this.id, this._status)];

    return events;
  }

  /**
   * Retry failed summary
   */
  retry(): DomainEvent[] {
    if (this._status !== SummaryStatus.FAILED) {
      throw new InvalidSummaryOperationError("Can only retry failed summaries");
    }

    this._status = SummaryStatus.NEW;
    this._updatedAt = new Date();
    this._errorMessage = undefined;

    return [];
  }

  /**
   * Add related summary IDs (for higher-level summaries)
   */
  addRelatedSummaryIds(summaryIds: string[]): void {
    const newIds = summaryIds.filter(
      (id) => !this._relatedSummaryIds.includes(id)
    );
    this._relatedSummaryIds.push(...newIds);
    this._updatedAt = new Date();
  }

  /**
   * Get period identifier for the summary
   */
  getPeriodIdentifier(): string {
    switch (this.type) {
      case SummaryType.DAILY:
        return this.date.toString();
      case SummaryType.WEEKLY:
        return `${this.weekStart?.toString()}_${this.weekEnd?.toString()}`;
      case SummaryType.MONTHLY:
        return this.month || "";
      default:
        return "";
    }
  }

  /**
   * Validate summary data based on type
   */
  private validateSummaryData(): void {
    switch (this.type) {
      case SummaryType.DAILY:
        // Daily summaries only need date
        break;
      case SummaryType.WEEKLY:
        if (!this.weekStart || !this.weekEnd) {
          throw new InvalidSummaryOperationError(
            "Weekly summaries require weekStart and weekEnd"
          );
        }
        if (this.weekStart.isAfter(this.weekEnd)) {
          throw new InvalidSummaryOperationError(
            "Week start cannot be after week end"
          );
        }
        break;
      case SummaryType.MONTHLY:
        if (!this.month || !/^\d{4}-\d{2}$/.test(this.month)) {
          throw new InvalidSummaryOperationError(
            "Monthly summaries require month in YYYY-MM format"
          );
        }
        break;
      default:
        throw new InvalidSummaryOperationError(
          `Invalid summary type: ${this.type}`
        );
    }
  }
}
