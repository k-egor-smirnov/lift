/**
 * Конфигурация для Supabase
 * Содержит настройки подключения и параметры синхронизации
 */

export interface SupabaseEnvironmentConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface SyncConfig {
  /** Интервал автоматической синхронизации в миллисекундах */
  autoSyncInterval: number;
  /** Максимальное количество попыток синхронизации */
  maxRetryAttempts: number;
  /** Задержка между попытками синхронизации в миллисекундах */
  retryDelay: number;
  /** Размер батча для синхронизации задач */
  batchSize: number;
  /** Таймаут для операций синхронизации в миллисекундах */
  syncTimeout: number;
  /** Включить real-time подписки */
  enableRealtime: boolean;
  /** Интервал проверки подключения в миллисекундах */
  connectionCheckInterval: number;
}

export interface SupabaseConfig {
  environment: SupabaseEnvironmentConfig;
  sync: SyncConfig;
  /** Включить режим отладки */
  debug: boolean;
}

/**
 * Получает конфигурацию Supabase из переменных окружения
 */
export function getSupabaseConfig(): SupabaseConfig {
  // Получаем переменные окружения
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const debug = import.meta.env.VITE_DEBUG === "true";

  // Проверяем обязательные переменные
  if (!url || !anonKey) {
    throw new Error(
      "Отсутствуют обязательные переменные окружения для Supabase. " +
        "Убедитесь, что VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY установлены."
    );
  }

  return {
    environment: {
      url,
      anonKey,
      serviceRoleKey,
    },
    sync: {
      autoSyncInterval: 5 * 60 * 1000, // 5 минут
      maxRetryAttempts: 3,
      retryDelay: 2000, // 2 секунды
      batchSize: 50,
      syncTimeout: 30000, // 30 секунд
      enableRealtime: true,
      connectionCheckInterval: 30000, // 30 секунд
    },
    debug,
  };
}

/**
 * Валидирует конфигурацию Supabase
 */
export function validateSupabaseConfig(config: SupabaseConfig): void {
  const { environment, sync } = config;

  // Проверяем URL
  if (!environment.url || !isValidUrl(environment.url)) {
    throw new Error("Некорректный URL Supabase");
  }

  // Проверяем ключи
  if (!environment.anonKey || environment.anonKey.length < 10) {
    throw new Error("Некорректный anon key для Supabase");
  }

  // Проверяем параметры синхронизации
  if (sync.autoSyncInterval < 60000) {
    // Минимум 1 минута
    throw new Error("Интервал автосинхронизации не может быть меньше 1 минуты");
  }

  if (sync.maxRetryAttempts < 1 || sync.maxRetryAttempts > 10) {
    throw new Error("Количество попыток должно быть от 1 до 10");
  }

  if (sync.retryDelay < 1000) {
    // Минимум 1 секунда
    throw new Error("Задержка между попытками не может быть меньше 1 секунды");
  }

  if (sync.batchSize < 1 || sync.batchSize > 1000) {
    throw new Error("Размер батча должен быть от 1 до 1000");
  }

  if (sync.syncTimeout < 5000) {
    // Минимум 5 секунд
    throw new Error("Таймаут синхронизации не может быть меньше 5 секунд");
  }
}

/**
 * Проверяет, является ли строка валидным URL
 */
function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Получает конфигурацию для разработки
 */
export function getDevelopmentConfig(): SupabaseConfig {
  return {
    environment: {
      url: "http://localhost:54321",
      anonKey: "your-anon-key-here",
    },
    sync: {
      autoSyncInterval: 2 * 60 * 1000, // 2 минуты для разработки
      maxRetryAttempts: 2,
      retryDelay: 1000,
      batchSize: 10,
      syncTimeout: 10000,
      enableRealtime: true,
      connectionCheckInterval: 15000,
    },
    debug: true,
  };
}

/**
 * Получает конфигурацию для продакшена
 */
export function getProductionConfig(): SupabaseConfig {
  return {
    environment: {
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      serviceRoleKey: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    },
    sync: {
      autoSyncInterval: 10 * 60 * 1000, // 10 минут
      maxRetryAttempts: 5,
      retryDelay: 3000,
      batchSize: 100,
      syncTimeout: 60000,
      enableRealtime: true,
      connectionCheckInterval: 60000,
    },
    debug: false,
  };
}
