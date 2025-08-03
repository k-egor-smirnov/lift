import { injectable, inject } from "tsyringe";
import { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  SupabaseClientFactory,
  Database,
  SupabaseUtils,
} from "../database/SupabaseClient";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../domain/repositories/DailySelectionRepository";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { DateOnly } from "../../domain/value-objects/DateOnly";
import { TaskCategory, TaskStatus } from "../../domain/types";
import { taskEventBus } from "../events/TaskEventBus";
import * as tokens from "../di/tokens";

/**
 * Сервис для работы с Supabase Realtime
 * Обрабатывает изменения данных в реальном времени
 * Следует принципам local-first архитектуры
 */
@injectable()
export class SupabaseRealtimeService {
  private client: SupabaseClient<Database>;
  private tasksChannel: RealtimeChannel | null = null;
  private dailySelectionChannel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private isTasksSubscribed = false;
  private isDailySelectionSubscribed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1 секунда

  constructor(
    @inject(tokens.SUPABASE_CLIENT_FACTORY_TOKEN)
    private clientFactory: SupabaseClientFactory,
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private taskRepository: TaskRepository,
    @inject(tokens.DAILY_SELECTION_REPOSITORY_TOKEN)
    private dailySelectionRepository: DailySelectionRepository
  ) {
    this.client = this.clientFactory.getClient();
    this.initializeUserId();
  }

  private async initializeUserId(): Promise<void> {
    this.userId = await SupabaseUtils.getUserId(this.client);
  }

