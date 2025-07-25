import { create } from 'zustand';
import { OnboardingService, DailyModalData } from '../../application/services/OnboardingService';
import { UserSettingsService } from '../../application/services/UserSettingsService';
import { TaskRepositoryImpl } from '../../../../shared/infrastructure/repositories/TaskRepositoryImpl';
import { DailySelectionRepositoryImpl } from '../../../../shared/infrastructure/repositories/DailySelectionRepositoryImpl';
import { UserSettingsRepositoryImpl } from '../../../../shared/infrastructure/repositories/UserSettingsRepositoryImpl';
import { todoDatabase } from '../../../../shared/infrastructure/database/TodoDatabase';
import { container, tokens } from '../../../../shared/infrastructure/di';
import { LogService } from '../../../../shared/application/services/LogService';

/**
 * State for the onboarding view model
 */
interface OnboardingState {
  // Daily modal state
  dailyModalData: DailyModalData | null;
  isModalVisible: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Modal shown tracking
  modalShownToday: boolean;
  currentDay: string; // Track current day to detect day transitions
  
  // Actions
  loadDailyModalData: (overdueDays?: number) => Promise<void>;
  showDailyModal: () => void;
  hideDailyModal: () => void;
  markModalShownToday: () => void;
  checkShouldShowModal: (overdueDays?: number) => Promise<boolean>;
  checkDayTransition: () => boolean;
  resetForNewDay: () => void;
  reset: () => void;
  returnTaskToToday: (taskId: string) => Promise<void>;
}

/**
 * Create onboarding service instance
 */
const createOnboardingService = () => {
  const taskRepository = new TaskRepositoryImpl(todoDatabase);
  const dailySelectionRepository = new DailySelectionRepositoryImpl(todoDatabase);
  const userSettingsRepository = new UserSettingsRepositoryImpl(todoDatabase);
  const logService = container.resolve<LogService>(tokens.LOG_SERVICE_TOKEN);
  const userSettingsService = new UserSettingsService(userSettingsRepository);
  return new OnboardingService(taskRepository, dailySelectionRepository, logService, userSettingsService);
};

/**
 * Zustand store for onboarding functionality
 */
export const useOnboardingViewModel = create<OnboardingState>((set, get) => {
  const onboardingService = createOnboardingService();
  
  // Check if modal was already shown today (using localStorage)
  const getModalShownKey = () => {
    const today = new Date().toISOString().split('T')[0];
    return `dailyModal_shown_${today}`;
  };
  
  const wasModalShownToday = () => {
    return localStorage.getItem(getModalShownKey()) === 'true';
  };
  
  const markModalAsShown = () => {
    localStorage.setItem(getModalShownKey(), 'true');
  };

  return {
    // Initial state
    dailyModalData: null,
    isModalVisible: false,
    isLoading: false,
    error: null,
    modalShownToday: wasModalShownToday(),
    currentDay: new Date().toISOString().split('T')[0], // Initialize with current day

    // Load daily modal data
    loadDailyModalData: async (overdueDays?: number) => {
      set({ isLoading: true, error: null });
      
      try {
        const data = await onboardingService.aggregateDailyModalData(overdueDays);
        set({ 
          dailyModalData: data, 
          isLoading: false 
        });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Failed to load daily modal data',
          isLoading: false 
        });
      }
    },

    // Show the daily modal
    showDailyModal: () => {
      set({ isModalVisible: true });
    },

    // Hide the daily modal and mark as shown
    hideDailyModal: () => {
      set({ isModalVisible: false, modalShownToday: true });
      markModalAsShown();
    },

    // Mark modal as shown for today
    markModalShownToday: () => {
      set({ modalShownToday: true });
      markModalAsShown();
    },

    // Check if modal should be shown
    checkShouldShowModal: async (overdueDays?: number) => {
      const state = get();
      
      // Don't show if already shown today
      if (state.modalShownToday) {
        return false;
      }
      
      try {
        const shouldShow = await onboardingService.shouldShowDailyModal(overdueDays);
        return shouldShow;
      } catch (error) {
        console.error('Error checking if modal should show:', error);
        return false;
      }
    },

    // Check if day has transitioned
    checkDayTransition: () => {
      const state = get();
      const today = new Date().toISOString().split('T')[0];
      
      if (state.currentDay !== today) {
        // Day has changed, reset for new day
        get().resetForNewDay();
        return true;
      }
      
      return false;
    },

    // Reset state for new day
    resetForNewDay: () => {
      const today = new Date().toISOString().split('T')[0];
      set({
        modalShownToday: false,
        currentDay: today,
        dailyModalData: null,
        isModalVisible: false,
        error: null
      });
    },

    // Reset state
    reset: () => {
      const today = new Date().toISOString().split('T')[0];
      set({
        dailyModalData: null,
        isModalVisible: false,
        isLoading: false,
        error: null,
        modalShownToday: wasModalShownToday(),
        currentDay: today
      });
    },

    // Return task to today's selection
    returnTaskToToday: async (taskId: string) => {
      try {
        const dailySelectionService = onboardingService.getDailySelectionService();
        await dailySelectionService.addTaskToToday(taskId);
        
        // Refresh modal data to reflect changes
        const state = get();
        if (state.dailyModalData) {
          await get().loadDailyModalData();
        }
      } catch (error) {
        console.error('Error returning task to today:', error);
        set({ 
          error: error instanceof Error ? error.message : 'Failed to return task to today'
        });
      }
    }
  };
});