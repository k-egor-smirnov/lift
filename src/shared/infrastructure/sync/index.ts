/**
 * Экспорты для системы синхронизации
 * Предоставляет единую точку входа для всех компонентов синхронизации
 */

// Основные сервисы
export { SyncService } from "../../application/services/SyncService";
export { DebouncedSyncService } from "../../application/services/DebouncedSyncService";
export { SupabaseRealtimeService } from "../services/SupabaseRealtimeService";

// Репозитории
export type { SyncRepository } from "../../domain/repositories/SyncRepository";
export { SupabaseSyncRepository } from "../repositories/SupabaseSyncRepository";

// Клиент и утилиты
export {
  SupabaseClientFactory,
  SupabaseUtils,
  type Database,
  type SupabaseConfig as SupabaseClientConfig,
} from "../database/SupabaseClient";

// Конфигурация
export {
  getSupabaseConfig,
  validateSupabaseConfig,
  getDevelopmentConfig,
  getProductionConfig,
  type SupabaseConfig,
  type SyncConfig,
  type SupabaseEnvironmentConfig,
} from "../config/supabase.config";

// DI контейнер
export {
  configureSyncContainer,
  getSyncService,
  getDebouncedSyncService,
  getRealtimeService,
  getSyncRepository,
  clearSyncContainer,
} from "../di/syncContainer";

// Инициализатор
export { SyncInitializer, syncInitializer } from "./SyncInitializer";

// React хуки
export {
  useSync,
  type SyncStatus,
  type UseSyncReturn,
} from "../../presentation/hooks/useSync";

// React компоненты
export {
  SyncStatusIndicator,
  default as SyncStatusIndicatorDefault,
} from "../../presentation/components/SyncStatusIndicator";

// P2P image synchronization service
export { P2PImageSyncService } from "./P2PImageSyncService";

// Типы
export type {
  SyncResult,
  SyncError,
  ConflictResolutionStrategy,
} from "../../domain/repositories/SyncRepository";

// Токены DI
export {
  SYNC_SERVICE_TOKEN,
  DEBOUNCED_SYNC_SERVICE_TOKEN,
  SUPABASE_REALTIME_SERVICE_TOKEN,
  SUPABASE_CLIENT_FACTORY_TOKEN,
  SYNC_REPOSITORY_TOKEN,
} from "../di/tokens";
