import { UserSettingsRepository } from "../../../../shared/domain/repositories/UserSettingsRepository";

/**
 * User settings keys
 */
export const USER_SETTINGS_KEYS = {
  INBOX_OVERDUE_DAYS: "inboxOverdueDays",
  KEYBOARD_SHORTCUTS_ENABLED: "keyboardShortcutsEnabled",
  START_OF_DAY_TIME: "startOfDayTime",
} as const;

/**
 * Default user settings
 */
export const DEFAULT_USER_SETTINGS = {
  [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 3,
  [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: true, // Default enabled on desktop, will be overridden on mobile
  [USER_SETTINGS_KEYS.START_OF_DAY_TIME]: "09:00",
} as const;

/**
 * User settings interface
 */
export interface UserSettings {
  inboxOverdueDays: number;
  keyboardShortcutsEnabled: boolean;
  startOfDayTime: string;
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
      startOfDayTime:
        settings[USER_SETTINGS_KEYS.START_OF_DAY_TIME] ??
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
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

    if (settings.startOfDayTime !== undefined) {
      if (!this.isValidTime(settings.startOfDayTime)) {
        throw new Error("Start of day time must be in HH:MM format");
      }
      settingsToUpdate[USER_SETTINGS_KEYS.START_OF_DAY_TIME] =
        settings.startOfDayTime;
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
   * Get start of day time setting
   */
  async getStartOfDayTime(): Promise<string> {
    const value = await this.userSettingsRepository.get<string>(
      USER_SETTINGS_KEYS.START_OF_DAY_TIME
    );
    return value ?? DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME];
  }

  /**
   * Set start of day time setting
   */
  async setStartOfDayTime(time: string): Promise<void> {
    if (!this.isValidTime(time)) {
      throw new Error("Start of day time must be in HH:MM format");
    }
    await this.userSettingsRepository.set(
      USER_SETTINGS_KEYS.START_OF_DAY_TIME,
      time
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
      [USER_SETTINGS_KEYS.START_OF_DAY_TIME]:
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
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

    if (!(USER_SETTINGS_KEYS.START_OF_DAY_TIME in existingSettings)) {
      settingsToSet[USER_SETTINGS_KEYS.START_OF_DAY_TIME] =
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME];
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

  private isValidTime(time: string): boolean {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
  }
}
