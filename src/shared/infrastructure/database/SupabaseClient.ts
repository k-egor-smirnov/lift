import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { injectable } from 'tsyringe';

/**
 * Типы для базы данных Supabase
 */
export interface Database {
  public: {
    Tables: {
      tasks: {
        Row: {
          id: string;
          title: string;
          category: string;
          status: string;
          order: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          inbox_entered_at: string | null;
          deferred_until: string | null;
          original_category: string | null;
          user_id: string;
        };
        Insert: {
          id: string;
          title: string;
          category: string;
          status: string;
          order: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          inbox_entered_at?: string | null;
          deferred_until?: string | null;
          original_category?: string | null;
          user_id: string;
        };
        Update: {
          id?: string;
          title?: string;
          category?: string;
          status?: string;
          order?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          inbox_entered_at?: string | null;
          deferred_until?: string | null;
          original_category?: string | null;
          user_id?: string;
        };
      };
      daily_selection_entries: {
        Row: {
          id: number;
          date: string;
          task_id: string;
          completed_flag: boolean;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: number;
          date: string;
          task_id: string;
          completed_flag: boolean;
          created_at?: string;
          user_id: string;
        };
        Update: {
          id?: number;
          date?: string;
          task_id?: string;
          completed_flag?: boolean;
          created_at?: string;
          user_id?: string;
        };
      };
      task_logs: {
        Row: {
          id: string;
          task_id: string | null;
          action: string;
          details: any | null;
          timestamp: string;
          user_id: string;
          device_id: string | null;
          sync_version: number;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          action: string;
          details?: any | null;
          timestamp?: string;
          user_id: string;
          device_id?: string | null;
          sync_version?: number;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          action?: string;
          details?: any | null;
          timestamp?: string;
          user_id?: string;
          device_id?: string | null;
          sync_version?: number;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          settings: any;
          created_at: string;
          updated_at: string;
          device_id: string | null;
          sync_version: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          settings?: any;
          created_at?: string;
          updated_at?: string;
          device_id?: string | null;
          sync_version?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          settings?: any;
          created_at?: string;
          updated_at?: string;
          device_id?: string | null;
          sync_version?: number;
        };
      };
      sync_metadata: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          last_sync_at: string;
          sync_token: string | null;
          metadata: any | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          last_sync_at?: string;
          sync_token?: string | null;
          metadata?: any | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          last_sync_at?: string;
          sync_token?: string | null;
          metadata?: any | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

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
          'X-Client-Info': 'daily-todo-pwa',
        },
      },
    });
  }

  /**
   * Получение экземпляра клиента
   */
  getClient(): SupabaseClient<Database> {
    if (!this.client) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
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
      const { error } = await client.from('tasks').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Получение ID пользователя
   */
  static async getUserId(client: SupabaseClient): Promise<string | null> {
    const { data: { user } } = await client.auth.getUser();
    return user?.id || null;
  }

  /**
   * Генерация уникального ID устройства
   */
  static generateDeviceId(): string {
    // Используем комбинацию userAgent и случайного числа
    const userAgent = navigator.userAgent;
    const random = Math.random().toString(36).substring(2);
    const timestamp = Date.now().toString(36);
    
    return btoa(`${userAgent}-${random}-${timestamp}`).substring(0, 32);
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