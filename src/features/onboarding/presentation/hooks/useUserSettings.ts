import { useEffect } from "react";
import { useUserSettingsViewModel } from "../view-models/UserSettingsViewModel";

/**
 * Hook to manage user settings
 * Automatically loads settings on mount
 */
export const useUserSettings = () => {
  const {
    settings,
    isLoading,
    error,
    loadSettings,
    updateSettings,
    setInboxOverdueDays,
    setKeyboardShortcutsEnabled,
    resetToDefaults,
    clearError,
  } = useUserSettingsViewModel();

  // Load settings on mount
  useEffect(() => {
    if (!settings && !isLoading) {
      loadSettings();
    }
  }, [settings, isLoading, loadSettings]);

  return {
    settings,
    isLoading,
    error,
    loadSettings,
    updateSettings,
    setInboxOverdueDays,
    setKeyboardShortcutsEnabled,
    resetToDefaults,
    clearError,
  };
};
