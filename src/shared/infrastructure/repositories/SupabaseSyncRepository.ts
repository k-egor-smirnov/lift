import { injectable, inject } from "tsyringe";
import type { SyncRepository } from "../../domain/repositories/SyncRepository";
import {
  SyncResult,
  SyncError,
  ConflictResolutionStrategy,
} from "../../domain/repositories/SyncRepository";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import { Task } from "../../domain/entities/Task";
import { TaskId } from "../../domain/value-objects/TaskId";
import { NonEmptyTitle } from "../../domain/value-objects/NonEmptyTitle";
import { TaskCategory, TaskStatus } from "../../domain/types";
import {
  SupabaseClientFactory,
  Database,
  SupabaseUtils,
} from "../database/SupabaseClient";
import {
  TodoDatabase,
  DailySelectionEntryRecord,
  TaskLogRecord,
} from "../database/TodoDatabase";
import * as tokens from "../di/tokens";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Реализация SyncRepository для Supabase
 * Обеспечивает синхронизацию данных между локальным IndexedDB и Supabase
 * Следует принципам local-first архитектуры
 */
@injectable()
export class SupabaseSyncRepository implements SyncRepository {
  private client: SupabaseClient<Database>;
  private deviceId: string;
  private userId: string | null = null;

  constructor(
    @inject(tokens.SUPABASE_CLIENT_FACTORY_TOKEN)
    private clientFactory: SupabaseClientFactory,
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private taskRepository: TaskRepository,
    @inject(tokens.DATABASE_TOKEN) private db: TodoDatabase
  ) {
    this.client = this.clientFactory.getClient();
    this.deviceId = SupabaseUtils.getDeviceId();
    this.initializeUserId();
  }

  private async initializeUserId(): Promise<void> {
    this.userId = await SupabaseUtils.getUserId(this.client);
  }

