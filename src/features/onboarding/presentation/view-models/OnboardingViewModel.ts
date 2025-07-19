import { create } from 'zustand';
import { OnboardingService, DailyModalData } from '../../application/services/OnboardingService';
import { UserSettingsService } from '../../application/services/UserSettingsService';
import { TaskRepositoryImpl } from '../../../../shared/infrastructure/repositories/TaskRepositoryImpl';
import { DailySelectionRepositoryImpl } from '../../../../shared/infrastructure/repositories/DailySelectionRepositoryImpl';
import { UserSettingsRepositoryImpl } from '../../../../shared/infrastructure/repositories/UserSettingsRepositoryImpl';
import { todoDatabase } from '../../../../shared/infrastructure/database/TodoDatabase';

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
  
  // Actions
  loadDailyModalData: (overdueDays?: number) => Promise<void>;
  showDailyModal: () => void;
  hideDailyModal: () => void;
  markModalShownToday: () => void;
  checkShouldShowModal: (overdueDays?: number) => Promise<boolean>;
  reset: () => void;
}

/**
 * Create onboarding service instance
 */
const createOnboardingService = () => {
  const taskRepository = new TaskRepositoryImpl(todoDatabase);
  const dailySelectionRepository = new DailySelectionRepositoryImpl(todoDatabase);
  const userSettingsRepository = new UserSettingsRepositoryImpl(todoDatabase);
  const userSettingsService = new UserSettingsService(userSettingsRepository);
  return new OnboardingService(taskRepository, dailySelectionRepository, userSettingsService);
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

    // Reset state
    reset: () => {
      set({
        dailyModalData: null,
        isModalVisible: false,
        isLoading: false,
        error: null,
        modalShownToday: wasModalShownToday()
      });
    }
  };
});