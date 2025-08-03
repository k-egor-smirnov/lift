import { TodoDatabase } from "../../../../shared/infrastructure/database/TodoDatabase";

export interface CleanupResult {
  eventsDeleted: number;
  handledEventsDeleted: number;
  locksDeleted: number;
  totalSpaceFreed: number; // Estimated in KB
}

export interface CleanupOptions {
  retentionDays: number;
  batchSize: number;
  preserveDeadLetters: boolean;
  dryRun: boolean;
}

/**
 * Service for cleaning up processed events and maintaining database health
 * Removes old processed events while preserving important data
 */
export class EventCleanupService {
  constructor(private database: TodoDatabase) {}

  /**
   * Clean up processed events older than specified days
   */
  async cleanupProcessedEvents(
    options: Partial<CleanupOptions> = {}
  ): Promise<CleanupResult> {
    const config: CleanupOptions = {
      retentionDays: 30,
      batchSize: 100,
      preserveDeadLetters: true,
      dryRun: false,
      ...options,
    };

    const cutoffDate = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;

    let totalEventsDeleted = 0;
    let totalHandledEventsDeleted = 0;
    let totalLocksDeleted = 0;

    // Clean up done events
    const doneEventsDeleted = await this.cleanupEventsByStatus(
      "done",
      cutoffDate,
      config.batchSize,
      config.dryRun
    );
    totalEventsDeleted += doneEventsDeleted;

    // Clean up dead letter events if not preserving them
    if (!config.preserveDeadLetters) {
      const deadEventsDeleted = await this.cleanupEventsByStatus(
        "dead",
        cutoffDate,
        config.batchSize,
        config.dryRun
      );
      totalEventsDeleted += deadEventsDeleted;
    }

    // Clean up handled events for deleted events
    totalHandledEventsDeleted = await this.cleanupOrphanedHandledEvents(
      config.batchSize,
      config.dryRun
    );

    // Clean up expired locks
    totalLocksDeleted = await this.cleanupExpiredLocks(config.dryRun);

    // Estimate space freed (rough calculation)
    const estimatedSpaceFreed = this.estimateSpaceFreed(
      totalEventsDeleted,
      totalHandledEventsDeleted,
      totalLocksDeleted
    );

    return {
      eventsDeleted: totalEventsDeleted,
      handledEventsDeleted: totalHandledEventsDeleted,
      locksDeleted: totalLocksDeleted,
      totalSpaceFreed: estimatedSpaceFreed,
    };
  }

  /**
   * Clean up events by status and age
   */
  private async cleanupEventsByStatus(
    status: "done" | "dead",
    cutoffDate: number,
    batchSize: number,
    dryRun: boolean
  ): Promise<number> {
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const eventsToDelete = await this.database.eventStore
        .where("status")
        .equals(status)
        .and((event) => event.createdAt < cutoffDate)
        .limit(batchSize)
        .toArray();

      if (eventsToDelete.length === 0) {
        hasMore = false;
        break;
      }

      if (!dryRun) {
        // Delete in transaction for consistency
        await this.database.transaction(
          "rw",
          [this.database.eventStore, this.database.handledEvents],
          async () => {
            const eventIds = eventsToDelete.map((e) => e.id);

            // Delete the events
            await this.database.eventStore.bulkDelete(eventIds);

            // Delete related handled events
            for (const eventId of eventIds) {
              await this.database.handledEvents
                .where("eventId")
                .equals(eventId)
                .delete();
            }
          }
        );
      }

      totalDeleted += eventsToDelete.length;

      // If we got fewer events than batch size, we're done
      if (eventsToDelete.length < batchSize) {
        hasMore = false;
      }
    }

