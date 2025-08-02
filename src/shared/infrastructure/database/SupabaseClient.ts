import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { injectable } from "tsyringe";
import { Database } from "./supabase-types";

// Экспортируем типы из автогенерированного файла
export type { Database } from "./supabase-types";

/**
 * Конфигурация Supabase клиента
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enableRealtime?: boolean;
  enableAuth?: boolean;
}

/**
 * Фабрика для создания Supabase клиента
 * Инкапсулирует конфигурацию и создание клиента
 */
@injectable()
export class SupabaseClientFactory {
  private client: SupabaseClient<Database> | null = null;
  private config: SupabaseConfig | null = null;

  /**
   * Инициализация клиента с конфигурацией
   */
  initialize(config: SupabaseConfig): void {
    this.config = config;
    this.client = createClient<Database>(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: config.enableAuth ?? true,
        persistSession: config.enableAuth ?? true,
        detectSessionInUrl: false, // Отключаем для PWA
      },
      realtime: {
        params: {
          eventsPerSecond: 10, // Ограничиваем частоту событий
        },
      },
      global: {
        headers: {
          "X-Client-Info": "daily-todo-pwa",
        },
      },
    });
  }

  /**
   * Получение экземпляра клиента
   */
  getClient(): SupabaseClient<Database> {
    if (!this.client) {
      throw new Error(
        "Supabase client not initialized. Call initialize() first."
      );
    }
    return this.client;
  }

  /**
   * Проверка инициализации
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Получение конфигурации
   */
  getConfig(): SupabaseConfig | null {
    return this.config;
  }

  /**
   * Создание клиента для тестирования
   */
  createTestClient(config: SupabaseConfig): SupabaseClient<Database> {
    return createClient<Database>(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 1,
        },
      },
    });
  }
}

/**
 * Утилиты для работы с Supabase
 */
export class SupabaseUtils {
  /**
   * Проверка доступности Supabase
   */
  static async checkConnection(client: SupabaseClient): Promise<boolean> {
    try {
      const { error } = await client.from("tasks").select("id").limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Получение ID пользователя
   */
  static async getUserId(client: SupabaseClient): Promise<string | null> {
    const {
      data: { user },
    } = await client.auth.getUser();
    return user?.id || null;
  }

  /**
   * Генерация уникального ID устройства
   */
  static generateDeviceId(): string {
    return crypto.randomUUID();
  }

  static getDeviceId(): string {
    if (!("localStorage" in window)) {
      throw new Error("LocalStorage is not supported");
    }

    const deviceId = localStorage.getItem("lift-deviceId");
    if (deviceId) {
      return deviceId;
    }
    const newDeviceId = this.generateDeviceId();
    localStorage.setItem("lift-deviceId", newDeviceId);
    return newDeviceId;
  }

  /**
   * Преобразование даты в ISO строку для Supabase
   */
  static toISOString(date: Date): string {
    return date.toISOString();
  }

  /**
   * Преобразование ISO строки в Date
   */
  static fromISOString(isoString: string): Date {
    return new Date(isoString);
  }
}
