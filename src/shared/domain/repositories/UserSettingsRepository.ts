/**
 * User settings repository interface
 */
export interface UserSettingsRepository {
  /**
   * Get a setting value by key
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Set a setting value by key
   */
  set<T = any>(key: string, value: T): Promise<void>;

  /**
   * Get multiple settings by keys
   */
  getMany(keys: string[]): Promise<Record<string, any>>;

  /**
   * Set multiple settings at once
   */
  setMany(settings: Record<string, any>): Promise<void>;

  /**
   * Check if a setting exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove a setting by key
   */
  remove(key: string): Promise<void>;

  /**
   * Get all settings
   */
  getAll(): Promise<Record<string, any>>;

  /**
   * Clear all settings
   */
  clear(): Promise<void>;
}
