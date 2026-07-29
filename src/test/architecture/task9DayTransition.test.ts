import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");
const source = (path: string): string =>
  readFileSync(resolve(projectRoot, path), "utf8");

describe("Task 9 deterministic day transition boundary", () => {
  it("keeps Today date resolution behind the workspace query", () => {
    const paths = [
      "src/features/today/presentation/view-models/TodayViewModel.ts",
      "src/features/today/presentation/view-models/TodayViewModelStore.ts",
    ];
    const matches = paths.flatMap((path) => {
      const contents = source(path);
      return [
        /TodoDatabase/,
        /todoDatabase/,
        /UserSettingsService/,
        /UserSettingsRepositoryImpl/,
        /DateOnly\.getCurrentDate/,
        /startOfDayTime/,
        /getEffectiveDateValue/,
        /isToday/,
      ]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });

    expect(matches).toEqual([]);
  });

  it("has no transition-time selection clearing or automatic undefer writes", () => {
    const paths = [
      "src/features/onboarding/application/services/OnboardingService.ts",
      "src/features/onboarding/application/services/DailySelectionService.ts",
      "src/shared/application/services/DeferredTaskService.ts",
      "src/mvp/components/DevDayTransition.tsx",
    ];
    const matches = paths.flatMap((path) => {
      const contents = source(path);
      return [
        /handleNewDayTransition/,
        /clearTodaySelection/,
        /clearSelectionForDate/,
        /\.clearDay\(/,
        /processDueTasks/,
        /auto-undefer/i,
        /__dev_mocked_date__/,
        /window\.location\.reload/,
      ]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });

    expect(matches).toEqual([]);
  });

  it("keeps settings, onboarding and stats ViewModels behind injected ports", () => {
    const paths = [
      "src/features/onboarding/presentation/view-models/OnboardingViewModel.ts",
      "src/features/onboarding/presentation/view-models/UserSettingsViewModel.ts",
      "src/features/stats/presentation/view-models/StatsViewModel.ts",
    ];
    const matches = paths.flatMap((path) => {
      const contents = source(path);
      return [
        /TodoDatabase/,
        /todoDatabase/,
        /UserSettingsRepositoryImpl/,
        /shared\/infrastructure\/di/,
        /localStorage/,
      ]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });
    expect(matches).toEqual([]);
  });

  it("has removed mutable event-derived log and statistic handlers", () => {
    expect(
      [
        "src/features/stats/application/event-handlers/TaskLogEventHandler.ts",
        "src/features/stats/application/event-handlers/StatsUpdateHandler.ts",
        "src/features/stats/application/services/EventMonitor.ts",
        "src/features/stats/application/services/EventCleanupService.ts",
        "src/shared/domain/events/EventBus.ts",
      ].filter((path) => existsSync(resolve(projectRoot, path)))
    ).toEqual([]);

    expect(source("src/shared/application/ports/EventBus.ts")).not.toMatch(
      /infrastructure|dexie|TodoDatabase/
    );
  });
});
