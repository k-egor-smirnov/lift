import {
  TodoDatabase,
  EventStoreRecord,
} from "../../../../shared/infrastructure/database/TodoDatabase";

export interface EventProcessingStats {
  totalEvents: number;
  pendingEvents: number;
  processingEvents: number;
  doneEvents: number;
  deadLetterEvents: number;
  averageProcessingTime: number;
  oldestPendingEvent?: Date;
  newestEvent?: Date;
}

export interface EventDetails {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  status: "pending" | "processing" | "done" | "dead";
  attemptCount: number;
  createdAt: Date;
  nextAttemptAt?: Date;
  lastError?: string;
}

/**
 * Service for monitoring event processing statistics and health
 * Provides insights into event processing performance and issues
 */
export class EventMonitor {
  constructor(private database: TodoDatabase) {}

  /**
   * Get overall event processing statistics
   */
  async getProcessingStats(): Promise<EventProcessingStats> {
    const [
      totalEvents,
      pendingEvents,
      processingEvents,
      doneEvents,
      deadLetterEvents,
      oldestPending,
      newestEvent,
    ] = await Promise.all([
      this.database.eventStore.count(),
      this.database.eventStore.where("status").equals("pending").count(),
      this.database.eventStore.where("status").equals("processing").count(),
      this.database.eventStore.where("status").equals("done").count(),
      this.database.eventStore.where("status").equals("dead").count(),
      this.getOldestPendingEvent(),
      this.getNewestEvent(),
    ]);

    // Calculate average processing time (simplified - would need timing data in real implementation)
    const averageProcessingTime = await this.calculateAverageProcessingTime();

    return {
      totalEvents,
      pendingEvents,
      processingEvents,
      doneEvents,
      deadLetterEvents,
      averageProcessingTime,
      oldestPendingEvent: oldestPending?.createdAt
        ? new Date(oldestPending.createdAt)
        : undefined,
      newestEvent: newestEvent?.createdAt
        ? new Date(newestEvent.createdAt)
        : undefined,
    };
  }

  /**
   * Get detailed information about events by status
   */
  async getEventsByStatus(
    status: "pending" | "processing" | "done" | "dead",
    limit: number = 50,
    offset: number = 0
  ): Promise<EventDetails[]> {
    const events = await this.database.eventStore
      .where("status")
      .equals(status)
      .offset(offset)
      .limit(limit)
      .reverse() // Most recent first
      .toArray();

    return events.map(this.mapEventToDetails);
  }

  /**
   * Get events that are stuck (processing for too long or high attempt count)
   */
  async getStuckEvents(
    maxProcessingMinutes: number = 30,
    maxAttempts: number = 5
  ): Promise<EventDetails[]> {
    const cutoffTime = Date.now() - maxProcessingMinutes * 60 * 1000;

    const stuckEvents = await this.database.eventStore
      .where("status")
      .anyOf(["processing", "pending"])
      .and(
        (event) =>
          event.attemptCount >= maxAttempts ||
          (event.status === "processing" && event.createdAt < cutoffTime)
      )
      .toArray();

    return stuckEvents.map(this.mapEventToDetails);
  }

  /**
   * Get dead letter events with details
   */
  async getDeadLetterEvents(
    limit: number = 50,
    offset: number = 0
  ): Promise<EventDetails[]> {
    const events = await this.database.eventStore
      .where("status")
      .equals("dead")
      .offset(offset)
      .limit(limit)
      .reverse()
      .toArray();

    return events.map(this.mapEventToDetails);
  }

  /**
   * Get events for a specific aggregate
   */
  async getEventsForAggregate(
    aggregateId: string,
    limit: number = 50
  ): Promise<EventDetails[]> {
    const events = await this.database.eventStore
      .where("aggregateId")
      .equals(aggregateId)
      .limit(limit)
      .reverse()
      .toArray();

    return events.map(this.mapEventToDetails);
  }

  /**
   * Get processing statistics by event type
   */
  async getStatsByEventType(): Promise<
    Record<
      string,
      { total: number; pending: number; done: number; dead: number }
    >
  > {
    const allEvents = await this.database.eventStore.toArray();

    const stats: Record<
      string,
      { total: number; pending: number; done: number; dead: number }
    > = {};

    for (const event of allEvents) {
      if (!stats[event.eventType]) {
        stats[event.eventType] = { total: 0, pending: 0, done: 0, dead: 0 };
      }

      stats[event.eventType].total++;

      switch (event.status) {
        case "pending":
          stats[event.eventType].pending++;
          break;
        case "done":
          stats[event.eventType].done++;
          break;
        case "dead":
          stats[event.eventType].dead++;
          break;
      }
    }

    return stats;
  }

