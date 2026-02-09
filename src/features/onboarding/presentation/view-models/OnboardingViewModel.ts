import { create } from "zustand";
import {
  OnboardingService,
  DailyModalData,
} from "../../application/services/OnboardingService";
import { UserSettingsService } from "../../application/services/UserSettingsService";
import { UserSettingsRepositoryImpl } from "../../../../shared/infrastructure/repositories/UserSettingsRepositoryImpl";
import { todoDatabase } from "../../../../shared/infrastructure/database/TodoDatabase";
import { container, tokens } from "../../../../shared/infrastructure/di";
import { TaskLogService } from "../../../../shared/application/services/TaskLogService";
import { GetTaskLogsUseCase } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../../../../shared/application/use-cases/CreateUserLogUseCase";
import { TaskRepository } from "../../../../shared/domain/repositories/TaskRepository";
import { DailySelectionRepository } from "../../../../shared/domain/repositories/DailySelectionRepository";
import { taskEventBus } from "../../../../shared/infrastructure/events/TaskEventBus";
import { TaskEventType } from "../../../../shared/domain/events/TaskEvent";
import { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

/**
 * State for the onboarding view model
 */
interface OnboardingState {
  // Daily modal state
  dailyModalData: DailyModalData | null;
  isModalVisible: boolean;
  isLoading: boolean;
  error: string | null;
  todayTaskIds: string[]; // IDs of tasks currently selected for today

  // Modal shown tracking
  modalShownToday: boolean;
  currentDay: string; // Track current day to detect day transitions

  // Actions
  loadDailyModalData: (overdueDays?: number) => Promise<void>;
  showDailyModal: () => void;
  hideDailyModal: () => void;
  markModalShownToday: () => void;
  checkShouldShowModal: (
    overdueDays?: number,
    options?: { log?: boolean }
  ) => Promise<boolean>;
  checkDayTransition: () => boolean;
  resetForNewDay: (preserveModalData?: boolean) => void;
  reset: () => void;
  returnTaskToToday: (taskId: string) => Promise<void>;
  toggleTaskToday: (taskId: string) => Promise<void>;
  loadTodayTaskIds: () => Promise<void>;
}

/**
 * Create onboarding service instance using DI container
 */
const createOnboardingService = () => {
  // Use the same repository instances from DI container
  const taskRepository = container.resolve<TaskRepository>(
    tokens.TASK_REPOSITORY_TOKEN
  );
  const dailySelectionRepository = container.resolve<DailySelectionRepository>(
    tokens.DAILY_SELECTION_REPOSITORY_TOKEN
  );
  // Create TaskLogService manually to avoid circular dependency
  const getTaskLogsUseCase = container.resolve<GetTaskLogsUseCase>(
    tokens.GET_TASK_LOGS_USE_CASE_TOKEN
  );
  const createUserLogUseCase = container.resolve<CreateUserLogUseCase>(
    tokens.CREATE_USER_LOG_USE_CASE_TOKEN
  );
  const logService = new TaskLogService(
    getTaskLogsUseCase,
    createUserLogUseCase
  );

  // UserSettings repository is not in DI container, create manually
  const userSettingsRepository = new UserSettingsRepositoryImpl(todoDatabase);
  const userSettingsService = new UserSettingsService(userSettingsRepository);

  return new OnboardingService(
    taskRepository,
    dailySelectionRepository,
    logService,
    userSettingsService
  );
};

/**
 * Zustand store for onboarding functionality
 */
export const useOnboardingViewModel = create<OnboardingState>((set, get) => {
  const onboardingService = createOnboardingService();

  // Subscribe to task events for automatic updates
  taskEventBus.subscribe(TaskEventType.TASK_ADDED_TO_TODAY, () => {
    get().loadTodayTaskIds();
  });

  taskEventBus.subscribe(TaskEventType.TASK_REMOVED_FROM_TODAY, () => {
    get().loadTodayTaskIds();
  });

  // Check if modal was already shown today (using localStorage)
  const getModalShownKey = () => {
    const today = DateOnly.today().value;
    return `dailyModal_shown_${today}`;
  };

  const wasModalShownToday = () => {
    return localStorage.getItem(getModalShownKey()) === "true";
  };

  const markModalAsShown = () => {
    localStorage.setItem(getModalShownKey(), "true");
  };

  return {
    // Initial state
    dailyModalData: null,
    isModalVisible: false,
    isLoading: false,
    error: null,
    todayTaskIds: [],
    modalShownToday: wasModalShownToday(),
    currentDay: DateOnly.today().value, // Initialize with current day

    // Load daily modal data
    loadDailyModalData: async (overdueDays?: number) => {
      set({ isLoading: true, error: null });

      try {
        const data =
          await onboardingService.aggregateDailyModalData(overdueDays);
        set({
          dailyModalData: data,
          isLoading: false,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load daily modal data",
          isLoading: false,
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
    checkShouldShowModal: async (
      overdueDays?: number,
      options?: { log?: boolean }
    ) => {
      const state = get();

      // Don't show if already shown today
      if (state.modalShownToday) {
        return false;
      }

      try {
        const shouldShow = await onboardingService.shouldShowDailyModal(
          overdueDays,
          options
        );
        return shouldShow;
      } catch (error) {
        console.error("Error checking if modal should show:", error);
        return false;
      }
    },

    // Check if day has transitioned
    checkDayTransition: () => {
      const state = get();
      const today = DateOnly.today().value;

      if (state.currentDay !== today) {
        // Day has changed, reset for new day but preserve modal data if modal is visible
        get().resetForNewDay(state.isModalVisible);
        return true;
      }

      return false;
    },

    // Reset state for new day
    resetForNewDay: (preserveModalData = false) => {
      const state = get();
      set({
        modalShownToday: false,
        currentDay: DateOnly.today().value,
        // Preserve modal data and visibility if modal is currently shown
        // This ensures that if user left app open over weekend, they can still see Friday's tasks on Monday
        dailyModalData: preserveModalData ? state.dailyModalData : null,
        isModalVisible: preserveModalData ? state.isModalVisible : false,
        error: null,
        todayTaskIds: [],
      });
    },

    // Reset state
    reset: () => {
      set({
        dailyModalData: null,
        isModalVisible: false,
        isLoading: false,
        error: null,
        modalShownToday: false,
        currentDay: DateOnly.today().value,
        todayTaskIds: [],
      });
    },

    // Return task to today's selection
    returnTaskToToday: async (taskId: string) => {
      try {
        const dailySelectionService =
          onboardingService.getDailySelectionService();
        await dailySelectionService.addTaskToToday(taskId);

        // Only refresh today task IDs to reflect changes
        // Don't reload modal data to prevent motivational message from changing
        await get().loadTodayTaskIds();
      } catch (error) {
        console.error("Error returning task to today:", error);
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to return task to today",
        });
      }
    },

    // Toggle task in today's selection
    toggleTaskToday: async (taskId: string) => {
      try {
        const dailySelectionService =
          onboardingService.getDailySelectionService();
        const state = get();

        if (state.todayTaskIds.includes(taskId)) {
          // Task is already in today's list, remove it
          await dailySelectionService.removeTaskFromToday(taskId);
        } else {
          // Task is not in today's list, add it
          await dailySelectionService.addTaskToToday(taskId);
        }

        // Refresh today task IDs to reflect changes
        await get().loadTodayTaskIds();
      } catch (error) {
        console.error("Error toggling task in today:", error);
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to toggle task in today",
        });
      }
    },

    // Load today's task IDs
    loadTodayTaskIds: async () => {
      try {
        const dailySelectionService =
          onboardingService.getDailySelectionService();
        const todayTasks = await dailySelectionService.getTodayTasks();
        const taskIds = todayTasks.map((task) => task.id.value);
        set({ todayTaskIds: taskIds });
      } catch (error) {
        console.error("Error loading today task IDs:", error);
      }
    },
  };
});
