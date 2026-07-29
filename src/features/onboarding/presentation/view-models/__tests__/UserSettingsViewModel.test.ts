import { describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../../../shared/domain/Result";
import { createUserSettingsViewModel } from "../UserSettingsViewModel";

describe("UserSettingsViewModel boundaries", () => {
  it("routes start-of-day to workspace settings and keeps UI settings local", async () => {
    const updateUserSettings = vi.fn();
    const updateWorkspace = vi
      .fn()
      .mockResolvedValue(ResultUtils.ok(undefined));
    const store = createUserSettingsViewModel({
      localSettings: {
        initializeDefaults: vi.fn(),
        getUserSettings: vi.fn().mockResolvedValue({
          inboxOverdueDays: 3,
          keyboardShortcutsEnabled: true,
          startOfDayTime: "legacy",
        }),
        updateUserSettings,
        setInboxOverdueDays: vi.fn(),
        setKeyboardShortcutsEnabled: vi.fn(),
        resetToDefaults: vi.fn(),
      },
      updateWorkspaceSettings: { execute: updateWorkspace },
      getWorkspaceStartOfDay: vi.fn().mockResolvedValue("06:00"),
    });

    await store.getState().loadSettings();
    await store.getState().updateSettings({
      startOfDayTime: "07:00",
      keyboardShortcutsEnabled: false,
    });

    expect(updateWorkspace).toHaveBeenCalledWith({ startOfDay: "07:00" });
    expect(updateUserSettings).toHaveBeenCalledWith({
      keyboardShortcutsEnabled: false,
    });
  });
});