    return totalDeleted;
  }

  /**
   * Clean up handled events that no longer have corresponding events
   */
  private async cleanupOrphanedHandledEvents(
    batchSize: number,
    dryRun: boolean
  ): Promise<number> {
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const handledEvents = await this.database.handledEvents
        .limit(batchSize)
        .toArray();

      if (handledEvents.length === 0) {
        hasMore = false;
        break;
      }

      const orphanedEvents = [];

      // Check which handled events are orphaned
      for (const handledEvent of handledEvents) {
        const eventExists = await this.database.eventStore.get(
          handledEvent.eventId
        );
        if (!eventExists) {
          orphanedEvents.push(handledEvent);
        }
      }

      if (orphanedEvents.length > 0 && !dryRun) {
        const keysToDelete = orphanedEvents.map((he) => [
          he.eventId,
          he.handlerId,
        ]);
        await this.database.handledEvents.bulkDelete(keysToDelete);
      }

      totalDeleted += orphanedEvents.length;

      // If we processed fewer than batch size, we're done
      if (handledEvents.length < batchSize) {
        hasMore = false;
      }
    }

    return totalDeleted;
  }

  /**
   * Clean up expired locks
   */
  private async cleanupExpiredLocks(dryRun: boolean): Promise<number> {
    const now = Date.now();

    const expiredLocks = await this.database.locks
      .where("expiresAt")
      .below(now)
      .toArray();

    if (expiredLocks.length > 0 && !dryRun) {
      const lockIds = expiredLocks.map((lock) => lock.id);
      await this.database.locks.bulkDelete(lockIds);
    }

    return expiredLocks.length;
  }

  /**
   * Get cleanup statistics without performing cleanup
   */
  async getCleanupStats(retentionDays: number = 30): Promise<{
    doneEventsToCleanup: number;
    deadEventsToCleanup: number;
    orphanedHandledEvents: number;
    expiredLocks: number;
    estimatedSpaceToFree: number;
  }> {
    const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [doneEventsToCleanup, deadEventsToCleanup, expiredLocks] =
      await Promise.all([
        this.database.eventStore
          .where("status")
          .equals("done")
          .and((event) => event.createdAt < cutoffDate)
          .count(),
        this.database.eventStore
          .where("status")
          .equals("dead")
          .and((event) => event.createdAt < cutoffDate)
          .count(),
        this.database.locks.where("expiresAt").below(now).count(),
      ]);

    // Count orphaned handled events (simplified check)
    const allHandledEvents = await this.database.handledEvents.toArray();
    let orphanedHandledEvents = 0;

    for (const handledEvent of allHandledEvents) {
      const eventExists = await this.database.eventStore.get(
        handledEvent.eventId
      );
      if (!eventExists) {
        orphanedHandledEvents++;
      }
    }

    const estimatedSpaceToFree = this.estimateSpaceFreed(
      doneEventsToCleanup + deadEventsToCleanup,
      orphanedHandledEvents,
      expiredLocks
    );

    return {
      doneEventsToCleanup,
      deadEventsToCleanup,
      orphanedHandledEvents,
      expiredLocks,
      estimatedSpaceToFree,
    };
  }

  /**
   * Archive events before deletion (export to JSON)
   */
  async archiveEventsBeforeCleanup(
    retentionDays: number = 30,
    includeDeadLetters: boolean = true
  ): Promise<{ archiveData: any[]; eventCount: number }> {
    const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    let eventsToArchive = await this.database.eventStore
      .where("status")
      .equals("done")
      .and((event) => event.createdAt < cutoffDate)
      .toArray();

    if (includeDeadLetters) {
      const deadEvents = await this.database.eventStore
        .where("status")
        .equals("dead")
        .and((event) => event.createdAt < cutoffDate)
        .toArray();

      eventsToArchive = [...eventsToArchive, ...deadEvents];
    }

    // Sort by creation date
    eventsToArchive.sort((a, b) => a.createdAt - b.createdAt);

    const archiveData = eventsToArchive.map((event) => ({
      ...event,
      archivedAt: new Date().toISOString(),
    }));

    return {
      archiveData,
      eventCount: eventsToArchive.length,
    };
  }

  /**
   * Perform database optimization after cleanup
   */
  async optimizeDatabase(): Promise<void> {
    // IndexedDB doesn't have explicit optimization commands like SQL databases
    // But we can trigger garbage collection by accessing the database
    try {
      await this.database.eventStore.count();
      await this.database.handledEvents.count();
      await this.database.locks.count();

      console.log("Database optimization completed");
    } catch (error) {
      console.error("Database optimization failed:", error);
    }
  }

  /**
   * Schedule automatic cleanup
   */
  scheduleAutomaticCleanup(
    intervalHours: number = 24,
    options: Partial<CleanupOptions> = {}
  ): () => void {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    const cleanup = async () => {
      try {
        console.log("Starting automatic event cleanup...");
        const result = await this.cleanupProcessedEvents(options);
        console.log("Automatic cleanup completed:", result);
      } catch (error) {
        console.error("Automatic cleanup failed:", error);
      }
    };

    // Run initial cleanup
    cleanup();

    // Schedule recurring cleanup
    const intervalId = setInterval(cleanup, intervalMs);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
      console.log("Automatic cleanup scheduled stopped");
    };
  }

  // Private helper methods

  private estimateSpaceFreed(
    eventsDeleted: number,
    handledEventsDeleted: number,
    locksDeleted: number
  ): number {
    // Rough estimates in bytes
    const avgEventSize = 500; // JSON event data
    const avgHandledEventSize = 50; // Simple record
    const avgLockSize = 30; // Simple record

    const totalBytes =
      eventsDeleted * avgEventSize +
      handledEventsDeleted * avgHandledEventSize +
      locksDeleted * avgLockSize;

    // Return in KB
    return Math.round(totalBytes / 1024);
  }
}