  /**
   * Get processing statistics by aggregate type
   */
  async getStatsByAggregateType(): Promise<
    Record<
      string,
      { total: number; pending: number; done: number; dead: number }
    >
  > {
    const allEvents = await this.database.eventStore.toArray();

    const stats: Record<
      string,
      { total: number; pending: number; done: number; dead: number }
    > = {};

    for (const event of allEvents) {
      if (!stats[event.aggregateType]) {
        stats[event.aggregateType] = { total: 0, pending: 0, done: 0, dead: 0 };
      }

      stats[event.aggregateType].total++;

      switch (event.status) {
        case "pending":
          stats[event.aggregateType].pending++;
          break;
        case "done":
          stats[event.aggregateType].done++;
          break;
        case "dead":
          stats[event.aggregateType].dead++;
          break;
      }
    }

    return stats;
  }

  /**
   * Reprocess a dead letter event (reset to pending)
   */
  async reprocessDeadLetterEvent(eventId: string): Promise<boolean> {
    try {
      const updated = await this.database.eventStore.update(eventId, {
        status: "pending" as const,
        attemptCount: 0,
        lastError: undefined,
        nextAttemptAt: Date.now(),
      });

      return updated > 0;
    } catch (error) {
      console.error("Failed to reprocess dead letter event:", error);
      return false;
    }
  }

  /**
   * Reprocess all dead letter events
   */
  async reprocessAllDeadLetterEvents(): Promise<number> {
    const deadEvents = await this.database.eventStore
      .where("status")
      .equals("dead")
      .toArray();

    let reprocessedCount = 0;

    for (const event of deadEvents) {
      const success = await this.reprocessDeadLetterEvent(event.id);
      if (success) {
        reprocessedCount++;
      }
    }

    return reprocessedCount;
  }

  /**
   * Get health status of event processing
   */
  async getHealthStatus(): Promise<{
    status: "healthy" | "warning" | "critical";
    issues: string[];
    recommendations: string[];
  }> {
    const stats = await this.getProcessingStats();
    const stuckEvents = await this.getStuckEvents();

    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: "healthy" | "warning" | "critical" = "healthy";

    // Check for high number of pending events
    if (stats.pendingEvents > 100) {
      issues.push(`High number of pending events: ${stats.pendingEvents}`);
      recommendations.push("Consider increasing event processing capacity");
      status = "warning";
    }

    // Check for dead letter events
    if (stats.deadLetterEvents > 0) {
      issues.push(`Dead letter events detected: ${stats.deadLetterEvents}`);
      recommendations.push("Review and reprocess dead letter events");
      if (stats.deadLetterEvents > 10) {
        status = "critical";
      } else if (status === "healthy") {
        status = "warning";
      }
    }

    // Check for stuck events
    if (stuckEvents.length > 0) {
      issues.push(`Stuck events detected: ${stuckEvents.length}`);
      recommendations.push(
        "Review stuck events and consider manual intervention"
      );
      status = "critical";
    }

    // Check for old pending events
    if (stats.oldestPendingEvent) {
      const ageHours =
        (Date.now() - stats.oldestPendingEvent.getTime()) / (1000 * 60 * 60);
      if (ageHours > 24) {
        issues.push(
          `Old pending events detected (${Math.round(ageHours)} hours old)`
        );
        recommendations.push("Investigate why events are not being processed");
        if (status !== "critical") {
          status = "warning";
        }
      }
    }

    return { status, issues, recommendations };
  }

  // Private helper methods

  private async getOldestPendingEvent(): Promise<EventStoreRecord | undefined> {
    const pendingEvents = await this.database.eventStore
      .where("status")
      .equals("pending")
      .toArray();

    if (pendingEvents.length === 0) return undefined;

    return pendingEvents.reduce((oldest, current) =>
      current.createdAt < oldest.createdAt ? current : oldest
    );
  }

  private async getNewestEvent(): Promise<EventStoreRecord | undefined> {
    const allEvents = await this.database.eventStore.toArray();

    if (allEvents.length === 0) return undefined;

    return allEvents.reduce((newest, current) =>
      current.createdAt > newest.createdAt ? current : newest
    );
  }

  private async calculateAverageProcessingTime(): Promise<number> {
    // Simplified calculation - in a real implementation, we'd track processing start/end times
    // For now, return 0 as placeholder
    return 0;
  }

  private mapEventToDetails(event: EventStoreRecord): EventDetails {
    return {
      id: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      status: event.status,
      attemptCount: event.attemptCount,
      createdAt: new Date(event.createdAt),
      nextAttemptAt: event.nextAttemptAt
        ? new Date(event.nextAttemptAt)
        : undefined,
      lastError: event.lastError,
    };
  }
}
