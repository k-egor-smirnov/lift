import { create } from "zustand";

import type { UpdateWorkspaceSettingsUseCase } from "../../../settings/application/use-cases/UpdateWorkspaceSettingsUseCase";
import {
  DEFAULT_USER_SETTINGS,
  USER_SETTINGS_KEYS,
  type UserSettings,
  type UserSettingsService,
} from "../../application/services/UserSettingsService";

type LocalSettings = Pick<
  UserSettingsService,
  | "initializeDefaults"
  | "getUserSettings"
  | "updateUserSettings"
  | "setInboxOverdueDays"
  | "setKeyboardShortcutsEnabled"
  | "resetToDefaults"
>;

export interface UserSettingsViewModelDependencies {
  readonly localSettings: LocalSettings;
  readonly updateWorkspaceSettings: Pick<
    UpdateWorkspaceSettingsUseCase,
    "execute"
  >;
  readonly getWorkspaceStartOfDay: () => Promise<string>;
}

export interface UserSettingsState {
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  initialize: (dependencies: UserSettingsViewModelDependencies) => void;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  setInboxOverdueDays: (days: number) => Promise<void>;
  setKeyboardShortcutsEnabled: (enabled: boolean) => Promise<void>;
  setStartOfDayTime: (time: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  clearError: () => void;
}

export const createUserSettingsViewModel = (
  initialDependencies?: UserSettingsViewModelDependencies
) => {
  let dependencies = initialDependencies;
  const requireDependencies = (): UserSettingsViewModelDependencies => {
    if (dependencies === undefined) {
      throw new Error("UserSettingsViewModel has not been initialized");
    }
    return dependencies;
  };

  return create<UserSettingsState>((set, get) => ({
    settings: null,
    isLoading: false,
    error: null,
    initialized: initialDependencies !== undefined,

    initialize: (nextDependencies) => {
      dependencies = nextDependencies;
      set({ initialized: true, error: null });
    },

    loadSettings: async () => {
      set({ isLoading: true, error: null });
      try {
        const current = requireDependencies();
        await current.localSettings.initializeDefaults();
        const [local, startOfDayTime] = await Promise.all([
          current.localSettings.getUserSettings(),
          current.getWorkspaceStartOfDay(),
        ]);
        set({ settings: { ...local, startOfDayTime }, isLoading: false });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to load settings",
          isLoading: false,
        });
      }
    },

    updateSettings: async (patch) => {
      const settings = get().settings;
      if (settings === null) {
        set({ error: "Settings not loaded" });
        return;
      }
      set({ isLoading: true, error: null });
      try {
        const current = requireDependencies();
        const { startOfDayTime, ...localPatch } = patch;
        if (Object.keys(localPatch).length > 0) {
          await current.localSettings.updateUserSettings(localPatch);
        }
        if (startOfDayTime !== undefined) {
          const result = await current.updateWorkspaceSettings.execute({
            startOfDay: startOfDayTime,
          });
          if (!result.success) throw result.error;
        }
        set({ settings: { ...settings, ...patch }, isLoading: false });
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to update settings",
          isLoading: false,
        });
      }
    },

    setInboxOverdueDays: async (days) => {
      await get().updateSettings({ inboxOverdueDays: days });
    },

    setKeyboardShortcutsEnabled: async (enabled) => {
      await get().updateSettings({ keyboardShortcutsEnabled: enabled });
    },

    setStartOfDayTime: async (time) => {
      await get().updateSettings({ startOfDayTime: time });
    },

    resetToDefaults: async () => {
      set({ isLoading: true, error: null });
      try {
        const current = requireDependencies();
        await current.localSettings.resetToDefaults();
        const result = await current.updateWorkspaceSettings.execute({
          startOfDay:
            DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
        });
        if (!result.success) throw result.error;
        const local = await current.localSettings.getUserSettings();
        set({
          settings: {
            ...local,
            startOfDayTime:
              DEFAULT_USER_SETTINGS[USER_SETTINGS_KEYS.START_OF_DAY_TIME],
          },
          isLoading: false,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to reset settings",
          isLoading: false,
        });
      }
    },

    clearError: () => set({ error: null }),
  }));
};

/** Initialized by the Task 10 composition root. */
export const useUserSettingsViewModel = createUserSettingsViewModel();
