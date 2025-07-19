import { useEffect } from 'react';
import { keyboardShortcutService, KeyboardShortcut } from './KeyboardShortcutService';
import { useUserSettingsViewModel } from '../../../features/onboarding/presentation/view-models/UserSettingsViewModel';

/**
 * Hook for managing keyboard shortcuts with user settings integration
 */
export const useKeyboardShortcuts = () => {
  const { settings, loadSettings } = useUserSettingsViewModel();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update keyboard shortcuts enabled state based on user settings
  useEffect(() => {
    if (settings) {
      keyboardShortcutService.setEnabled(settings.keyboardShortcutsEnabled);
    }
  }, [settings?.keyboardShortcutsEnabled]);

  /**
   * Register a keyboard shortcut
   */
  const registerShortcut = (id: string, shortcut: KeyboardShortcut) => {
    keyboardShortcutService.register(id, shortcut);
  };

  /**
   * Unregister a keyboard shortcut
   */
  const unregisterShortcut = (id: string) => {
    keyboardShortcutService.unregister(id);
  };

  /**
   * Check if shortcuts are enabled
   */
  const isEnabled = keyboardShortcutService.getEnabled();

  return {
    registerShortcut,
    unregisterShortcut,
    isEnabled,
    settings
  };
};