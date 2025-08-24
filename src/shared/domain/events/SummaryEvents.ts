import { DomainEvent } from "./DomainEvent";
import { DomainEventType } from "../types";
import { DateOnly } from "../value-objects/DateOnly";
import { SummaryType, SummaryStatus } from "../entities/Summary";

/**
 * Event emitted when a summary is created
 */
export class SummaryCreatedEvent extends DomainEvent {
  constructor(
    public readonly summaryId: string,
    public readonly summaryType: SummaryType,
    public readonly date: DateOnly
  ) {
    super(DomainEventType.SUMMARY_CREATED);
  }

  getEventData(): Record<string, any> {
    return {
      summaryId: this.summaryId,
      summaryType: this.summaryType,
      date: this.date.toString(),
    };
  }
}

/**
 * Event emitted when a summary is updated (status change)
 */
export class SummaryUpdatedEvent extends DomainEvent {
  constructor(
    public readonly summaryId: string,
    public readonly newStatus: SummaryStatus
  ) {
    super(DomainEventType.SUMMARY_UPDATED);
  }

  getEventData(): Record<string, any> {
    return {
      summaryId: this.summaryId,
      newStatus: this.newStatus,
    };
  }
}

/**
 * Event emitted when summary processing is requested
 */
export class SummaryProcessingRequestedEvent extends DomainEvent {
  constructor(
    public readonly summaryId: string,
    public readonly summaryType: SummaryType,
    public readonly date: DateOnly
  ) {
    super(DomainEventType.SUMMARY_PROCESSING_REQUESTED);
  }

  getEventData(): Record<string, any> {
    return {
      summaryId: this.summaryId,
      summaryType: this.summaryType,
      date: this.date.toString(),
    };
  }
}

/**
 * Event emitted when daily data collection is needed for summarization
 */
export class DailyDataCollectionRequestedEvent extends DomainEvent {
  constructor(
    public readonly date: DateOnly,
    public readonly summaryId: string
  ) {
    super(DomainEventType.DAILY_DATA_COLLECTION_REQUESTED);
  }

  getEventData(): Record<string, any> {
    return {
      date: this.date.toString(),
      summaryId: this.summaryId,
    };
  }
}

/**
 * Event emitted when weekly summarization is requested
 */
export class WeeklySummarizationRequestedEvent extends DomainEvent {
  constructor(
    public readonly weekStart: DateOnly,
    public readonly weekEnd: DateOnly,
    public readonly summaryId: string
  ) {
    super(DomainEventType.WEEKLY_SUMMARIZATION_REQUESTED);
  }

  getEventData(): Record<string, any> {
    return {
      weekStart: this.weekStart.toString(),
      weekEnd: this.weekEnd.toString(),
      summaryId: this.summaryId,
    };
  }
}

/**
 * Event emitted when monthly summarization is requested
 */
export class MonthlySummarizationRequestedEvent extends DomainEvent {
  constructor(
    public readonly month: string, // YYYY-MM format
    public readonly summaryId: string
  ) {
    super(DomainEventType.MONTHLY_SUMMARIZATION_REQUESTED);
  }

  getEventData(): Record<string, any> {
    return {
      month: this.month,
      summaryId: this.summaryId,
    };
  }
}
