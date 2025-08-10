import { DomainEvent } from "../../../../shared/domain/events/DomainEvent";
import { DomainEventType } from "../../../../shared/domain/types";
import { TodoDatabase } from "../../../../shared/infrastructure/database/TodoDatabase";
import { EventHandler } from "./TaskLogEventHandler";

// Define a custom event for overdue tasks
export class TaskOverdueEvent extends DomainEvent {
  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly daysSinceInbox: number
  ) {
    super(DomainEventType.TASK_OVERDUE);
  }

  getEventData(): Record<string, any> {
    return {
      taskId: this.taskId,
      taskTitle: this.taskTitle,
      daysSinceInbox: this.daysSinceInbox,
    };
  }
}

/**
 * Event handler for overdue task notifications
 * Handles notifications when tasks become overdue in the inbox
 */
export class NotificationHandler implements EventHandler {
  id = "notification-handler";

  constructor(private database: TodoDatabase) {}

  async handle(event: DomainEvent): Promise<void> {
    if (event.eventType === DomainEventType.TASK_OVERDUE) {
      await this.handleTaskOverdue(event as TaskOverdueEvent);
    }
  }

  private async handleTaskOverdue(event: TaskOverdueEvent): Promise<void> {
    try {
      // Create a system log for the overdue notification
      const logId = `task-overdue-${event.taskId}-${event.occurredAt.getTime()}`;

      await this.database.taskLogs.put({
        id: logId,
        taskId: event.taskId,
        type: "SYSTEM",
        message: `Task is overdue in inbox (${event.daysSinceInbox} days)`,
        metadata: {
          eventType: event.eventType,
          daysSinceInbox: event.daysSinceInbox,
          notificationSent: true,
        },
        createdAt: event.occurredAt,
      });

      // Send browser notification if supported and permitted
      await this.sendBrowserNotification(event);
    } catch (error) {
      console.error("Failed to handle overdue task notification:", error);
      // Don't throw - notification failures shouldn't break event processing
    }
  }

  private async sendBrowserNotification(
    event: TaskOverdueEvent
  ): Promise<void> {
    // Check if notifications are supported
    if (!("Notification" in window)) {
      console.log("Browser notifications not supported");
      return;
    }

    // Check permission status
    if (Notification.permission === "granted") {
      new Notification("Task Overdue", {
        body: `"${event.taskTitle}" has been in your inbox for ${event.daysSinceInbox} days`,
        icon: "/favicon.ico",
        tag: `overdue-${event.taskId}`, // Prevent duplicate notifications
        requireInteraction: false,
        silent: false,
      });
    } else if (Notification.permission === "default") {
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification("Task Overdue", {
          body: `"${event.taskTitle}" has been in your inbox for ${event.daysSinceInbox} days`,
          icon: "/favicon.ico",
          tag: `overdue-${event.taskId}`,
          requireInteraction: false,
          silent: false,
        });
      }
    }
    // If permission is 'denied', we don't send notifications
  }
}

/**
 * Service to check for overdue tasks and emit events
 * This would typically be called by a background job or scheduler
 */
export class OverdueTaskChecker {
  constructor(private database: TodoDatabase) {}

  async checkForOverdueTasks(
    overdueDays: number = 3
  ): Promise<TaskOverdueEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - overdueDays);

    // Find tasks in INBOX that are older than the cutoff
    const overdueTasks = await this.database.tasks
      .where("category")
      .equals("INBOX")
      .and(
        (task) =>
          task.status === "ACTIVE" &&
          task.inboxEnteredAt != null &&
          new Date(task.inboxEnteredAt) <= cutoffDate
      )
      .toArray();

    const events: TaskOverdueEvent[] = [];

    for (const task of overdueTasks) {
      if (task.inboxEnteredAt) {
        const daysSinceInbox = Math.floor(
          (Date.now() - new Date(task.inboxEnteredAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        // Check if we've already sent a notification for this task recently
        const recentNotification = await this.database.taskLogs
          .where("taskId")
          .equals(task.id)
          .and(
            (log) =>
              log.type === "SYSTEM" &&
              log.message.includes("overdue") &&
              log.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
          )
          .first();

        if (!recentNotification) {
          events.push(
            new TaskOverdueEvent(task.id, task.title, daysSinceInbox)
          );
        }
      }
    }

    return events;
  }
}
