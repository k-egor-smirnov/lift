import { create } from 'zustand';
import { UserSettingsService } from '../../application/services/UserSettingsService';
import { UserSettingsRepositoryImpl } from '../../../../shared/infrastructure/repositories/UserSettingsRepositoryImpl';
import { TodoDatabase } from '../../../../shared/infrastructure/database/TodoDatabase';
import { container, tokens } from '../../../../shared/infrastructure/di';

/**
 * State for the user settings view model
 */
interface UserSettingsState {
  // Settings data
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  setInboxOverdueDays: (days: number) => Promise<void>;
  setKeyboardShortcutsEnabled: (enabled: boolean) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  clearError: () => void;
}

/**
 * Create user settings service instance
 */
const createUserSettingsService = () => {
  const database = container.resolve<TodoDatabase>(tokens.DATABASE_TOKEN);
const userSettingsRepository = new UserSettingsRepositoryImpl(database);
  return new UserSettingsService(userSettingsRepository);
};

/**
 * Zustand store for user settings functionality
 */
export const useUserSettingsViewModel = create<UserSettingsState>((set, get) => {
  const userSettingsService = createUserSettingsService();

  return {
    // Initial state
    settings: null,
    isLoading: false,
    error: null,

    // Load user settings
    loadSettings: async () => {
      set({ isLoading: true, error: null });
      
      try {
        // Initialize defaults first
        await userSettingsService.initializeDefaults();
        
        // Load settings
        const settings = await userSettingsService.getUserSettings();
        set({ 
          settings, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load settings',
          isLoading: false 
        });
      }
    },

    // Update user settings
    updateSettings: async (settingsUpdate: Partial<UserSettings>) => {
      const currentSettings = get().settings;
      if (!currentSettings) {
        set({ error: 'Settings not loaded' });
        return;
      }

      set({ isLoading: true, error: null });
      
      try {
        await userSettingsService.updateUserSettings(settingsUpdate);
        
        // Update local state
        const updatedSettings = { ...currentSettings, ...settingsUpdate };
        set({ 
          settings: updatedSettings, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to update settings',
          isLoading: false 
        });
      }
    },

    // Set inbox overdue days
    setInboxOverdueDays: async (days: number) => {
      const currentSettings = get().settings;
      if (!currentSettings) {
        set({ error: 'Settings not loaded' });
        return;
      }

      set({ isLoading: true, error: null });
      
      try {
        await userSettingsService.setInboxOverdueDays(days);
        
        // Update local state
        const updatedSettings = { ...currentSettings, inboxOverdueDays: days };
        set({ 
          settings: updatedSettings, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to update inbox overdue days',
          isLoading: false 
        });
      }
    },

    // Set keyboard shortcuts enabled
    setKeyboardShortcutsEnabled: async (enabled: boolean) => {
      const currentSettings = get().settings;
      if (!currentSettings) {
        set({ error: 'Settings not loaded' });
        return;
      }

      set({ isLoading: true, error: null });
      
      try {
        await userSettingsService.setKeyboardShortcutsEnabled(enabled);
        
        // Update local state
        const updatedSettings = { ...currentSettings, keyboardShortcutsEnabled: enabled };
        set({ 
          settings: updatedSettings, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to update keyboard shortcuts setting',
          isLoading: false 
        });
      }
    },

    // Reset to defaults
    resetToDefaults: async () => {
      set({ isLoading: true, error: null });
      
      try {
        await userSettingsService.resetToDefaults();
        
        // Reload settings
        const settings = await userSettingsService.getUserSettings();
        set({ 
          settings, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to reset settings',
          isLoading: false 
        });
      }
    },

    // Clear error
    clearError: () => {
      set({ error: null });
    }
  };
});