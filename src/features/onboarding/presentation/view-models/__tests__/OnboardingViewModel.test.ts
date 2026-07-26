import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalPreferenceRepository } from "../../../../settings/application/ports/LocalPreferenceRepository";
import {
  createOnboardingViewModel,
  type OnboardingViewModelDependencies,
} from "../OnboardingViewModel";

class MemoryPreferences implements LocalPreferenceRepository {
  readonly values = new Map<string, string>();
  get(workspaceId: string, key: string): string | null {
    return this.values.get(`${workspaceId}:${key}`) ?? null;
  }
  set(workspaceId: string, key: string, value: string): void {
    this.values.set(`${workspaceId}:${key}`, value);
  }
  remove(workspaceId: string, key: string): void {
    this.values.delete(`${workspaceId}:${key}`);
  }
}

describe("OnboardingViewModel deterministic day state", () => {
  let day: string;
  let preferences: MemoryPreferences;
  let dependencies: OnboardingViewModelDependencies;
  const selection = {
    addTaskToToday: vi.fn(),
    removeTaskFromToday: vi.fn(),
    getTodayTaskIds: vi.fn().mockResolvedValue([]),
  };
  const modalData = {
    previousDayTasks: [],
    overdueInboxTasks: [],
    dueDeferredTasks: [],
    regularInboxTasks: [],
    motivationalMessage: "Hello",
    shouldShow: false,
    date: "2026-07-22",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    day = "2026-07-22";
    preferences = new MemoryPreferences();
    dependencies = {
      workspaceId: "workspace-1",
      preferences,
      effectiveDate: vi.fn(async () => day),
      service: {
        aggregateDailyModalData: vi.fn().mockResolvedValue(modalData),
        shouldShowDailyModal: vi.fn().mockResolvedValue(false),
        getDailySelectionService: vi.fn(() => selection),
      },
    };
  });

  it("refreshes only device-local presentation state on a new day", async () => {
    const store = createOnboardingViewModel(dependencies);
    await store.getState().initialize(dependencies);
    store.getState().showDailyModal();
    await store.getState().loadDailyModalData();

    day = "2026-07-23";
    await expect(store.getState().checkDayTransition()).resolves.toBe(true);

    expect(store.getState().currentDay).toBe("2026-07-23");
    expect(store.getState().isModalVisible).toBe(true);
    expect(selection.removeTaskFromToday).not.toHaveBeenCalled();
  });

  it("keys acknowledgement by workspace and effective date", async () => {
    const store = createOnboardingViewModel(dependencies);
    await store.getState().initialize(dependencies);
    store.getState().markModalShownToday();

    expect(preferences.get("workspace-1", "daily-modal:2026-07-22")).toBe(
      "shown"
    );
    day = "2026-07-23";
    await store.getState().checkDayTransition();
    expect(store.getState().modalShownToday).toBe(false);
  });

  it("loads selected IDs through the dated workspace query service", async () => {
    selection.getTodayTaskIds.mockResolvedValueOnce(["task-1"]);
    const store = createOnboardingViewModel(dependencies);
    await store.getState().loadTodayTaskIds();
    expect(store.getState().todayTaskIds).toEqual(["task-1"]);
  });
});