  async syncTasks(lastSyncTimestamp?: Date): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
    };

    try {
      // Проверяем авторизацию
      if (!this.userId) {
        this.userId = await SupabaseUtils.getUserId(this.client);
        if (!this.userId) {
          result.error = {
            code: "AUTH_ERROR",
            message: "Пользователь не авторизован",
          };
          return result;
        }
      }

      // 1. Получаем изменения с сервера
      const remoteTasks = await this.pullTasks(lastSyncTimestamp);
      result.pulledCount = remoteTasks.length;

      // 2. Получаем локальные задачи, измененные после последней синхронизации
      const localTasks =
        await this.getLocalTasksModifiedAfter(lastSyncTimestamp);

      // 3. Разрешаем конфликты и применяем изменения
      const { resolvedTasks, conflicts } = await this.resolveConflictsAndMerge(
        localTasks,
        remoteTasks
      );

      // 4. Сохраняем разрешенные задачи локально
      if (resolvedTasks.length > 0) {
        await this.taskRepository.saveMany(resolvedTasks);
      }

      // 5. Отправляем локальные изменения на сервер (только если есть локальные изменения)
      if (localTasks.length > 0) {
        await this.pushTasks(localTasks);
      }
      result.pushedCount = localTasks.length;

      // 6. Обновляем метаданные синхронизации
      await this.updateSyncMetadata(new Date());

      result.success = true;
      result.conflictsResolved = conflicts;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка синхронизации";
      result.error = {
        code: "SYNC_ERROR",
        message: errorMessage,
        details: error,
      };
    }

    return result;
  }

  async pushTasks(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) {
      return;
    }

    if (!this.userId) {
      console.warn(
        "Cannot push tasks to Supabase: user not authenticated. Tasks will remain in local storage."
      );
      return;
    }

    try {
      // Преобразуем задачи в формат Supabase
      const supabaseTasks = tasks.map((task) =>
        this.mapTaskToSupabaseRow(task)
      );

      // Используем upsert для обновления или создания записей
      const { error } = await this.client.from("tasks").upsert(supabaseTasks, {
        onConflict: "id",
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(`Ошибка отправки задач: ${error.message}`);
      }
    } catch (error) {
      console.error("Error pushing tasks to Supabase:", error);
      throw error;
    }
  }

  async pullTasks(lastSyncTimestamp?: Date): Promise<Task[]> {
    if (!this.userId) {
      return [];
    }

    try {
      let query = this.client
        .from("tasks")
        .select("*")
        .eq("user_id", this.userId)
        .order("updated_at", { ascending: false });

      // Если есть время последней синхронизации, получаем только новые изменения
      if (lastSyncTimestamp) {
        query = query.gte(
          "updated_at",
          SupabaseUtils.toISOString(lastSyncTimestamp)
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Ошибка получения задач: ${error.message}`);
      }

      // Преобразуем данные Supabase в доменные объекты
      return (data || []).map((row) => this.mapSupabaseRowToTask(row));
    } catch (error) {
      console.error("Error pulling tasks from Supabase:", error);
      throw error;
    }
  }

  async resolveConflict(localTask: Task, remoteTask: Task): Promise<Task> {
    // Стратегия: последнее изменение побеждает
    if (localTask.updatedAt > remoteTask.updatedAt) {
      return localTask;
    } else if (remoteTask.updatedAt > localTask.updatedAt) {
      return remoteTask;
    } else {
      // Если время одинаковое, предпочитаем локальную версию
      return localTask;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      return await SupabaseUtils.checkConnection(this.client);
    } catch {
      return false;
    }
  }

  async getLastSyncTimestamp(): Promise<Date | null> {
    if (!this.userId) {
      return null;
    }

    try {
      const { data, error } = await this.client
        .from("sync_metadata")
        .select("last_sync_at")
        .eq("user_id", this.userId)
        .eq("device_id", this.deviceId);

      if (error || !data || data.length === 0) {
        return null;
      }

      return SupabaseUtils.fromISOString(data[0].last_sync_at);
    } catch {
      return null;
    }
  }

  async setLastSyncTimestamp(timestamp: Date): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      await this.updateSyncMetadata(timestamp);
    } catch (error) {
      console.error("Error setting last sync timestamp:", error);
    }
  }

  /**
   * Получает локальные задачи, измененные после указанного времени
   */
  private async getLocalTasksModifiedAfter(timestamp?: Date): Promise<Task[]> {
    const allTasks = await this.taskRepository.findAll();

    if (!timestamp) {
      return allTasks;
    }

    return allTasks.filter((task) => task.updatedAt > timestamp);
  }

  /**
   * Разрешает конфликты и объединяет локальные и удаленные задачи
   */
  private async resolveConflictsAndMerge(
    localTasks: Task[],
    remoteTasks: Task[]
  ): Promise<{ resolvedTasks: Task[]; conflicts: number }> {
    const resolvedTasks: Task[] = [];
    let conflicts = 0;

    // Создаем карту локальных задач для быстрого поиска
    const localTasksMap = new Map(
      localTasks.map((task) => [task.id.value, task])
    );

    // Обрабатываем удаленные задачи
    for (const remoteTask of remoteTasks) {
      const localTask = localTasksMap.get(remoteTask.id.value);

      if (localTask) {
        // Есть конфликт - разрешаем его
        const resolvedTask = await this.resolveConflict(localTask, remoteTask);
        resolvedTasks.push(resolvedTask);
        conflicts++;

        // Удаляем из карты, чтобы не обрабатывать повторно
        localTasksMap.delete(remoteTask.id.value);
      } else {
        // Новая задача с сервера
        resolvedTasks.push(remoteTask);
      }
    }

    // Добавляем оставшиеся локальные задачи (которых нет на сервере)
    resolvedTasks.push(...localTasksMap.values());

    return { resolvedTasks, conflicts };
  }

  /**
   * Обновляет метаданные синхронизации
   */
  private async updateSyncMetadata(timestamp: Date): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      const { error } = await this.client.from("sync_metadata").upsert(
        {
          user_id: this.userId,
          device_id: this.deviceId,
          last_sync_at: SupabaseUtils.toISOString(timestamp),
          updated_at: SupabaseUtils.toISOString(new Date()),
        },
        {
          onConflict: "user_id,device_id",
        }
      );

      if (error) {
        console.error("Error updating sync metadata:", error);
      }
    } catch (error) {
      console.error("Error updating sync metadata:", error);
    }
  }

  /**
   * Преобразует доменную модель Task в строку таблицы Supabase
   * Всегда использует текущий user_id для обеспечения корректной синхронизации
   */
  private mapTaskToSupabaseRow(
    task: Task
  ): Database["public"]["Tables"]["tasks"]["Insert"] {
    if (!this.userId) {
      throw new Error("Cannot sync task to Supabase: user not authenticated");
    }

    return {
      id: task.id.value,
      title: task.title.value,
      category: task.category,
      status: task.status,
      order: task.order,
      created_at: SupabaseUtils.toISOString(task.createdAt),
      updated_at: SupabaseUtils.toISOString(task.updatedAt),
      deleted_at: task.deletedAt
        ? SupabaseUtils.toISOString(task.deletedAt)
        : null,
      inbox_entered_at: task.inboxEnteredAt
        ? SupabaseUtils.toISOString(task.inboxEnteredAt)
        : null,
      deferred_until: task.deferredUntil
        ? SupabaseUtils.toISOString(task.deferredUntil)
        : null,
      original_category: task.originalCategory || null,
      image_thumbhash: task.imageThumbhash || null,
      user_id: this.userId, // Всегда используем текущий user_id
    };
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
      row.original_category as TaskCategory | undefined,
      row.image_thumbhash || undefined
    );
  }

  async syncDailySelectionEntries(
    lastSyncTimestamp?: Date
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
    };

    try {
      if (!this.userId) {
        this.userId = await SupabaseUtils.getUserId(this.client);
        if (!this.userId) {
          result.error = {
            code: "AUTH_ERROR",
            message: "Пользователь не авторизован",
          };
          return result;
        }
      }

      // 1. Получаем изменения с сервера
      const remoteEntries =
        await this.pullDailySelectionEntries(lastSyncTimestamp);
      result.pulledCount = remoteEntries.length;

      // 2. Получаем локальные записи, измененные после последней синхронизации
      const localEntries =
        await this.getLocalDailySelectionEntriesModifiedAfter(
          lastSyncTimestamp
        );

      // 3. Сохраняем удаленные записи локально с разрешением конфликтов
      if (remoteEntries.length > 0) {
        await this.mergeDailySelectionEntries(remoteEntries);
      }

      // 4. Отправляем локальные изменения на сервер (только если есть локальные изменения)
      if (localEntries.length > 0) {
        await this.pushDailySelectionEntries(localEntries);
      }
      result.pushedCount = localEntries.length;

      result.success = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка синхронизации daily selection entries";
      result.error = {
        code: "SYNC_ERROR",
        message: errorMessage,
        details: error,
      };
    }

    return result;
  }

  async syncTaskLogs(lastSyncTimestamp?: Date): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      conflictsResolved: 0,
    };

    try {
      if (!this.userId) {
        this.userId = await SupabaseUtils.getUserId(this.client);
        if (!this.userId) {
          result.error = {
            code: "AUTH_ERROR",
            message: "Пользователь не авторизован",
          };
          return result;
        }
      }

      // 1. Получаем изменения с сервера
      const remoteLogs = await this.pullTaskLogs(lastSyncTimestamp);
      result.pulledCount = remoteLogs.length;

      // 2. Получаем локальные логи, измененные после последней синхронизации
      const localLogs =
        await this.getLocalTaskLogsModifiedAfter(lastSyncTimestamp);

      // 3. Сохраняем удаленные логи локально
      if (remoteLogs.length > 0) {
        await this.db.transaction("rw", this.db.taskLogs, async () => {
          for (const log of remoteLogs) {
            await this.db.taskLogs.put(log);
          }
        });
      }

      // 4. Отправляем локальные изменения на сервер (только если есть локальные изменения)
      if (localLogs.length > 0) {
        await this.pushTaskLogs(localLogs);
      }
      result.pushedCount = localLogs.length;

      result.success = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка синхронизации task logs";
      result.error = {
        code: "SYNC_ERROR",
        message: errorMessage,
        details: error,
      };
    }

    return result;
  }

  private async pullDailySelectionEntries(
    lastSyncTimestamp?: Date
  ): Promise<DailySelectionEntryRecord[]> {
    if (!this.userId) {
      return [];
    }

    try {
      let query = this.client
        .from("daily_selection_entries")
        .select("*")
        .eq("user_id", this.userId)
        .order("updated_at", { ascending: false }); // Используем updated_at для получения всех изменений

      if (lastSyncTimestamp) {
        query = query.gte(
          "updated_at",
          SupabaseUtils.toISOString(lastSyncTimestamp)
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Ошибка получения daily selection entries: ${error.message}`
        );
      }

      return (data || []).map((row) => ({
        id: row.id,
        date: row.date,
        taskId: row.task_id,
        completedFlag: row.completed_flag,
        createdAt: SupabaseUtils.fromISOString(row.created_at),
        updatedAt: row.updated_at
          ? SupabaseUtils.fromISOString(row.updated_at)
          : SupabaseUtils.fromISOString(row.created_at), // Fallback to created_at
        deletedAt: row.deleted_at
          ? SupabaseUtils.fromISOString(row.deleted_at)
          : undefined,
      }));
    } catch (error) {
      console.error(
        "Error pulling daily selection entries from Supabase:",
        error
      );
      throw error;
    }
  }

  private async pullTaskLogs(
    lastSyncTimestamp?: Date
  ): Promise<TaskLogRecord[]> {
    if (!this.userId) {
      return [];
    }

    try {
      let query = this.client
        .from("task_logs")
        .select("*")
        .eq("user_id", this.userId)
        .order("timestamp", { ascending: false });

      if (lastSyncTimestamp) {
        query = query.gte(
          "timestamp",
          SupabaseUtils.toISOString(lastSyncTimestamp)
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Ошибка получения task logs: ${error.message}`);
      }

      return (data || []).map((row) => ({
        id: row.id,
        taskId: row.task_id || undefined,
        type: row.action as "SYSTEM" | "USER" | "CONFLICT",
        message: row.details?.message || row.action,
        metadata: row.details || undefined,
        createdAt: SupabaseUtils.fromISOString(row.timestamp),
      }));
    } catch (error) {
      console.error("Error pulling task logs from Supabase:", error);
      throw error;
    }
  }

  private async pushDailySelectionEntries(
    entries: DailySelectionEntryRecord[]
  ): Promise<void> {
    if (entries.length === 0 || !this.userId) {
      return;
    }

    try {
      const supabaseEntries = entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        task_id: entry.taskId,
        completed_flag: entry.completedFlag,
        created_at: SupabaseUtils.toISOString(entry.createdAt),
        updated_at: SupabaseUtils.toISOString(
          entry.updatedAt || entry.createdAt
        ),
        deleted_at: entry.deletedAt
          ? SupabaseUtils.toISOString(entry.deletedAt)
          : null,
        user_id: this.userId!,
      }));

      const { error } = await this.client
        .from("daily_selection_entries")
        .upsert(supabaseEntries, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

      console.log(supabaseEntries, error);

      if (error) {
        throw new Error(
          `Ошибка отправки daily selection entries: ${error.message}`
        );
      }
    } catch (error) {
      console.error(
        "Error pushing daily selection entries to Supabase:",
        error
      );
      throw error;
    }
  }

  private async pushTaskLogs(logs: TaskLogRecord[]): Promise<void> {
    if (logs.length === 0 || !this.userId) {
      return;
    }

    try {
      const supabaseLogs = logs.map((log) => ({
        id: log.id,
        task_id: log.taskId || null,
        action: log.type,
        details: {
          message: log.message,
          ...log.metadata,
        },
        timestamp: SupabaseUtils.toISOString(log.createdAt),
        user_id: this.userId!,
      }));

      const { error } = await this.client
        .from("task_logs")
        .upsert(supabaseLogs, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

      if (error) {
        throw new Error(`Ошибка отправки task logs: ${error.message}`);
      }
    } catch (error) {
      console.error("Error pushing task logs to Supabase:", error);
      throw error;
    }
  }

  private async getLocalDailySelectionEntriesModifiedAfter(
    timestamp?: Date
  ): Promise<DailySelectionEntryRecord[]> {
    const allEntries = await this.db.dailySelectionEntries.toArray();

    if (!timestamp) {
      return allEntries;
    }

    return allEntries.filter(
      (entry) =>
        entry.updatedAt > timestamp ||
        (entry.createdAt > timestamp && !entry.updatedAt) // Fallback for old records
    );
  }

  private async getLocalTaskLogsModifiedAfter(
    timestamp?: Date
  ): Promise<TaskLogRecord[]> {
    const allLogs = await this.db.taskLogs.toArray();

    if (!timestamp) {
      return allLogs;
    }

    return allLogs.filter((log) => log.createdAt > timestamp);
  }

  /**
   * Merge remote daily selection entries with local ones, resolving conflicts
   */
  private async mergeDailySelectionEntries(
    remoteEntries: DailySelectionEntryRecord[]
  ): Promise<void> {
    await this.db.transaction("rw", this.db.dailySelectionEntries, async () => {
      for (const remoteEntry of remoteEntries) {
        // Найти существующую запись по составному ключу [date+taskId]
        const existingEntry = await this.db.dailySelectionEntries
          .where("[date+taskId]")
          .equals([remoteEntry.date, remoteEntry.taskId])
          .first();

        if (!existingEntry) {
          // Новая запись - просто добавляем
          await this.db.dailySelectionEntries.add(remoteEntry);
        } else {
          // Конфликт - разрешаем по времени обновления
          // Более новая запись побеждает
          const remoteUpdatedAt =
            remoteEntry.updatedAt || remoteEntry.createdAt;
          const localUpdatedAt =
            existingEntry.updatedAt || existingEntry.createdAt;

          if (remoteUpdatedAt > localUpdatedAt) {
            // Удаленная запись новее - обновляем локальную
            await this.db.dailySelectionEntries.update(existingEntry.id, {
              id: remoteEntry.id, // Обновляем ID на удаленный
              completedFlag: remoteEntry.completedFlag,
              deletedAt: remoteEntry.deletedAt,
              createdAt: remoteEntry.createdAt,
              updatedAt: remoteEntry.updatedAt || remoteEntry.createdAt,
            });
          } else if (remoteUpdatedAt < localUpdatedAt) {
            // Локальная запись новее - ничего не делаем, но синхронизируем ID если нужно
            if (existingEntry.id !== remoteEntry.id) {
              // Если ID разные, используем удаленный ID для консистентности
              await this.db.dailySelectionEntries.update(existingEntry.id, {
                id: remoteEntry.id,
              });
            }
          } else {
            // Одинаковое время обновления - используем удаленную версию для консистентности
            await this.db.dailySelectionEntries.update(existingEntry.id, {
              id: remoteEntry.id,
              completedFlag: remoteEntry.completedFlag,
              deletedAt: remoteEntry.deletedAt,
              updatedAt: remoteEntry.updatedAt || remoteEntry.createdAt,
            });
          }
        }
      }
    });
  }
}
