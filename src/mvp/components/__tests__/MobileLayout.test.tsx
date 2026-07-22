import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileLayout } from "../MobileLayout";
import type { TodayViewModelDependencies } from "../../../features/today/presentation/view-models/TodayViewModel";

vi.mock(
  "../../../features/today/presentation/components/TodayMobileView",
  () => ({ TodayMobileView: () => <div data-testid="today-mobile-view" /> })
);

vi.mock("../../../features/tasks/presentation/components/TaskList", () => ({
  TaskList: () => <div data-testid="task-list" />,
}));

describe("MobileLayout task creation", () => {
  it("keeps Deferred visible as a category but excludes it from creation pickers", () => {
    const { container } = render(
      <MobileLayout
        todayDependencies={{} as TodayViewModelDependencies}
        tasks={[]}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onDefer={vi.fn()}
        onUndefer={vi.fn().mockResolvedValue(undefined)}
        onReorderTasks={vi.fn()}
        onLoadTaskLogs={vi.fn().mockResolvedValue([])}
        onCreateLog={vi.fn().mockResolvedValue(true)}
        onCreateTask={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn()}
        onAddToToday={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(within(container).getByText("Deferred")).toBeInTheDocument();

    const pickerContainer = container.querySelector<HTMLElement>(
      ".mobile-input-container"
    );
    const pickerTrigger =
      pickerContainer?.querySelector<HTMLButtonElement>("button");
    expect(pickerContainer).not.toBeNull();
    expect(pickerTrigger).not.toBeNull();
    if (!pickerContainer || !pickerTrigger) {
      throw new Error("Task creation picker was not rendered");
    }

    fireEvent.click(pickerTrigger);

    expect(
      within(pickerContainer).getByRole("button", { name: "Inbox" })
    ).toBeInTheDocument();
    expect(
      within(pickerContainer).getByRole("button", { name: "Simple" })
    ).toBeInTheDocument();
    expect(
      within(pickerContainer).getByRole("button", { name: "Focus" })
    ).toBeInTheDocument();
    expect(
      within(pickerContainer).queryByRole("button", { name: "Deferred" })
    ).not.toBeInTheDocument();
  });
});
