import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  UserSettingsService,
  USER_SETTINGS_KEYS,
  DEFAULT_USER_SETTINGS,
} from "../UserSettingsService";
import { UserSettingsRepository } from "../../../../../shared/domain/repositories/UserSettingsRepository";

// Mock repository
const mockUserSettingsRepository: jest.Mocked<UserSettingsRepository> = {
  get: vi.fn(),
  set: vi.fn(),
  getMany: vi.fn(),
  setMany: vi.fn(),
  has: vi.fn(),
  remove: vi.fn(),
  getAll: vi.fn(),
  clear: vi.fn(),
};

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
        startOfDayTime:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
      });
    });

    it("should return existing settings when they exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]: "08:30",
      });

      const result = await userSettingsService.getUserSettings();

      expect(result).toEqual({
        inboxOverdueDays: 5,
        keyboardShortcutsEnabled: false,
        startOfDayTime: "08:30",
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
        startOfDayTime:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
      });
    });
  });

  describe("updateUserSettings", () => {
    it("should update multiple settings", async () => {
      await userSettingsService.updateUserSettings({
        inboxOverdueDays: 5,
        keyboardShortcutsEnabled: false,
        startOfDayTime: "07:45",
      });

      expect(mockUserSettingsRepository.setMany).toHaveBeenCalledWith({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]: "07:45",
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

  describe("getStartOfDayTime", () => {
    it("should return stored value when it exists", async () => {
      mockUserSettingsRepository.get.mockResolvedValue("08:15");

      const result = await userSettingsService.getStartOfDayTime();

      expect(result).toBe("08:15");
      expect(mockUserSettingsRepository.get).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.START_OF_DAY_TIME
      );
    });

    it("should return default value when no value is stored", async () => {
      mockUserSettingsRepository.get.mockResolvedValue(null);

      const result = await userSettingsService.getStartOfDayTime();

      expect(result).toBe(
        DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME]
      );
    });
  });

  describe("setStartOfDayTime", () => {
    it("should set valid start of day time", async () => {
      await userSettingsService.setStartOfDayTime("10:30");

      expect(mockUserSettingsRepository.set).toHaveBeenCalledWith(
        USER_SETTINGS_KEYS.START_OF_DAY_TIME,
        "10:30"
      );
    });

    it("should throw error for invalid start of day time", async () => {
      await expect(
        userSettingsService.setStartOfDayTime("99:99")
      ).rejects.toThrow("Start of day time must be in HH:MM format");
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
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
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
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
      });
    });

    it("should not set any defaults when all settings exist", async () => {
      mockUserSettingsRepository.getAll.mockResolvedValue({
        [USER_SETTINGS_KEYS.INBOX_OVERDUE_DAYS]: 5,
        [USER_SETTINGS_KEYS.KEYBOARD_SHORTCUTS_ENABLED]: false,
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]: "09:00",
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
        [USER_SETTINGS_KEYS.START_OF_DAY_TIME]:
          DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
      });
    });
  });
});
