import { DomainEventHandler } from "../DomainEventHandler";
import { DomainEvent } from "../../domain/events/DomainEvent";
import { Result, ResultFactory } from "../../domain/Result";
import {
  SummaryCreatedEvent,
  SummaryProcessingRequestedEvent,
  DailyDataCollectionRequestedEvent,
  WeeklySummarizationRequestedEvent,
  MonthlySummarizationRequestedEvent,
} from "../../domain/events/SummaryEvents";
import { ProcessSummaryUseCase } from "../use-cases/ProcessSummaryUseCase";
import { DomainEventType } from "../../domain/types";

/**
 * Event handler for summary-related domain events
 */
export class SummaryEventHandler implements DomainEventHandler {
  constructor(private readonly processSummaryUseCase: ProcessSummaryUseCase) {}

  canHandle(event: DomainEvent): boolean {
    return [
      DomainEventType.SUMMARY_CREATED,
      DomainEventType.SUMMARY_PROCESSING_REQUESTED,
      DomainEventType.DAILY_DATA_COLLECTION_REQUESTED,
      DomainEventType.WEEKLY_SUMMARIZATION_REQUESTED,
      DomainEventType.MONTHLY_SUMMARIZATION_REQUESTED,
    ].includes(event.eventType);
  }

  async handle(event: DomainEvent): Promise<Result<void, Error>> {
    try {
      switch (event.eventType) {
        case DomainEventType.SUMMARY_CREATED:
          return await this.handleSummaryCreated(event as SummaryCreatedEvent);

        case DomainEventType.SUMMARY_PROCESSING_REQUESTED:
          return await this.handleSummaryProcessingRequested(
            event as SummaryProcessingRequestedEvent
          );

        case DomainEventType.DAILY_DATA_COLLECTION_REQUESTED:
          return await this.handleDailyDataCollectionRequested(
            event as DailyDataCollectionRequestedEvent
          );

        case DomainEventType.WEEKLY_SUMMARIZATION_REQUESTED:
          return await this.handleWeeklySummarizationRequested(
            event as WeeklySummarizationRequestedEvent
          );

        case DomainEventType.MONTHLY_SUMMARIZATION_REQUESTED:
          return await this.handleMonthlySummarizationRequested(
            event as MonthlySummarizationRequestedEvent
          );

        default:
          return ResultFactory.failure(
            new Error(`Unhandled event type: ${event.eventType}`)
          );
      }
    } catch (error) {
      return ResultFactory.failure(error as Error);
    }
  }

  private async handleSummaryCreated(
    event: SummaryCreatedEvent
  ): Promise<Result<void, Error>> {
    // Automatically start processing the newly created summary
    console.log(`Auto-processing newly created summary: ${event.summaryId}`);

    const result = await this.processSummaryUseCase.execute({
      summaryId: event.summaryId,
    });

    if (result.isFailure()) {
      console.error(
        `Failed to auto-process summary ${event.summaryId}:`,
        result.error
      );
      // Don't return failure to avoid blocking other event handlers
      // The summary will be retried by the automatic queue processing
    }

    return ResultFactory.success(undefined);
  }

  private async handleSummaryProcessingRequested(
    event: SummaryProcessingRequestedEvent
  ): Promise<Result<void, Error>> {
    // Process the summary using LLM
    const result = await this.processSummaryUseCase.execute({
      summaryId: event.summaryId,
    });

    if (result.isFailure()) {
      console.error(
        `Failed to process summary ${event.summaryId}:`,
        result.error
      );
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(undefined);
  }

  private async handleDailyDataCollectionRequested(
    event: DailyDataCollectionRequestedEvent
  ): Promise<Result<void, Error>> {
    // For daily summaries, immediately start processing
    const result = await this.processSummaryUseCase.execute({
      summaryId: event.summaryId,
    });

    if (result.isFailure()) {
      console.error(
        `Failed to process daily summary ${event.summaryId}:`,
        result.error
      );
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(undefined);
  }

  private async handleWeeklySummarizationRequested(
    event: WeeklySummarizationRequestedEvent
  ): Promise<Result<void, Error>> {
    // For weekly summaries, process using daily summaries
    const result = await this.processSummaryUseCase.execute({
      summaryId: event.summaryId,
    });

    if (result.isFailure()) {
      console.error(
        `Failed to process weekly summary ${event.summaryId}:`,
        result.error
      );
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(undefined);
  }

  private async handleMonthlySummarizationRequested(
    event: MonthlySummarizationRequestedEvent
  ): Promise<Result<void, Error>> {
    // For monthly summaries, process using weekly summaries
    const result = await this.processSummaryUseCase.execute({
      summaryId: event.summaryId,
    });

    if (result.isFailure()) {
      console.error(
        `Failed to process monthly summary ${event.summaryId}:`,
        result.error
      );
      return ResultFactory.failure(result.error);
    }

    return ResultFactory.success(undefined);
  }
}
