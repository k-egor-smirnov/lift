import { container } from 'tsyringe';
import { SupabaseClientFactory } from '../database/SupabaseClient';
import { SupabaseSyncRepository } from '../repositories/SupabaseSyncRepository';
import { SyncService } from '../../application/services/SyncService';
import { DebouncedSyncService } from '../../application/services/DebouncedSyncService';
import { SupabaseRealtimeService } from '../services/SupabaseRealtimeService';
import { getSupabaseConfig, validateSupabaseConfig } from '../config/supabase.config';
import * as tokens from './tokens';

/**
 * Настройка DI контейнера для компонентов синхронизации
 */
export function configureSyncContainer(): void {
  try {
    // Получаем и валидируем конфигурацию
    const config = getSupabaseConfig();
    validateSupabaseConfig(config);

    // Регистрируем SupabaseClientFactory как singleton
    container.registerSingleton(
      tokens.SUPABASE_CLIENT_FACTORY_TOKEN,
      SupabaseClientFactory
    );

    // Инициализируем фабрику с конфигурацией
    const clientFactory = container.resolve<SupabaseClientFactory>(tokens.SUPABASE_CLIENT_FACTORY_TOKEN);
    clientFactory.initialize(config.environment);

    // Регистрируем SyncRepository
    container.registerSingleton(
      tokens.SYNC_REPOSITORY_TOKEN,
      SupabaseSyncRepository
    );

    // Регистрируем SyncService
    container.registerSingleton(
      tokens.SYNC_SERVICE_TOKEN,
      SyncService
    );

    // Регистрируем DebouncedSyncService
    container.registerSingleton(
      tokens.DEBOUNCED_SYNC_SERVICE_TOKEN,
      DebouncedSyncService
    );

    // Регистрируем SupabaseRealtimeService
    container.registerSingleton(
      tokens.SUPABASE_REALTIME_SERVICE_TOKEN,
      SupabaseRealtimeService
    );

    console.log('Sync container configured successfully');
  } catch (error) {
    console.error('Failed to configure sync container:', error);
    throw error;
  }
}

/**
 * Получает сервис синхронизации из контейнера
 */
export function getSyncService(): SyncService {
  return container.resolve<SyncService>(tokens.SYNC_SERVICE_TOKEN);
}

/**
 * Получает сервис real-time из контейнера
 */
export function getRealtimeService(): SupabaseRealtimeService {
  return container.resolve<SupabaseRealtimeService>(tokens.SUPABASE_REALTIME_SERVICE_TOKEN);
}

/**
 * Получает сервис дебаунсированной синхронизации из контейнера
 */
export function getDebouncedSyncService(): DebouncedSyncService {
  return container.resolve<DebouncedSyncService>(tokens.DEBOUNCED_SYNC_SERVICE_TOKEN);
}

/**
 * Получает репозиторий синхронизации из контейнера
 */
export function getSyncRepository(): SupabaseSyncRepository {
  return container.resolve<SupabaseSyncRepository>(tokens.SYNC_REPOSITORY_TOKEN);
}

/**
 * Очищает регистрации синхронизации из контейнера
 */
export function clearSyncContainer(): void {
  container.clearInstances();
}