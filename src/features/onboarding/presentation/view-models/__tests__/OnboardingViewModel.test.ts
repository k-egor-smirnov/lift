import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOnboardingViewModel } from "../OnboardingViewModel";
import { DateOnly } from "../../../../../shared/domain/value-objects/DateOnly";

// Mock OnboardingService
vi.mock("../../application/services/OnboardingService", () => ({
  OnboardingService: vi.fn().mockImplementation(() => ({
    aggregateDailyModalData: vi.fn().mockResolvedValue({
      unfinishedTasks: [],
      overdueInboxTasks: [],
      regularInboxTasks: [],
      motivationalMessage: "Test message",
      shouldShow: false,
      date: "2023-12-01",
    }),
    shouldShowDailyModal: vi.fn().mockResolvedValue(false),
    getDailySelectionService: vi.fn().mockReturnValue({
      addTaskToToday: vi.fn(),
      removeTaskFromToday: vi.fn(),
      getTodayTasks: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

// Mock dependencies
vi.mock("../../../../../shared/infrastructure/di", () => ({
  container: {
    resolve: vi.fn().mockImplementation((token) => {
      if (token === "TASK_REPOSITORY_TOKEN") {
        return {
          findById: vi.fn(),
          findOverdueTasks: vi.fn().mockResolvedValue([]),
          findByCategoryAndStatus: vi.fn().mockResolvedValue([]),
        };
      }
      if (token === "DAILY_SELECTION_REPOSITORY_TOKEN") {
        return {
          getTasksForDay: vi.fn().mockResolvedValue([]),
          addTaskToDay: vi.fn(),
          removeTaskFromDay: vi.fn(),
        };
      }
      if (token === "LOG_SERVICE_TOKEN") {
        return {
          createLog: vi.fn(),
        };
      }
      if (token === "EVENT_BUS_TOKEN") {
        return {
          publish: vi.fn(),
        };
      }
      return {};
    }),
  },
  tokens: {
    TASK_REPOSITORY_TOKEN: "TASK_REPOSITORY_TOKEN",
    DAILY_SELECTION_REPOSITORY_TOKEN: "DAILY_SELECTION_REPOSITORY_TOKEN",
    LOG_SERVICE_TOKEN: "LOG_SERVICE_TOKEN",
    EVENT_BUS_TOKEN: "EVENT_BUS_TOKEN",
  },
}));

vi.mock("../../../../../shared/infrastructure/database/TodoDatabase", () => ({
  todoDatabase: {
    userSettings: {
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../../../../../shared/infrastructure/events/TaskEventBus", () => ({
  taskEventBus: {
    subscribe: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock DateOnly.today()
vi.mock("../../../../../shared/domain/value-objects/DateOnly", async () => {
  const originalModule = (await vi.importActual(
    "../../../../../shared/domain/value-objects/DateOnly"
  )) as any;
  return {
    ...originalModule,
    DateOnly: {
      ...originalModule.DateOnly,
      today: vi.fn().mockReturnValue({ value: "2023-12-01" }),
    },
  };
});

describe("OnboardingViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);

    // Reset DateOnly.today() mock to default date
    (DateOnly.today as any).mockReturnValue({ value: "2023-12-01" });

    // Mock current time to be in morning window
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-12-01T09:00:00"));

    // Reset Zustand store state between tests
    const { result } = renderHook(() => useOnboardingViewModel());
    act(() => {
      result.current.reset();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkDayTransition and resetForNewDay", () => {
    it("should preserve modal data when modal is visible during day transition", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      // Set up initial state with modal visible and data
      const mockModalData = {
        unfinishedTasks: [],
        overdueInboxTasks: [],
        regularInboxTasks: [],
        motivationalMessage: "Test message",
        shouldShow: true,
        date: "2023-12-01",
      };

      await act(async () => {
        // Simulate modal being shown
        result.current.showDailyModal();
        // Load modal data
        await result.current.loadDailyModalData();
      });

      // Verify modal is visible
      expect(result.current.isModalVisible).toBe(true);

      // Simulate day transition (move to next day)
      (DateOnly.today as any).mockReturnValue({ value: "2023-12-02" });

      await act(async () => {
        const dayChanged = result.current.checkDayTransition();
        expect(dayChanged).toBe(true);
      });

      // Modal visibility should be preserved when modal was visible
      expect(result.current.isModalVisible).toBe(true);
      expect(result.current.currentDay).toBe("2023-12-02");
      expect(result.current.modalShownToday).toBe(false); // Reset for new day
    });

    it("should clear modal data when modal is not visible during day transition", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      // Load data but don't show modal (modal starts hidden by default)
      await act(async () => {
        await result.current.loadDailyModalData();
      });

      // Verify modal is not visible (should be false by default)
      expect(result.current.isModalVisible).toBe(false);

      // Simulate day transition
      (DateOnly.today as any).mockReturnValue({ value: "2023-12-02" });

      await act(async () => {
        const dayChanged = result.current.checkDayTransition();
        expect(dayChanged).toBe(true);
      });

      // Modal should remain hidden and data should be cleared
      expect(result.current.isModalVisible).toBe(false);
      expect(result.current.dailyModalData).toBe(null);
      expect(result.current.currentDay).toBe("2023-12-02");
      expect(result.current.modalShownToday).toBe(false);
    });

    it("should not trigger day transition when day has not changed", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      await act(async () => {
        result.current.showDailyModal();
        await result.current.loadDailyModalData();
      });

      // Check day transition on same day
      await act(async () => {
        const dayChanged = result.current.checkDayTransition();
        expect(dayChanged).toBe(false);
      });

      // State should remain unchanged
      expect(result.current.isModalVisible).toBe(true);
      expect(result.current.currentDay).toBe("2023-12-01");
    });

    it("should manually reset for new day with preserve flag", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      await act(async () => {
        result.current.showDailyModal();
        await result.current.loadDailyModalData();
      });

      // Manually reset with preserve flag
      await act(async () => {
        result.current.resetForNewDay(true);
      });

      // Modal visibility should be preserved
      expect(result.current.isModalVisible).toBe(true);
      expect(result.current.modalShownToday).toBe(false);
      expect(result.current.todayTaskIds).toEqual([]);
    });

    it("should manually reset for new day without preserve flag", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      await act(async () => {
        result.current.showDailyModal();
        await result.current.loadDailyModalData();
      });

      // Manually reset without preserve flag
      await act(async () => {
        result.current.resetForNewDay(false);
      });

      // Modal should be cleared
      expect(result.current.isModalVisible).toBe(false);
      expect(result.current.dailyModalData).toBe(null);
      expect(result.current.modalShownToday).toBe(false);
      expect(result.current.todayTaskIds).toEqual([]);
    });
  });

  describe("modal visibility and data preservation scenario", () => {
    it("should preserve Friday tasks when user returns on Monday with modal still open", async () => {
      const { result } = renderHook(() => useOnboardingViewModel());

      // Simulate Friday: show modal and load data
      await act(async () => {
        result.current.showDailyModal();
        await result.current.loadDailyModalData();
      });

      // Verify Friday state
      expect(result.current.isModalVisible).toBe(true);

      // Simulate Monday morning - day transition
      (DateOnly.today as any).mockReturnValue({ value: "2023-12-04" }); // Monday

      await act(async () => {
        const dayChanged = result.current.checkDayTransition();
        expect(dayChanged).toBe(true);
      });

      // Modal should remain visible because it was open during transition
      expect(result.current.isModalVisible).toBe(true);
      expect(result.current.currentDay).toBe("2023-12-04");
      expect(result.current.modalShownToday).toBe(false);
    });
  });
});
