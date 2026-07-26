import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");

const obsoletePaths = [
  "src/features/tasks/presentation/hooks/useTaskNote.ts",
  "src/features/tasks/presentation/hooks/__tests__/useTaskNote.test.tsx",
  "src/features/tasks/presentation/components/task-card/hooks/useTaskNote.ts",
  "src/features/tasks/presentation/components/task-card/hooks/useTaskEditing.ts",
] as const;

const ownedProductionPaths = [
  "src/features/tasks/presentation/models/TaskListItem.ts",
  "src/features/tasks/presentation/models/TaskReorderIntent.ts",
  "src/features/tasks/presentation/components/TaskCard.tsx",
  "src/features/tasks/presentation/components/TaskList.tsx",
  "src/features/tasks/presentation/components/DeferredTaskCard.tsx",
  "src/features/tasks/presentation/components/task-card/TaskCardHeader.tsx",
  "src/features/tasks/presentation/components/task-card/TaskTitleDisplay.tsx",
  "src/features/tasks/presentation/components/task-card/TaskDeferModal.tsx",
  "src/features/tasks/presentation/components/task-card/hooks/useTaskDefer.ts",
  "src/features/tasks/presentation/view-models/TaskViewModel.ts",
  "src/features/today/presentation/view-models/TodayViewModel.ts",
  "src/features/today/presentation/view-models/TodayViewModelStore.ts",
  "src/features/today/presentation/components/TodayView.tsx",
  "src/features/today/presentation/components/TodayMobileView.tsx",
  "src/mvp/components/ContentArea.tsx",
  "src/mvp/components/MobileLayout.tsx",
  "src/mvp/MVPApp.tsx",
] as const;

const source = (path: string): string =>
  readFileSync(resolve(projectRoot, path), "utf8");

describe("Task 8 Presentation mutation boundary", () => {
  it("has removed every obsolete full-string title and note hook", () => {
    expect(
      obsoletePaths.filter((path) => existsSync(resolve(projectRoot, path)))
    ).toEqual([]);
  });

  it("contains no legacy task text, numeric reorder, or branded request path", () => {
    const matches = ownedProductionPaths.flatMap((path) => {
      if (!existsSync(resolve(projectRoot, path))) return [];
      const contents = source(path);
      return [
        /ChangeTaskNoteUseCase/,
        /CHANGE_TASK_NOTE_USE_CASE_TOKEN/,
        /\btaskOrders\b/,
        /title\s*:\s*newTitle/,
        /\border\s*:\s*(?:Date\.now\(\)|\w+\.order|index|newOrder)/,
        /taskId\s*:\s*TaskId\./,
      ]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });

    expect(matches).toEqual([]);
  });

  it("contains no unsafe compatibility assertions in owned production", () => {
    const matches = ownedProductionPaths.flatMap((path) => {
      if (!existsSync(resolve(projectRoot, path))) return [];
      const contents = source(path);
      return [/\bas any\b/, /getService<any>/, /\bas TaskCategory\b/]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });

    expect(matches).toEqual([]);
  });

  it("does not sort TaskList by numeric legacy order", () => {
    const contents = source(
      "src/features/tasks/presentation/components/TaskList.tsx"
    );

    expect(contents).not.toMatch(/\.order\b/);
  });

  it("uses the direct Today projection without selection-time fields", () => {
    const matches = [
      "src/features/today/presentation/view-models/TodayViewModel.ts",
      "src/features/today/presentation/view-models/TodayViewModelStore.ts",
      "src/features/today/presentation/components/TodayView.tsx",
      "src/features/today/presentation/components/TodayMobileView.tsx",
    ].flatMap((path) => {
      const contents = source(path);
      return [/TodayTaskInfo/, /completedInSelection/, /selectedAt/]
        .filter((pattern) => pattern.test(contents))
        .map((pattern) => `${path}:${pattern.source}`);
    });

    expect(matches).toEqual([]);
  });
});
