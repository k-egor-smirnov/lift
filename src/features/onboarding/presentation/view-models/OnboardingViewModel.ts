import { create } from "zustand";

import type { LocalPreferenceRepository } from "../../../settings/application/ports/LocalPreferenceRepository";
import type { DailyModalData } from "../../application/services/OnboardingService";

interface DailySelectionActions {
  addTaskToToday(taskId: string): Promise<void>;
  removeTaskFromToday(taskId: string): Promise<void>;
  getTodayTaskIds(): Promise<string[]>;
}

interface OnboardingQueries {
  aggregateDailyModalData(overdueDays?: number): Promise<DailyModalData>;
  shouldShowDailyModal(
    overdueDays?: number,
    options?: { log?: boolean }
  ): Promise<boolean>;
  getDailySelectionService(): DailySelectionActions;
}

export interface OnboardingViewModelDependencies {
  readonly workspaceId: string;
  readonly service: OnboardingQueries;
  readonly preferences: LocalPreferenceRepository;
  readonly effectiveDate: () => Promise<string>;
}

export interface OnboardingState {
  dailyModalData: DailyModalData | null;
  isModalVisible: boolean;
  isLoading: boolean;
  error: string | null;
  todayTaskIds: string[];
  modalShownToday: boolean;
  currentDay: string;
  isStartOfDayAvailable: boolean;
  initialized: boolean;

  initialize: (dependencies: OnboardingViewModelDependencies) => Promise<void>;
  loadDailyModalData: (overdueDays?: number) => Promise<void>;
  showDailyModal: () => void;
  hideDailyModal: () => void;
  markModalShownToday: () => void;
  checkShouldShowModal: (
    overdueDays?: number,
    options?: { log?: boolean }
  ) => Promise<boolean>;
  checkDayTransition: () => Promise<boolean>;
  resetForNewDay: (preserveModalData?: boolean, day?: string) => void;
  reset: () => void;
  returnTaskToToday: (taskId: string) => Promise<void>;
  toggleTaskToday: (taskId: string) => Promise<void>;
  loadTodayTaskIds: () => Promise<void>;
  refreshStartOfDayAvailability: () => Promise<void>;
  startStartOfDayAvailabilityMonitoring: () => void;
  stopStartOfDayAvailabilityMonitoring: () => void;
}

const acknowledgementKey = (day: string) => `daily-modal:${day}`;

export const createOnboardingViewModel = (
  initialDependencies?: OnboardingViewModelDependencies
) => {
  let dependencies = initialDependencies;
  let availabilityInterval: ReturnType<typeof setInterval> | null = null;

  const requireDependencies = (): OnboardingViewModelDependencies => {
    if (dependencies === undefined) {
      throw new Error("OnboardingViewModel has not been initialized");
    }
    return dependencies;
  };

  const wasAcknowledged = (day: string): boolean => {
    if (dependencies === undefined || day.length === 0) return false;
    return (
      dependencies.preferences.get(
        dependencies.workspaceId,
        acknowledgementKey(day)
      ) === "shown"
    );
  };

  return create<OnboardingState>((set, get) => ({
    dailyModalData: null,
    isModalVisible: false,
    isLoading: false,
    error: null,
    todayTaskIds: [],
    modalShownToday: false,
    currentDay: "",
    isStartOfDayAvailable: false,
    initialized: initialDependencies !== undefined,

    initialize: async (nextDependencies) => {
      dependencies = nextDependencies;
      const day = await nextDependencies.effectiveDate();
      set({
        initialized: true,
        currentDay: day,
        modalShownToday: wasAcknowledged(day),
        error: null,
      });
    },

    loadDailyModalData: async (overdueDays) => {
      set({ isLoading: true, error: null });
      try {
        const data =
          await requireDependencies().service.aggregateDailyModalData(
            overdueDays
          );
        set({
          dailyModalData: data,
          currentDay: data.date,
          modalShownToday: wasAcknowledged(data.date),
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

    showDailyModal: () => set({ isModalVisible: true }),

    hideDailyModal: () => {
      get().markModalShownToday();
      set({ isModalVisible: false });
    },

    markModalShownToday: () => {
      const day = get().currentDay;
      const current = requireDependencies();
      current.preferences.set(
        current.workspaceId,
        acknowledgementKey(day),
        "shown"
      );
      set({ modalShownToday: true, isStartOfDayAvailable: false });
    },

    checkShouldShowModal: async (overdueDays, options) => {
      if (get().modalShownToday) return false;
      try {
        return await requireDependencies().service.shouldShowDailyModal(
          overdueDays,
          options
        );
      } catch {
        return false;
      }
    },

    checkDayTransition: async () => {
      const day = await requireDependencies().effectiveDate();
      const state = get();
      if (state.currentDay === day) return false;
      get().resetForNewDay(state.isModalVisible, day);
      return true;
    },

    resetForNewDay: (preserveModalData = false, day = get().currentDay) => {
      const state = get();
      set({
        modalShownToday: wasAcknowledged(day),
        currentDay: day,
        dailyModalData: preserveModalData ? state.dailyModalData : null,
        isModalVisible: preserveModalData ? state.isModalVisible : false,
        error: null,
        todayTaskIds: [],
        isStartOfDayAvailable: false,
      });
    },

    reset: () => {
      set({
        dailyModalData: null,
        isModalVisible: false,
        isLoading: false,
        error: null,
        modalShownToday: false,
        todayTaskIds: [],
        isStartOfDayAvailable: false,
      });
    },

    returnTaskToToday: async (taskId) => {
      try {
        await requireDependencies()
          .service.getDailySelectionService()
          .addTaskToToday(taskId);
        await get().loadTodayTaskIds();
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to return task to today",
        });
      }
    },

    toggleTaskToday: async (taskId) => {
      try {
        const service =
          requireDependencies().service.getDailySelectionService();
        if (get().todayTaskIds.includes(taskId)) {
          await service.removeTaskFromToday(taskId);
        } else {
          await service.addTaskToToday(taskId);
        }
        await get().loadTodayTaskIds();
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to toggle task in today",
        });
      }
    },

    loadTodayTaskIds: async () => {
      try {
        const service =
          requireDependencies().service.getDailySelectionService();
        set({ todayTaskIds: await service.getTodayTaskIds() });
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to load today task IDs",
        });
      }
    },

    refreshStartOfDayAvailability: async () => {
      try {
        await get().checkDayTransition();
        if (get().modalShownToday) {
          set({ isStartOfDayAvailable: false });
          return;
        }
        const available =
          await requireDependencies().service.shouldShowDailyModal(undefined, {
            log: false,
          });
        set({ isStartOfDayAvailable: available });
      } catch {
        set({ isStartOfDayAvailable: false });
      }
    },

    startStartOfDayAvailabilityMonitoring: () => {
      if (availabilityInterval !== null) return;
      void get().refreshStartOfDayAvailability();
      availabilityInterval = setInterval(
        () => void get().refreshStartOfDayAvailability(),
        60_000
      );
    },

    stopStartOfDayAvailabilityMonitoring: () => {
      if (availabilityInterval === null) return;
      clearInterval(availabilityInterval);
      availabilityInterval = null;
    },
  }));
};

/** Initialized by the Task 10 composition root. */
export const useOnboardingViewModel = createOnboardingViewModel();
