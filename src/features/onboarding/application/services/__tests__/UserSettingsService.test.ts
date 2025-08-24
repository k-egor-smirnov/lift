import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  UserSettingsService,
  USER_SETTINGS_KEYS,
  DEFAULT_USER_SETTINGS,
} from "../UserSettingsService";
import { createMockUserSettingsRepository } from "../../../../../test/utils/mockFactories";

// Mock repository
const mockUserSettingsRepository = createMockUserSettingsRepository();

describe("UserSettingsService", () => {
  let userSettingsService: UserSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    userSettingsService = new UserSettingsService(mockUserSettingsRepository);
  });

  describe("getUserSettings", () => {
    it("should return settings with defaults when no settings exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({});

      const result = await userSettingsService.getUserSettings();

      expect(result).toEqual({
        inboxOverdueDays:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS],
        keyboardShortcutsEnabled: true, // Default for non-mobile
        llmSettings: DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
      });
    });

    it("should return existing settings when they exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
        [USER_SETTINGS_KEYS.LLM_SETTINGS]: {
          enabled: true,
          apiUrl: "https://custom.api.com",
          apiKey: "test-key",
          model: "gpt-4",
          maxTokens: 2000,
          temperature: 0.5,
        },
      });

      const result = await userSettingsService.getUserSettings();

      expect(result).toEqual({
        inboxOverdueDays: 5,
        keyboardShortcutsEnabled: false,
        llmSettings: {
          enabled: true,
          apiUrl: "https://custom.api.com",
          apiKey: "test-key",
          model: "gpt-4",
          maxTokens: 2000,
          temperature: 0.5,
        },
      });
    });

    it("should merge existing settings with defaults for missing values", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 7,
        // Missing keyboard shortcuts setting
      });

      const result = await userSettingsService.getUserSettings();

      expect(result).toEqual({
        inboxOverdueDays: 7,
        keyboardShortcutsEnabled: true, // Default
        llmSettings: DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
      });
    });
  });

  describe("updateUserSettings", () => {
    it("should update multiple settings", async () => {
      await userSettingsService.updateUserSettings({
        inboxOverdueDays: 5,
        keyboardShortcutsEnabled: false,
      });

      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
      });
    });

    it("should update only provided settings", async () => {
      await userSettingsService.updateUserSettings({
        inboxOverdueDays: 10,
      });

      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 10,
      });
    });
  });

  describe("getInboxOverdueDays", () => {
    it("should return stored value when it exists", async () => {
      mockUserSettingsRepository.get.mockResolvedValue(7);

      const result = await userSettingsService.getInboxOverdueDays();

      expect(result).toBe(7);
      expect(mockUserSettingsRepository.get).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS
      );
    });

    it("should return default value when no value is stored", async () => {
      mockUserSettingsRepository.get.mockResolvedValue(null);

      const result = await userSettingsService.getInboxOverdueDays();

      expect(result).toBe(
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]
      );
    });
  });

  describe("setInboxOverdueDays", () => {
    it("should set valid inbox overdue days", async () => {
      await userSettingsService.setInboxOverdueDays(5);

      expect(mockUserSettingsRepository.set).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS,
        5
      );
    });

    it("should throw error for invalid values (too low)", async () => {
      await expect(userSettingsService.setInboxOverdueDays(0)).rejects.toThrow(
        "Inbox overdue days must be between 1 and 30"
      );
    });

    it("should throw error for invalid values (too high)", async () => {
      await expect(userSettingsService.setInboxOverdueDays(31)).rejects.toThrow(
        "Inbox overdue days must be between 1 and 30"
      );
    });
  });

  describe("getKeyboardShortcutsEnabled", () => {
    it("should return stored value when it exists", async () => {
      mockUserSettingsRepository.get.mockResolvedValue(false);

      const result = await userSettingsService.getKeyboardShortcutsEnabled();

      expect(result).toBe(false);
      expect(mockUserSettingsRepository.get).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED
      );
    });

    it("should return default value when no value is stored", async () => {
      mockUserSettingsRepository.get.mockResolvedValue(null);

      const result = await userSettingsService.getKeyboardShortcutsEnabled();

      expect(result).toBe(true); // Default for non-mobile
    });
  });

  describe("setKeyboardShortcutsEnabled", () => {
    it("should set keyboard shortcuts enabled", async () => {
      await userSettingsService.setKeyboardShortcutsEnabled(false);

      expect(mockUserSettingsRepository.set).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED,
        false
      );
    });
  });

  describe("resetToDefaults", () => {
    it("should clear all settings and set defaults", async () => {
      await userSettingsService.resetToDefaults();

      expect(mockUserSettingsRepository.clear).toHaveBeenCalled();
      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS],
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: true, // Default for non-mobile
        [USER_SETTINGS_KEYS.LLM_SETTINGS]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
      });
    });
  });

  describe("initializeDefaults", () => {
    it("should set defaults for missing settings only", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        // Missing keyboard shortcuts setting
      });

      await userSettingsService.initializeDefaults();

      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: true,
        [USER_SETTINGS_KEYS.LLM_SETTINGS]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
      });
    });

    it("should not set any defaults when all settings exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
        [USER_SETTINGS_KEYS.LLM_SETTINGS]: {
          enabled: true,
          apiUrl: "https://custom.api.com",
          apiKey: "test-key",
          model: "gpt-4",
          maxTokens: 2000,
          temperature: 0.5,
        },
      });

      await userSettingsService.initializeDefaults();

      expect(mockUserSettingsRepository.setMany).not.toHaveBeenCalled();
    });

    it("should set all defaults when no settings exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({});

      await userSettingsService.initializeDefaults();

      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS],
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: true,
        [USER_SETTINGS_KEYS.LLM_SETTINGS]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.LLM_SETTINGS],
      });
    });
  });
});
