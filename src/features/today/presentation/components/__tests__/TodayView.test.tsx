import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceTaskReadModel } from "../../../../workspaces/application/ports/WorkspaceRepository";
import type { TodayViewModelDependencies } from "../../view-models/TodayViewModel";
import type { TaskListItem } from "../../../../tasks/presentation/models/TaskListItem";
import { TodayView } from "../TodayView";

const activeTask: WorkspaceTaskReadModel = {
  workspaceId: "workspace-1",
  taskId: "active-1",
  title: "Direct active projection",
  note: "active note",
  tags: ["tag-a"],
  category: "SIMPLE",
  completion: "active",
  positionKey: "a",
  deferredUntil: null,
  inboxEnteredOn: null,
};
const completedTask: WorkspaceTaskReadModel = {
  ...activeTask,
  taskId: "done-1",
  title: "Direct completed projection",
  completion: "completed",
  positionKey: "b",
};

const store = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  totalCount: 2,
  completedCount: 1,
  initialize: vi.fn(),
  loadTodayTasks: vi.fn(),
  removeTaskFromToday: vi.fn(),
  completeTask: vi.fn(),
  revertTaskCompletion: vi.fn(),
  clearError: vi.fn(),
  getActiveTasks: vi.fn(() => [activeTask]),
  getCompletedTasks: vi.fn(() => [completedTask]),
  getTodayTaskIds: vi.fn(() => ["active-1", "done-1"]),
  enableAutoRefresh: vi.fn(),
}));

vi.mock("../../view-models/TodayViewModelStore", () => ({
  useTodayViewModelStore: () => store,
}));

vi.mock(
  "../../../../onboarding/presentation/view-models/OnboardingViewModel",
  () => ({
    useOnboardingViewModel: () => ({
      loadDailyModalData: vi.fn(),
      showDailyModal: vi.fn(),
      markModalShownToday: vi.fn(),
      isStartOfDayAvailable: false,
    }),
  })
);

vi.mock("../../../../tasks/presentation/components/TaskList", () => ({
  TaskList: ({ tasks }: { tasks: readonly TaskListItem[] }) => (
    <div>
      {tasks.map((task) => (
        <div data-testid="projected-task-row" key={task.taskId}>
          {task.taskId}:{task.title}:{task.completion}
        </div>
      ))}
    </div>
  ),
}));

describe("TodayView direct workspace projection", () => {
  it("adapts direct active and completed read models without selection metadata", () => {
    const dependencies = {
      getTodayTasksUseCase: { execute: vi.fn() },
      addTaskToTodayUseCase: { execute: vi.fn() },
      removeTaskFromTodayUseCase: { execute: vi.fn() },
      completeTaskUseCase: { execute: vi.fn() },
      revertTaskCompletionUseCase: { execute: vi.fn() },
    } satisfies TodayViewModelDependencies;

    render(<TodayView dependencies={dependencies} />);

    expect(
      screen.getAllByTestId("projected-task-row").map((row) => row.textContent)
    ).toEqual([
      "active-1:Direct active projection:active",
      "done-1:Direct completed projection:completed",
    ]);
  });
});
