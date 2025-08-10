import { Task } from "../entities/Task";

/**
 * Интерфейс для синхронизации данных с внешними источниками
 * Следует принципам local-first архитектуры
 */
export interface SyncRepository {
  /**
   * Синхронизация задач с удаленным хранилищем
   * @param lastSyncTimestamp - время последней синхронизации
   * @returns Promise<SyncResult>
   */
  syncTasks(lastSyncTimestamp?: Date): Promise<SyncResult>;

  /**
   * Синхронизация записей ежедневного выбора с удаленным хранилищем
   * @param lastSyncTimestamp - время последней синхронизации
   * @returns Promise<SyncResult>
   */
  syncDailySelectionEntries(lastSyncTimestamp?: Date): Promise<SyncResult>;

  /**
   * Синхронизация логов задач с удаленным хранилищем
   * @param lastSyncTimestamp - время последней синхронизации
   * @returns Promise<SyncResult>
   */
  syncTaskLogs(lastSyncTimestamp?: Date): Promise<SyncResult>;

  /**
   * Отправка локальных изменений на сервер
   * @param tasks - задачи для синхронизации
   */
  pushTasks(tasks: Task[]): Promise<void>;

  /**
   * Получение изменений с сервера
   * @param lastSyncTimestamp - время последней синхронизации
   */
  pullTasks(lastSyncTimestamp?: Date): Promise<Task[]>;

  /**
   * Разрешение конфликтов при синхронизации
   * @param localTask - локальная версия задачи
   * @param remoteTask - удаленная версия задачи
   */
  resolveConflict(localTask: Task, remoteTask: Task): Promise<Task>;

  /**
   * Проверка доступности удаленного хранилища
   */
  isOnline(): Promise<boolean>;

  /**
   * Получение времени последней синхронизации
   */
  getLastSyncTimestamp(): Promise<Date | null>;

  /**
   * Установка времени последней синхронизации
   */
  setLastSyncTimestamp(timestamp: Date): Promise<void>;
}

/**
 * Результат синхронизации
 */
export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  conflictsResolved: number;
  error?: SyncError;
}

/**
 * Ошибка синхронизации
 */
export interface SyncError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Стратегии разрешения конфликтов
 */
export enum ConflictResolutionStrategy {
  LOCAL_WINS = "local_wins",
  REMOTE_WINS = "remote_wins",
  LAST_MODIFIED_WINS = "last_modified_wins",
  MANUAL = "manual",
}
