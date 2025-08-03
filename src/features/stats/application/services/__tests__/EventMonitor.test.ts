import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventMonitor } from "../EventMonitor";
import {
  TodoDatabase,
  EventStoreRecord,
} from "../../../../../shared/infrastructure/database/TodoDatabase";

// Mock TodoDatabase
const mockDatabase = {
  eventStore: {
    count: vi.fn(),
    where: vi.fn(),
    update: vi.fn(),
    orderBy: vi.fn(),
    toArray: vi.fn(),
  },
} as unknown as TodoDatabase;

describe("EventMonitor", () => {
  let monitor: EventMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new EventMonitor(mockDatabase);
  });

  describe("getProcessingStats", () => {
    it("should return comprehensive processing statistics", async () => {
      // Mock the database calls
      (mockDatabase.eventStore.count as any).mockResolvedValue(100);

      const mockWhereChain = {
        equals: vi.fn().mockReturnThis(),
        count: vi.fn(),
      };

      (mockDatabase.eventStore.where as any).mockReturnValue(mockWhereChain);

      // Mock counts for different statuses
      mockWhereChain.count
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(5) // processing
        .mockResolvedValueOnce(80) // done
        .mockResolvedValueOnce(5); // dead

      // Mock the private methods directly since the chaining is complex
      vi.spyOn(monitor as any, "getOldestPendingEvent").mockResolvedValue({
        createdAt: Date.now() - 1000,
      });
      vi.spyOn(monitor as any, "getNewestEvent").mockResolvedValue({
        createdAt: Date.now(),
      });
      vi.spyOn(
        monitor as any,
        "calculateAverageProcessingTime"
      ).mockResolvedValue(0);

      const stats = await monitor.getProcessingStats();

      expect(stats).toEqual({
        totalEvents: 100,
        pendingEvents: 10,
        processingEvents: 5,
        doneEvents: 80,
        deadLetterEvents: 5,
        averageProcessingTime: 0, // Placeholder
        oldestPendingEvent: expect.any(Date),
        newestEvent: expect.any(Date),
      });
    });
  });

  describe("getEventsByStatus", () => {
    it("should return events filtered by status with pagination", async () => {
      const mockEvents: EventStoreRecord[] = [
        {
          id: "event-1",
          aggregateId: "task-1",
          aggregateType: "Task",
          eventType: "TASK_CREATED",
          eventData: "{}",
          status: "pending",
          attemptCount: 0,
          createdAt: Date.now(),
        },
      ];

      const mockWhereChain = {
        equals: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        reverse: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(mockEvents),
      };

      (mockDatabase.eventStore.where as any).mockReturnValue(mockWhereChain);

      const result = await monitor.getEventsByStatus("pending", 10, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "event-1",
        aggregateId: "task-1",
        aggregateType: "Task",
        eventType: "TASK_CREATED",
        status: "pending",
        attemptCount: 0,
        createdAt: expect.any(Date),
        nextAttemptAt: undefined,
        lastError: undefined,
      });

      expect(mockWhereChain.equals).toHaveBeenCalledWith("pending");
      expect(mockWhereChain.offset).toHaveBeenCalledWith(0);
      expect(mockWhereChain.limit).toHaveBeenCalledWith(10);
    });
  });

  describe("getStuckEvents", () => {
    it("should identify events with high attempt count or long processing time", async () => {
      const stuckEvents: EventStoreRecord[] = [
        {
          id: "stuck-1",
          aggregateId: "task-1",
          aggregateType: "Task",
          eventType: "TASK_CREATED",
          eventData: "{}",
          status: "pending",
          attemptCount: 6, // High attempt count
          createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        },
      ];

      const mockWhereChain = {
        anyOf: vi.fn().mockReturnThis(),
        and: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(stuckEvents),
      };

      (mockDatabase.eventStore.where as any).mockReturnValue(mockWhereChain);

      const result = await monitor.getStuckEvents(30, 5);

      expect(result).toHaveLength(1);
      expect(result[0].attemptCount).toBe(6);
      expect(mockWhereChain.anyOf).toHaveBeenCalledWith([
        "processing",
        "pending",
      ]);
    });
  });

  describe("getHealthStatus", () => {
    it("should return healthy status when everything is normal", async () => {
      // Mock normal stats
      vi.spyOn(monitor, "getProcessingStats").mockResolvedValue({
        totalEvents: 50,
        pendingEvents: 5,
        processingEvents: 2,
        doneEvents: 43,
        deadLetterEvents: 0,
        averageProcessingTime: 100,
      });

      vi.spyOn(monitor, "getStuckEvents").mockResolvedValue([]);

      const health = await monitor.getHealthStatus();

      expect(health.status).toBe("healthy");
      expect(health.issues).toHaveLength(0);
      expect(health.recommendations).toHaveLength(0);
    });

    it("should return warning status for high pending events", async () => {
      vi.spyOn(monitor, "getProcessingStats").mockResolvedValue({
        totalEvents: 200,
        pendingEvents: 150, // High number
        processingEvents: 5,
        doneEvents: 45,
        deadLetterEvents: 0,
        averageProcessingTime: 100,
      });

      vi.spyOn(monitor, "getStuckEvents").mockResolvedValue([]);

      const health = await monitor.getHealthStatus();

      expect(health.status).toBe("warning");
      expect(health.issues).toContain("High number of pending events: 150");
      expect(health.recommendations).toContain(
        "Consider increasing event processing capacity"
      );
    });

    it("should return critical status for dead letter events", async () => {
      vi.spyOn(monitor, "getProcessingStats").mockResolvedValue({
        totalEvents: 100,
        pendingEvents: 10,
        processingEvents: 5,
        doneEvents: 70,
        deadLetterEvents: 15, // High number of dead letters
        averageProcessingTime: 100,
      });

      vi.spyOn(monitor, "getStuckEvents").mockResolvedValue([]);

      const health = await monitor.getHealthStatus();

      expect(health.status).toBe("critical");
      expect(health.issues).toContain("Dead letter events detected: 15");
      expect(health.recommendations).toContain(
        "Review and reprocess dead letter events"
      );
    });

    it("should return critical status for stuck events", async () => {
      vi.spyOn(monitor, "getProcessingStats").mockResolvedValue({
        totalEvents: 50,
        pendingEvents: 5,
        processingEvents: 2,
        doneEvents: 43,
        deadLetterEvents: 0,
        averageProcessingTime: 100,
      });

      vi.spyOn(monitor, "getStuckEvents").mockResolvedValue([
        {
          id: "stuck-1",
          aggregateId: "task-1",
          aggregateType: "Task",
          eventType: "TASK_CREATED",
          status: "pending",
          attemptCount: 6,
          createdAt: new Date(),
        },
      ]);

      const health = await monitor.getHealthStatus();

      expect(health.status).toBe("critical");
      expect(health.issues).toContain("Stuck events detected: 1");
      expect(health.recommendations).toContain(
        "Review stuck events and consider manual intervention"
      );
    });
  });

  describe("reprocessDeadLetterEvent", () => {
    it("should reset dead letter event to pending status", async () => {
      (mockDatabase.eventStore.update as any).mockResolvedValue(1);

      const result = await monitor.reprocessDeadLetterEvent("event-123");

      expect(result).toBe(true);
      expect(mockDatabase.eventStore.update).toHaveBeenCalledWith("event-123", {
        status: "pending",
        attemptCount: 0,
        lastError: undefined,
        nextAttemptAt: expect.any(Number),
      });
    });

    it("should return false if event update fails", async () => {
      (mockDatabase.eventStore.update as any).mockResolvedValue(0);

      const result = await monitor.reprocessDeadLetterEvent("non-existent");

      expect(result).toBe(false);
    });

    it("should handle database errors gracefully", async () => {
      (mockDatabase.eventStore.update as any).mockRejectedValue(
        new Error("Database error")
      );

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await monitor.reprocessDeadLetterEvent("event-123");

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to reprocess dead letter event:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("getStatsByEventType", () => {
    it("should aggregate statistics by event type", async () => {
      const mockEvents: EventStoreRecord[] = [
        {
          id: "1",
          aggregateId: "task-1",
          aggregateType: "Task",
          eventType: "TASK_CREATED",
          eventData: "{}",
          status: "done",
          attemptCount: 1,
          createdAt: Date.now(),
        },
        {
          id: "2",
          aggregateId: "task-2",
          aggregateType: "Task",
          eventType: "TASK_CREATED",
          eventData: "{}",
          status: "pending",
          attemptCount: 0,
          createdAt: Date.now(),
        },
        {
          id: "3",
          aggregateId: "task-1",
          aggregateType: "Task",
          eventType: "TASK_COMPLETED",
          eventData: "{}",
          status: "done",
          attemptCount: 1,
          createdAt: Date.now(),
        },
      ];

      (mockDatabase.eventStore.toArray as any).mockResolvedValue(mockEvents);

      const stats = await monitor.getStatsByEventType();

      expect(stats).toEqual({
        TASK_CREATED: {
          total: 2,
          pending: 1,
          done: 1,
          dead: 0,
        },
        TASK_COMPLETED: {
          total: 1,
          pending: 0,
          done: 1,
          dead: 0,
        },
      });
    });
  });
});
