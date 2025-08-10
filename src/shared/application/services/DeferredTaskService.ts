import { inject, injectable } from "tsyringe";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";
import { TaskCategory } from "../../domain/types";
import { EventBus } from "../../domain/events/EventBus";

import {
  TASK_REPOSITORY_TOKEN,
  EVENT_BUS_TOKEN,
} from "../../infrastructure/di/tokens";

@injectable()
export class DeferredTaskService {
  constructor(
    @inject(TASK_REPOSITORY_TOKEN)
    private readonly taskRepository: TaskRepository,
    @inject(EVENT_BUS_TOKEN) private readonly eventBus: EventBus
  ) {}

  async deferTask(taskId: TaskId, deferredUntil: Date): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId.value} not found`);
    }

    if (task.isDeferred) {
      throw new Error("Task is already deferred");
    }

    const events = task.defer(deferredUntil);
    const deferredTask = task.copyWith({
      category: TaskCategory.DEFERRED,
      deferredUntil,
      originalCategory: task.category,
      updatedAt: new Date(),
    });

    await this.taskRepository.save(deferredTask);

    // Publish domain events
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }

  async undeferTask(taskId: TaskId): Promise<void> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId.value} not found`);
    }

    if (!task.isDeferred) {
      throw new Error("Task is not deferred");
    }

    const events = task.undefer();
    const restoredCategory = task.originalCategory || TaskCategory.INBOX;
    const undeferredTask = task.copyWith({
      category: restoredCategory,
      deferredUntil: undefined,
      originalCategory: undefined,
      updatedAt: new Date(),
    });

    await this.taskRepository.save(undeferredTask);

    // Publish domain events
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }

  async getDeferredTasks(): Promise<Task[]> {
    return await this.taskRepository.findByCategory(TaskCategory.DEFERRED);
  }

  async processDueTasks(): Promise<void> {
    // This method would be called periodically to check for due deferred tasks
    // and automatically undefer them
    const dueTasks = await this.getDueTasks();

    for (const task of dueTasks) {
      await this.undeferTask(task.id);
    }
  }

  private async getDueTasks(): Promise<Task[]> {
    const deferredTasks = await this.getDeferredTasks();

    return deferredTasks.filter((task) => task.isDeferredAndDue);
  }
}
