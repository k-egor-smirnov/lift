import { configureSyncContainer, getSyncService, getRealtimeService } from '../di/syncContainer';
import { SyncService } from '../../application/services/SyncService';
import { SupabaseRealtimeService } from '../services/SupabaseRealtimeService';
import { getSupabaseConfig } from '../config/supabase.config';

/**
 * Класс для инициализации и управления синхронизацией
 * Предоставляет единую точку входа для настройки sync компонентов
 */
export class SyncInitializer {
  private static instance: SyncInitializer | null = null;
  private syncService: SyncService | null = null;
  private realtimeService: SupabaseRealtimeService | null = null;
  private isInitialized = false;
  private autoSyncInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  /**
   * Получает singleton экземпляр инициализатора
   */
  static getInstance(): SyncInitializer {
    if (!SyncInitializer.instance) {
      SyncInitializer.instance = new SyncInitializer();
    }
    return SyncInitializer.instance;
  }

  /**
   * Инициализирует систему синхронизации
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Sync already initialized');
      return;
    }

    try {
      console.log('Initializing sync system...');

      // Проверяем конфигурацию
      const config = getSupabaseConfig();
      if (!config.environment.url || !config.environment.anonKey) {
        console.warn('Supabase configuration not found, sync disabled');
        return;
      }

      // DI контейнер уже настроен в di/index.ts
      // configureSyncContainer(); // Убираем дублирование

      // Получаем сервисы
      this.syncService = getSyncService();
      this.realtimeService = getRealtimeService();

      // Выполняем первоначальную синхронизацию
      await this.performInitialSync();

      // Настраиваем автоматическую синхронизацию
      if (config.sync.autoSyncInterval > 0) {
        this.setupAutoSync(config.sync.autoSyncInterval);
      }

      // Включаем real-time подписки
      if (config.sync.enableRealtime) {
        await this.enableRealtime();
      }

      this.isInitialized = true;
      console.log('Sync system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize sync system:', error);
      throw error;
    }
  }

  /**
   * Выполняет первоначальную синхронизацию
   */
  private async performInitialSync(): Promise<void> {
    if (!this.syncService) return;

    try {
      console.log('Performing initial sync...');
      const result = await this.syncService.performSync();
      
      if (result.success) {
        console.log(`Initial sync completed: pushed ${result.pushedCount}, pulled ${result.pulledCount}`);
      } else {
        console.warn('Initial sync failed:', result.error);
      }
    } catch (error) {
      console.error('Initial sync error:', error);
      // Не прерываем инициализацию из-за ошибки синхронизации
    }
  }

  /**
   * Настраивает автоматическую синхронизацию
   */
  private setupAutoSync(interval: number): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    this.autoSyncInterval = setInterval(async () => {
      if (this.syncService && navigator.onLine) {
        try {
          await this.syncService.performBackgroundSync();
        } catch (error) {
          console.error('Auto sync error:', error);
        }
      }
    }, interval);

    console.log(`Auto sync enabled with interval: ${interval}ms`);
  }

  /**
   * Включает real-time подписки
   */
  private async enableRealtime(): Promise<void> {
    if (!this.realtimeService) return;

    try {
      await this.realtimeService.subscribeToTaskChanges();
      console.log('Real-time subscriptions enabled');
    } catch (error) {
      console.error('Failed to enable real-time:', error);
    }
  }

  /**
   * Выполняет ручную синхронизацию
   */
  async manualSync(): Promise<boolean> {
    if (!this.syncService) {
      console.warn('Sync service not initialized');
      return false;
    }

    try {
      const result = await this.syncService.performSync();
      return result.success;
    } catch (error) {
      console.error('Manual sync error:', error);
      return false;
    }
  }

  /**
   * Принудительно отправляет локальные изменения
   */
  async forcePushChanges(): Promise<boolean> {
    if (!this.syncService) {
      console.warn('Sync service not initialized');
      return false;
    }

    try {
      const result = await this.syncService.forcePushLocalChanges();
      return result.success;
    } catch (error) {
      console.error('Force push error:', error);
      return false;
    }
  }

  /**
   * Получает статус синхронизации
   */
  async getSyncStatus() {
    if (!this.syncService) {
      return {
        isInitialized: false,
        isOnline: navigator.onLine,
        lastSyncAt: null,
        error: null,
        isRealtimeConnected: false
      };
    }

    try {
      const syncStatus = await this.syncService.getSyncStatus();
      const isRealtimeConnected = this.realtimeService?.isConnected() || false;

      return {
        isInitialized: this.isInitialized,
        isOnline: navigator.onLine,
        lastSyncAt: syncStatus.lastSyncAt,
        error: syncStatus.error,
        isRealtimeConnected
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        isInitialized: this.isInitialized,
        isOnline: navigator.onLine,
        lastSyncAt: null,
        error: { code: 'STATUS_ERROR', message: 'Ошибка получения статуса', details: error },
        isRealtimeConnected: false
      };
    }
  }

  /**
   * Останавливает синхронизацию
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down sync system...');

    // Останавливаем автосинхронизацию
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }

    // Отключаем real-time подписки
    if (this.realtimeService) {
      try {
        await this.realtimeService.unsubscribeFromTaskChanges();
      } catch (error) {
        console.error('Error unsubscribing from real-time:', error);
      }
    }

    this.isInitialized = false;
    this.syncService = null;
    this.realtimeService = null;

    console.log('Sync system shut down');
  }

  /**
   * Перезапускает систему синхронизации
   */
  async restart(): Promise<void> {
    await this.shutdown();
    await this.initialize();
  }

  /**
   * Проверяет, инициализирована ли система синхронизации
   */
  isReady(): boolean {
    return this.isInitialized && this.syncService !== null;
  }

  /**
   * Включает/выключает автоматическую синхронизацию
   */
  setAutoSyncEnabled(enabled: boolean): void {
    if (enabled) {
      const config = getSupabaseConfig();
      this.setupAutoSync(config.sync.autoSyncInterval);
    } else {
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
    }
  }

  /**
   * Включает/выключает real-time подписки
   */
  async setRealtimeEnabled(enabled: boolean): Promise<void> {
    if (!this.realtimeService) return;

    try {
      if (enabled) {
        await this.realtimeService.subscribeToTaskChanges();
      } else {
        await this.realtimeService.unsubscribeFromTaskChanges();
      }
    } catch (error) {
      console.error('Error toggling real-time:', error);
    }
  }
}

// Экспортируем singleton экземпляр
export const syncInitializer = SyncInitializer.getInstance();