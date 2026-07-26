import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskCategory } from "../../../../../shared/domain/types";
import type { TaskListItem } from "../../models/TaskListItem";
import { TaskCard } from "../TaskCard";

const task = (overrides: Partial<TaskListItem> = {}): TaskListItem => ({
  taskId: "01J00000000000000000000010",
  title: "Review causal sync",
  note: "",
  category: TaskCategory.FOCUS,
  completion: "active",
  deferredUntil: null,
  ...overrides,
});

describe("TaskCard secure-session boundary", () => {
  const onComplete = vi.fn();
  const onRevertCompletion = vi.fn();
  const onDelete = vi.fn();
  const onAddToToday = vi.fn();
  const onDefer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a time-free task row and completes by string ID", () => {
    render(
      <TaskCard task={task()} onComplete={onComplete} onDelete={onDelete} />
    );

    expect(screen.getByText("Review causal sync")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark task as complete" })
    );
    expect(onComplete).toHaveBeenCalledWith("01J00000000000000000000010");
  });

  it("reopens a completed row by string ID", () => {
    render(
      <TaskCard
        task={task({ completion: "completed" })}
        onComplete={onComplete}
        onRevertCompletion={onRevertCompletion}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByTitle("↩️ Revert"));
    expect(onRevertCompletion).toHaveBeenCalledWith(
      "01J00000000000000000000010"
    );
  });

  it("toggles Today and opens explicit deferral from semantic actions", () => {
    render(
      <TaskCard
        task={task()}
        onComplete={onComplete}
        onDelete={onDelete}
        onAddToToday={onAddToToday}
        onDefer={onDefer}
        showTodayButton
        showDeferButton
      />
    );

    fireEvent.click(screen.getByTitle("Add to Today"));
    expect(onAddToToday).toHaveBeenCalledWith("01J00000000000000000000010");

    fireEvent.keyDown(screen.getByTitle("More actions"), { key: "Enter" });
    fireEvent.click(screen.getByText("Defer Task"));
    expect(
      screen.getByText("Выберите дату, на которую отложить задачу:")
    ).toBeInTheDocument();
  });

  it("has no title button, Edit action, or edit modal without causal sessions", () => {
    render(
      <TaskCard task={task()} onComplete={onComplete} onDelete={onDelete} />
    );

    expect(
      screen.queryByRole("button", { name: /edit task/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Review causal sync")).not.toHaveAttribute(
      "role",
      "button"
    );

    fireEvent.click(screen.getByTestId("task-card"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
