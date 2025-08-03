import { DomainEvent } from "../../../../shared/domain/events/DomainEvent";
import {
  TaskCompletedEvent,
  TaskCompletionRevertedEvent,
  TaskReviewedEvent,
} from "../../../../shared/domain/events/TaskEvents";
import { TodoDatabase } from "../../../../shared/infrastructure/database/TodoDatabase";
import { DomainEventType } from "../../../../shared/domain/types";
import { StatisticsService } from "../services/StatisticsService";
import { EventHandler } from "./TaskLogEventHandler";

/**
 * Event handler that updates statistics when tasks are completed or reviewed
 * Uses existing record checks and timestamp validation for idempotency
 */
export class StatsUpdateHandler implements EventHandler {
  id = "stats-update-handler";

  private statisticsService: StatisticsService;

  constructor(private database: TodoDatabase) {
    this.statisticsService = new StatisticsService(database);
  }

  async handle(event: DomainEvent): Promise<void> {
    switch (event.eventType) {
      case DomainEventType.TASK_COMPLETED:
        await this.handleTaskCompleted(event as TaskCompletedEvent);
        break;
      case DomainEventType.TASK_COMPLETION_REVERTED:
        await this.handleTaskCompletionReverted(
          event as TaskCompletionRevertedEvent
        );
        break;
      case DomainEventType.TASK_REVIEWED:
        await this.handleTaskReviewed(event as TaskReviewedEvent);
        break;
    }
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    try {
      await this.statisticsService.recordTaskCompletion(
        event.taskId.value,
        event.categoryAtCompletion,
        new Date(event.createdAt)
      );
    } catch (error) {
      console.error("Failed to update statistics for task completion:", error);
      // Don't throw - we don't want to fail the entire event processing
      // The nightly snapshot will catch any missed statistics
    }
  }

  private async handleTaskCompletionReverted(
    event: TaskCompletionRevertedEvent
  ): Promise<void> {
    try {
      // We need to find the original completion event to get the category at completion
      // For now, we'll use the current category as approximation
      // TODO: Store category in completion metadata for accuracy
      await this.statisticsService.revertTaskCompletion(
        event.taskId.value,
        event.currentCategory,
        new Date(event.createdAt)
      );
    } catch (error) {
      console.error("Failed to revert statistics for task completion:", error);
      // Don't throw - nightly snapshot will correct any inconsistencies
    }
  }

  private async handleTaskReviewed(event: TaskReviewedEvent): Promise<void> {
    try {
      await this.statisticsService.recordInboxReview(
        event.taskId.value,
        new Date(event.createdAt)
      );
    } catch (error) {
      console.error("Failed to update statistics for task review:", error);
      // Don't throw - nightly snapshot will catch any missed statistics
    }
  }
}
