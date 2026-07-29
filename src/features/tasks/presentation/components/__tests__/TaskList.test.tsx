import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TaskCategory } from "../../../../../shared/domain/types";
import type { TaskListItem } from "../../models/TaskListItem";
import { TaskList } from "../TaskList";

vi.mock("@dnd-kit/core", () => ({
  closestCenter: vi.fn(),
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragStart: (event: {
      active: { id: string };
      activatorEvent: MouseEvent;
    }) => void;
    onDragEnd: (event: {
      active: { id: string };
      over: { id: string };
    }) => void;
  }) => (
    <div>
      {children}
      <button
        type="button"
        onClick={() => {
          onDragStart({
            active: { id: "a" },
            activatorEvent: new MouseEvent("mousedown", {
              clientX: 1,
              clientY: 1,
            }),
          });
          onDragEnd({ active: { id: "a" }, over: { id: "c" } });
        }}
      >
        move-a-over-c
      </button>
    </div>
  ),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
    isOver: false,
  })),
}));

vi.mock("@dnd-kit/modifiers", () => ({ restrictToWindowEdges: vi.fn() }));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

vi.mock("../TaskCard", () => ({
  TaskCard: ({ task }: { task: TaskListItem }) => (
    <div data-testid="task-row">{task.title}</div>
  ),
}));

vi.mock("../DeferredTaskCard", () => ({
  DeferredTaskCard: ({ task }: { task: TaskListItem }) => (
    <div data-testid="task-row">{task.title}</div>
  ),
}));

const row = (taskId: string, title: string): TaskListItem => ({
  taskId,
  title,
  note: "",
  category: TaskCategory.SIMPLE,
  completion: "active",
  deferredUntil: null,
});

describe("TaskList", () => {
  it("preserves supplied order and forwards one moved-task neighbour intent", () => {
    const onReorder = vi.fn();
    render(
      <TaskList
        tasks={[row("a", "First"), row("b", "Second"), row("c", "Third")]}
        onDelete={vi.fn()}
        onReorder={onReorder}
      />
    );

    expect(
      screen.getAllByTestId("task-row").map((node) => node.textContent)
    ).toEqual(["First", "Second", "Third"]);

    fireEvent.click(screen.getByRole("button", { name: "move-a-over-c" }));
    expect(onReorder).toHaveBeenCalledWith({
      taskId: "a",
      leftTaskId: "c",
      rightTaskId: null,
    });
  });

  it("opens explicit deferral and emits no category command for a DEFERRED drop", () => {
    const onDropOnCategory = vi.fn();
    const deferredTarget = document.createElement("div");
    deferredTarget.dataset.taskDropTarget = "category";
    deferredTarget.dataset.taskDropCategory = TaskCategory.DEFERRED;
    document.body.append(deferredTarget);
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [deferredTarget]),
    });

    render(
      <TaskList
        tasks={[row("a", "First"), row("b", "Second"), row("c", "Third")]}
        onDelete={vi.fn()}
        onDropOnCategory={onDropOnCategory}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "move-a-over-c" }));
    expect(onDropOnCategory).not.toHaveBeenCalled();
    expect(
      screen.getByText("Выберите дату, на которую отложить задачу:")
    ).toBeInTheDocument();

    deferredTarget.remove();
    Reflect.deleteProperty(document, "elementsFromPoint");
  });
});