  /**
   * Устанавливает ID пользователя (для тестирования)
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Подписывается на изменения задач в реальном времени
   */
  async subscribeToTaskChanges(): Promise<void> {
    if (this.isTasksSubscribed || !this.userId) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Создаем канал для подписки на изменения задач
        this.tasksChannel = this.client
          .channel(`tasks_${this.userId}`)
          .on(
            "postgres_changes",
            {
              event: "*", // Слушаем все события: INSERT, UPDATE, DELETE
              schema: "public",
              table: "tasks",
              filter: `user_id=eq.${this.userId}`,
            },
            (payload) => this.handleTaskChange(payload)
          )
          .on("system", {}, (payload) => this.handleSystemEvent(payload))
          .subscribe((status, error) => {
            if (status === "SUBSCRIBED") {
              this.isTasksSubscribed = true;
              this.reconnectAttempts = 0;
              resolve();
            } else if (status === "CHANNEL_ERROR") {
              this.handleConnectionError(error);
              reject(
                new Error(
                  `Subscription failed: ${error?.message || "Unknown error"}`
                )
              );
            } else if (status === "TIMED_OUT") {
              this.handleTimeout();
              reject(new Error("Subscription timed out"));
            } else if (status === "CLOSED") {
              this.handleConnectionClosed();
              reject(new Error("Connection closed"));
            }
          });
      } catch (error) {
        console.error("Error subscribing to task changes:", error);
        reject(error);
      }
    });
  }

  /**
   * Подписывается на изменения ежедневного выбора в реальном времени
   */
  async subscribeToDailySelectionChanges(): Promise<void> {
    if (this.isDailySelectionSubscribed || !this.userId) {
      return;
    }

    try {
      // Создаем канал для подписки на изменения ежедневного выбора
      this.dailySelectionChannel = this.client
        .channel(`daily_selection_${this.userId}`)
        .on(
          "postgres_changes",
          {
            event: "*", // Слушаем все события: INSERT, UPDATE, DELETE
            schema: "public",
            table: "daily_selection_entries",
            filter: `user_id=eq.${this.userId}`,
          },
          (payload) => this.handleDailySelectionChange(payload)
        )
        .on("system", {}, (payload) => this.handleSystemEvent(payload))
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            this.isDailySelectionSubscribed = true;
            this.reconnectAttempts = 0;
          } else if (status === "CHANNEL_ERROR") {
            this.handleConnectionError(error);
          } else if (status === "TIMED_OUT") {
            this.handleTimeout();
          } else if (status === "CLOSED") {
            this.handleConnectionClosed();
          }
        });
    } catch (error) {
      console.error("Error subscribing to daily selection changes:", error);
      throw error;
    }
  }

  /**
   * Подписывается на все изменения (задачи и ежедневный выбор)
   */
  async subscribeToAllChanges(): Promise<void> {
    await Promise.all([
      this.subscribeToTaskChanges(),
      this.subscribeToDailySelectionChanges(),
    ]);
  }

  /**
   * Отписывается от изменений задач
   */
  async unsubscribeFromTaskChanges(): Promise<void> {
    if (this.tasksChannel) {
      await this.tasksChannel.unsubscribe();
      this.tasksChannel = null;
      this.isTasksSubscribed = false;
    }
  }

  /**
   * Отписывается от изменений ежедневного выбора
   */
  async unsubscribeFromDailySelectionChanges(): Promise<void> {
    if (this.dailySelectionChannel) {
      await this.dailySelectionChannel.unsubscribe();
      this.dailySelectionChannel = null;
      this.isDailySelectionSubscribed = false;
    }
  }

  /**
   * Отписывается от всех изменений
   */
  async unsubscribeFromAllChanges(): Promise<void> {
    await Promise.all([
      this.unsubscribeFromTaskChanges(),
      this.unsubscribeFromDailySelectionChanges(),
    ]);
  }

  /**
   * Проверяет статус подписки на задачи
   */
  isTasksConnected(): boolean {
    return this.isTasksSubscribed && this.tasksChannel !== null;
  }

  /**
   * Проверяет статус подписки на ежедневный выбор
   */
  isDailySelectionConnected(): boolean {
    return (
      this.isDailySelectionSubscribed && this.dailySelectionChannel !== null
    );
  }

  /**
   * Проверяет статус подписки (совместимость с предыдущей версией)
   */
  isConnected(): boolean {
    return this.isTasksConnected() || this.isDailySelectionConnected();
  }

  /**
   * Переподключение к real-time каналу
   */
  async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;

    // Отписываемся от всех каналов
    await this.unsubscribeFromAllChanges();

    // Ждем перед переподключением
    await new Promise((resolve) =>
      setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts)
    );

    // Переподключаемся ко всем каналам
    await this.subscribeToAllChanges();
  }

  /**
   * Обрабатывает изменения задач из real-time канала
   */
  private async handleTaskChange(payload: any): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      switch (eventType) {
        case "INSERT":
          await this.handleTaskInsert(newRecord);
          break;
        case "UPDATE":
          await this.handleTaskUpdate(newRecord, oldRecord);
          break;
        case "DELETE":
          await this.handleTaskDelete(oldRecord);
          break;
        default:
          console.warn("Unknown event type:", eventType);
      }
    } catch (error) {
      console.error("Error handling task change:", error);
    }
  }

  /**
   * Обрабатывает изменения ежедневного выбора
   */
  private async handleDailySelectionChange(payload: any): Promise<void> {
    try {
      let { eventType, new: newRecord, old: oldRecord } = payload;
      const record = newRecord || oldRecord;

      if (!record) {
        console.warn("No record found in daily selection change payload");
        return;
      }

      // Игнорируем soft-удаленные записи (кроме случая, когда это само событие soft delete)
      if (record.deleted_at && eventType !== "UPDATE") {
        return;
      }

      // Для UPDATE событий проверяем, не является ли это soft delete
      if (
        eventType === "UPDATE" &&
        newRecord?.deleted_at &&
        !oldRecord?.deleted_at
      ) {
        // Это soft delete - обрабатываем как удаление
        eventType = "DELETE";
      }

      // Получаем текущую дату для проверки актуальности изменения
      const today = DateOnly.today();
      const recordDate = DateOnly.fromString(record.date);

      // Обрабатываем только изменения для сегодняшней даты
      if (recordDate.equals(today)) {
        // Эмитируем событие для обновления списка задач на сегодня
        taskEventBus.emit("daily_selection_changed", {
          type: eventType.toLowerCase(),
          entry: record,
          date: recordDate,
        });

        console.log(`Daily selection ${eventType} for today:`, record);
      }
    } catch (error) {
      console.error("Error handling daily selection change:", error);
    }
  }

  /**
   * Обрабатывает вставку новой задачи
   */
  private async handleTaskInsert(
    record: Database["public"]["Tables"]["tasks"]["Row"]
  ): Promise<void> {
    // Проверяем, не существует ли задача уже локально
    const taskId = new TaskId(record.id);
    const existingTask = await this.taskRepository.findById(taskId);

    if (!existingTask) {
      const task = this.mapSupabaseRowToTask(record);
      await this.taskRepository.save(task);
    }
  }

  /**
   * Обрабатывает обновление задачи
   */
  private async handleTaskUpdate(
    newRecord: Database["public"]["Tables"]["tasks"]["Row"],
    oldRecord: Database["public"]["Tables"]["tasks"]["Row"]
  ): Promise<void> {
    const taskId = new TaskId(newRecord.id);
    const localTask = await this.taskRepository.findById(taskId);

    if (localTask) {
      const remoteTask = this.mapSupabaseRowToTask(newRecord);

      // Проверяем, не является ли это изменение результатом нашего собственного обновления
      if (this.isOwnUpdate(localTask, remoteTask)) {
        return;
      }

      // Применяем стратегию разрешения конфликтов
      const resolvedTask = await this.resolveConflict(localTask, remoteTask);
      await this.taskRepository.save(resolvedTask);
    } else {
      // Задача не существует локально, создаем её
      await this.handleTaskInsert(newRecord);
    }
  }

  /**
   * Обрабатывает удаление задачи
   */
  private async handleTaskDelete(
    record: Database["public"]["Tables"]["tasks"]["Row"]
  ): Promise<void> {
    const taskId = new TaskId(record.id);
    const existingTask = await this.taskRepository.findById(taskId);

    if (existingTask) {
      await this.taskRepository.delete(taskId);
    }
  }

  /**
   * Обрабатывает системные события канала
   */
  private async handleSystemEvent(payload: any): Promise<void> {
    console.log("System event:", payload);
  }

  /**
   * Обрабатывает ошибки подключения
   */
  private async handleConnectionError(error?: any): Promise<void> {
    this.isTasksSubscribed = false;
    this.isDailySelectionSubscribed = false;

    console.error("Real-time connection error:", error);

    // Пытаемся переподключиться только если это не критическая ошибка конфигурации
    if (
      !error ||
      !error.message ||
      !error.message.includes("Unable to subscribe")
    ) {
      setTimeout(() => this.reconnect(), this.reconnectDelay);
    }
  }

  /**
   * Обрабатывает таймаут подключения
   */
  private async handleTimeout(): Promise<void> {
    this.isTasksSubscribed = false;
    this.isDailySelectionSubscribed = false;

    // Пытаемся переподключиться
    setTimeout(() => this.reconnect(), this.reconnectDelay);
  }

  /**
   * Обрабатывает закрытие подключения
   */
  private async handleConnectionClosed(): Promise<void> {
    this.isTasksSubscribed = false;
    this.isDailySelectionSubscribed = false;
  }

  /**
   * Проверяет, является ли обновление результатом собственного изменения
   */
  private isOwnUpdate(localTask: Task, remoteTask: Task): boolean {
    // Простая эвристика: если время обновления локальной задачи больше или равно удаленной,
    // то это может быть наше собственное обновление
    return localTask.updatedAt >= remoteTask.updatedAt;
  }

  /**
   * Разрешает конфликт между локальной и удаленной версиями задачи
   */
  private async resolveConflict(
    localTask: Task,
    remoteTask: Task
  ): Promise<Task> {
    // Стратегия: последнее изменение побеждает
    if (remoteTask.updatedAt > localTask.updatedAt) {
      return remoteTask;
    } else {
      // Если локальная версия новее, оставляем её
      return localTask;
    }
  }

  /**
   * Преобразует строку таблицы Supabase в доменную модель Task
   */
  private mapSupabaseRowToTask(
    row: Database["public"]["Tables"]["tasks"]["Row"]
  ): Task {
    return new Task(
      new TaskId(row.id),
      new NonEmptyTitle(row.title),
      row.category as TaskCategory,
      row.status as TaskStatus,
      row.order,
      SupabaseUtils.fromISOString(row.created_at),
      SupabaseUtils.fromISOString(row.updated_at),
      row.deleted_at ? SupabaseUtils.fromISOString(row.deleted_at) : undefined,
      row.inbox_entered_at
        ? SupabaseUtils.fromISOString(row.inbox_entered_at)
        : undefined,
      row.deferred_until
        ? SupabaseUtils.fromISOString(row.deferred_until)
        : undefined,
      row.original_category as TaskCategory | undefined
    );
  }
}
