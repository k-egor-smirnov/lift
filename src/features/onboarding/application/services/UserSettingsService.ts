import { UserSettingsRepository } from "../../../../shared/domain/repositories/UserSettingsRepository";
import { LLMSettings } from "../../../../shared/domain/types/LLMSettings";

/**
 * User settings keys
 */
export const USER_SETTINGS_KEYS = {
  INBOX_OVERDUE_DAYS: "inboxOverdueDays",
  KEYBOARD_SHORTCUTS_ENABLED: "keyboardShortcutsEnabled",
  LLM_SETTINGS: "llmSettings",
} as const;

/**
 * Default user settings
 */
export const DEFAULT_USER_SETTINGS = {
  [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 3,
  [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: true, // Default enabled on desktop, will be overridden on mobile
  [USER_SETTINGS_KEYS.LLM_SETTINGS]: {
    enabled: false,
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-3.5-turbo",
    maxTokens: 1000,
    temperature: 0.7,
  } as LLMSettings,
} as const;

/**
 * User settings interface
 */
export interface UserSettings {
  inboxOverdueDays: number;
  keyboardShortcutsEnabled: boolean;
  llmSettings: LLMSettings;
}

/**
 * Service for managing user settings
 */
export class UserSettingsService {
  constructor(
    private readonly userSettingsRepository: UserSettingsRepository
  ) {}

  /**
   * Get all user settings with defaults
   */
  async getUserSettings(): Promise<UserSettings> {
    const settings = await this.userSettingsRepository.getAll();

    // Apply defaults for missing settings
    const result: UserSettings = {
      inboxOverdueDays:
        settings[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS] ??
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS],
      keyboardShortcutsEnabled:
        settings[USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED] ??
        this.getDefaultKeyboardShortcutsEnabled(),
      llmSettings:
        settings[USER_SETTINGS_KEYS.LLM_SETTINGS] ??
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
    };

    return result;
  }

  /**
   * Update user settings
   */
  async updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
    const settingsToUpdate: Record<string, any> = {};

    if (settings.inboxOverdueDays !== undefined) {
      settingsToUpdate[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS] =
        settings.inboxOverdueDays;
    }

    if (settings.keyboardShortcutsEnabled !== undefined) {
      settingsToUpdate[USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED] =
        settings.keyboardShortcutsEnabled;
    }

    if (settings.llmSettings !== undefined) {
      settingsToUpdate[USER_SETTINGS_KEYS.LLM_SETTINGS] = settings.llmSettings;
    }

    await this.userSettingsRepository.setMany(settingsToUpdate);
  }

  /**
   * Get inbox overdue days setting
   */
  async getInboxOverdueDays(): Promise<number> {
    const value = await this.userSettingsRepository.get<number>(
      USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS
    );
    return (
      value ?? DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]
    );
  }

  /**
   * Set inbox overdue days setting
   */
  async setInboxOverdueDays(days: number): Promise<void> {
    if (days < 1 || days > 30) {
      throw new Error("Inbox overdue days must be between 1 and 30");
    }
    await this.userSettingsRepository.set(
      USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS,
      days
    );
  }

  /**
   * Get keyboard shortcuts enabled setting
   */
  async getKeyboardShortcutsEnabled(): Promise<boolean> {
    const value = await this.userSettingsRepository.get<boolean>(
      USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED
    );
    return value ?? this.getDefaultKeyboardShortcutsEnabled();
  }

  /**
   * Set keyboard shortcuts enabled setting
   */
  async setKeyboardShortcutsEnabled(enabled: boolean): Promise<void> {
    await this.userSettingsRepository.set(
      USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED,
      enabled
    );
  }

  /**
   * Get LLM settings
   */
  async getLLMSettings(): Promise<LLMSettings> {
    const value = await this.userSettingsRepository.get<LLMSettings>(
      USER_SETTINGS_KEYS.LLM_SETTINGS
    );
    return value ?? DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS];
  }

  /**
   * Set LLM settings
   */
  async setLLMSettings(settings: LLMSettings): Promise<void> {
    await this.userSettingsRepository.set(
      USER_SETTINGS_KEYS.LLM_SETTINGS,
      settings
    );
  }

  /**
   * Reset all settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    await this.userSettingsRepository.clear();

    // Set defaults explicitly
    await this.userSettingsRepository.setMany({
      [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]:
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS],
      [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]:
        this.getDefaultKeyboardShortcutsEnabled(),
      [USER_SETTINGS_KEYS.LLM_SETTINGS]:
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
    });
  }

  /**
   * Initialize settings with defaults if they don't exist
   */
  async initializeDefaults(): Promise<void> {
    const existingSettings = await this.userSettingsRepository.getAll();
    const settingsToSet: Record<string, any> = {};

    // Only set defaults for missing settings
    if (!(USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS in existingSettings)) {
      settingsToSet[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS] =
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS];
    }

    if (!(USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED in existingSettings)) {
      settingsToSet[USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED] =
        this.getDefaultKeyboardShortcutsEnabled();
    }

    if (!(USER_SETTINGS_KEYS.LLM_SETTINGS in existingSettings)) {
      settingsToSet[USER_SETTINGS_KEYS.LLM_SETTINGS] =
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS];
    }

    if (Object.keys(settingsToSet).length > 0) {
      await this.userSettingsRepository.setMany(settingsToSet);
    }
  }

  /**
   * Get default keyboard shortcuts enabled based on device type
   */
  private getDefaultKeyboardShortcutsEnabled(): boolean {
    // Disable on mobile devices by default
    if (typeof window !== "undefined") {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      return !isMobile;
    }
    return true; // Default to enabled on server/unknown environments
  }
}
