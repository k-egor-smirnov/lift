import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceTaskReadModel } from "../../../../workspaces/application/ports/WorkspaceRepository";
import type { AddTaskToTodayUseCase } from "../../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import type { CompleteTaskUseCase } from "../../../../../shared/application/use-cases/CompleteTaskUseCase";
import type { GetTodayTasksUseCase } from "../../../../../shared/application/use-cases/GetTodayTasksUseCase";
import type { RemoveTaskFromTodayUseCase } from "../../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import type { RevertTaskCompletionUseCase } from "../../../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import { ResultUtils } from "../../../../../shared/domain/Result";
import {
  createTodayViewModel,
  type TodayViewModelDependencies,
} from "../TodayViewModel";

const getTodayTasksUseCase: Pick<GetTodayTasksUseCase, "execute"> = {
  execute: vi.fn(),
};
const addTaskToTodayUseCase: Pick<AddTaskToTodayUseCase, "execute"> = {
  execute: vi.fn(),
};
const removeTaskFromTodayUseCase: Pick<RemoveTaskFromTodayUseCase, "execute"> =
  {
    execute: vi.fn(),
  };
const completeTaskUseCase: Pick<CompleteTaskUseCase, "execute"> = {
  execute: vi.fn(),
};
const revertTaskCompletionUseCase: Pick<
  RevertTaskCompletionUseCase,
  "execute"
> = { execute: vi.fn() };

const dependencies: TodayViewModelDependencies = {
  getTodayTasksUseCase,
  addTaskToTodayUseCase,
  removeTaskFromTodayUseCase,
  completeTaskUseCase,
  revertTaskCompletionUseCase,
};

const task = (
  taskId: string,
  completion: WorkspaceTaskReadModel["completion"]
): WorkspaceTaskReadModel => ({
  workspaceId: "workspace-1",
  taskId,
  title: `${completion} ${taskId}`,
  note: "",
  tags: [],
  category: "FOCUS",
  completion,
  positionKey: taskId,
  deferredUntil: null,
  inboxEnteredOn: null,
});

const response = (tasks: readonly WorkspaceTaskReadModel[]) => ({
  tasks,
  date: "2026-07-22",
  totalCount: tasks.length,
  completedCount: tasks.filter((item) => item.completion === "completed")
    .length,
  activeCount: tasks.filter((item) => item.completion === "active").length,
});

describe("TodayViewModel dated workspace projection", () => {
  let viewModel: ReturnType<typeof createTodayViewModel>;
  const projectedTasks = [
    task("active-1", "active"),
    task("done-1", "completed"),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok(response(projectedTasks))
    );
    vi.mocked(addTaskToTodayUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );
    vi.mocked(removeTaskFromTodayUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );
    vi.mocked(completeTaskUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );
    vi.mocked(revertTaskCompletionUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );
    viewModel = createTodayViewModel(dependencies);
    viewModel.setState({ currentDate: "2026-07-22" });
  });

  afterEach(() => {
    viewModel.getState().disableAutoRefresh();
  });

  it("stores the readonly workspace projections returned for an explicit date", async () => {
    await viewModel.getState().loadTodayTasks("2026-07-22");

    expect(viewModel.getState().tasks).toBe(projectedTasks);
    expect(getTodayTasksUseCase.execute).toHaveBeenCalledWith({
      date: "2026-07-22",
      includeCompleted: true,
    });
  });

  it("delegates the effective date to the workspace query on every unscoped refresh", async () => {
    vi.mocked(getTodayTasksUseCase.execute)
      .mockResolvedValueOnce(ResultUtils.ok(response(projectedTasks)))
      .mockResolvedValueOnce(
        ResultUtils.ok({ ...response([]), date: "2026-07-23" })
      );

    await viewModel.getState().loadTodayTasks();
    await viewModel.getState().refreshToday();

    expect(getTodayTasksUseCase.execute).toHaveBeenNthCalledWith(1, {
      includeCompleted: true,
    });
    expect(getTodayTasksUseCase.execute).toHaveBeenNthCalledWith(2, {
      includeCompleted: true,
    });
    expect(viewModel.getState().currentDate).toBe("2026-07-23");
  });

  it("partitions only by canonical completion and reads direct task IDs", () => {
    viewModel.setState({ tasks: projectedTasks });

    expect(viewModel.getState().getActiveTasks()).toEqual([projectedTasks[0]]);
    expect(viewModel.getState().getCompletedTasks()).toEqual([
      projectedTasks[1],
    ]);
    expect(viewModel.getState().getTodayTaskIds()).toEqual([
      "active-1",
      "done-1",
    ]);
  });

  it("adds and removes with the store's exact current date", async () => {
    await viewModel.getState().addTaskToToday("task-a");
    await viewModel.getState().removeTaskFromToday("task-b");

    expect(addTaskToTodayUseCase.execute).toHaveBeenCalledWith({
      taskId: "task-a",
      date: "2026-07-22",
    });
    expect(removeTaskFromTodayUseCase.execute).toHaveBeenCalledWith({
      taskId: "task-b",
      date: "2026-07-22",
    });
  });

  it("completes and reopens with the store's exact effective date", async () => {
    await viewModel.getState().completeTask("task-a");
    await viewModel.getState().revertTaskCompletion("task-b");

    expect(completeTaskUseCase.execute).toHaveBeenCalledWith({
      taskId: "task-a",
      effectiveDate: "2026-07-22",
    });
    expect(revertTaskCompletionUseCase.execute).toHaveBeenCalledWith({
      taskId: "task-b",
      effectiveDate: "2026-07-22",
    });
  });
});
