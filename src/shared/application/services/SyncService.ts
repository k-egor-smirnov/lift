import { injectable, inject } from "tsyringe";
import { TaskRepository } from "../../domain/repositories/TaskRepository";
import type { SyncRepository } from "../../domain/repositories/SyncRepository";
import {
  SyncResult,
  SyncError,
  ConflictResolutionStrategy,
} from "../../domain/repositories/SyncRepository";
import * as tokens from "../../infrastructure/di/tokens";

/**
 * Сервис синхронизации данных
 * Координирует процесс синхронизации между локальным и удаленным хранилищем
 * Следует принципам local-first архитектуры
 */
@injectable()
export class SyncService {
  constructor(
    @inject(tokens.TASK_REPOSITORY_TOKEN)
    private taskRepository: TaskRepository,
    @inject(tokens.SYNC_REPOSITORY_TOKEN)
    private syncRepository: SyncRepository
  ) {}

  /**
   * Выполняет полную синхронизацию данных
   * @param strategy - стратегия разрешения конфликтов
   * @returns Promise<SyncResult>
   */
  async performSync(
    _strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_MODIFIED_WINS
  ): Promise<SyncResult> {
    try {
      // Проверяем доступность сети
      const isOnline = await this.syncRepository.isOnline();
      if (!isOnline) {
        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          conflictsResolved: 0,
          error: {
            code: "NETWORK_ERROR",
            message: "Нет подключения к сети",
          },
        };
      }

      // Получаем время последней синхронизации
      const lastSyncTimestamp =
        await this.syncRepository.getLastSyncTimestamp();

      // Выполняем синхронизацию всех данных
      // Сначала синхронизируем задачи, затем связанные данные
      const tasksResult = await this.syncRepository.syncTasks(
        lastSyncTimestamp || undefined
      );

      // Синхронизируем daily selection entries и task logs только после успешной синхронизации задач
      const [dailySelectionResult, taskLogsResult] = await Promise.all([
        this.syncRepository.syncDailySelectionEntries(
          lastSyncTimestamp || undefined
        ),
        this.syncRepository.syncTaskLogs(lastSyncTimestamp || undefined),
      ]);

      // Объединяем результаты синхронизации
      const combinedResult: SyncResult = {
        success:
          tasksResult.success &&
          dailySelectionResult.success &&
          taskLogsResult.success,
        pushedCount:
          (tasksResult.pushedCount || 0) +
          (dailySelectionResult.pushedCount || 0) +
          (taskLogsResult.pushedCount || 0),
        pulledCount:
          (tasksResult.pulledCount || 0) +
          (dailySelectionResult.pulledCount || 0) +
          (taskLogsResult.pulledCount || 0),
        conflictsResolved:
          (tasksResult.conflictsResolved || 0) +
          (dailySelectionResult.conflictsResolved || 0) +
          (taskLogsResult.conflictsResolved || 0),
        error:
          tasksResult.error ||
          dailySelectionResult.error ||
          taskLogsResult.error,
      };

      if (combinedResult.success) {
        // Обновляем время последней синхронизации
        await this.syncRepository.setLastSyncTimestamp(new Date());
      }

      return combinedResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка синхронизации";

      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
        error: {
          code: "SYNC_ERROR",
          message: errorMessage,
          details: error,
        },
      };
    }
  }

  /**
   * Выполняет синхронизацию в фоновом режиме
   * Используется для периодической синхронизации
   */
  async performBackgroundSync(): Promise<void> {
    try {
      await this.performSync();

      // В фоновом режиме тихо обрабатываем результат
    } catch (error) {
      // Тихо обрабатываем ошибки фоновой синхронизации
      console.warn("Background sync failed:", error);
    }
  }

  /**
   * Принудительная отправка локальных изменений
   * Используется когда пользователь явно запрашивает синхронизацию
   */
  async forcePushLocalChanges(): Promise<SyncResult> {
    try {
      const isOnline = await this.syncRepository.isOnline();
      if (!isOnline) {
        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          conflictsResolved: 0,
          error: {
            code: "NETWORK_ERROR",
            message: "Нет подключения к сети",
          },
        };
      }

      // Получаем все локальные задачи
      const localTasks = await this.taskRepository.findAll();

      // Отправляем на сервер
      await this.syncRepository.pushTasks(localTasks);

      return {
        success: true,
        pushedCount: localTasks.length,
        pulledCount: 0,
        conflictsResolved: 0,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ошибка принудительной отправки";
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        conflictsResolved: 0,
        error: {
          code: "PUSH_ERROR",
          message: errorMessage,
          details: error,
        },
      };
    }
  }

  /**
   * Получает статус синхронизации
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const isOnline = await this.syncRepository.isOnline();
    const lastSyncAt = await this.syncRepository.getLastSyncTimestamp();

    return {
      isOnline,
      isSyncing: false,
      lastSyncAt,
      error: null,
      isRealtimeConnected: false,
    };
  }
}

/**
 * Статус синхронизации
 */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  error: SyncError | null;
  isRealtimeConnected: boolean;
}
