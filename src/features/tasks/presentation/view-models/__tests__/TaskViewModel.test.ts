import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceTaskReadModel } from "../../../../workspaces/application/ports/WorkspaceRepository";
import {
  CreateTaskUseCase,
  TaskCreationError,
} from "../../../../../shared/application/use-cases/CreateTaskUseCase";
import {
  DeleteTaskUseCase,
  TaskDeletionError,
} from "../../../../../shared/application/use-cases/DeleteTaskUseCase";
import {
  GetTodayTasksError,
  GetTodayTasksUseCase,
} from "../../../../../shared/application/use-cases/GetTodayTasksUseCase";
import {
  TaskUpdateError,
  UpdateTaskUseCase,
} from "../../../../../shared/application/use-cases/UpdateTaskUseCase";
import {
  CompleteTaskUseCase,
  TaskCompletionError,
} from "../../../../../shared/application/use-cases/CompleteTaskUseCase";
import { ResultUtils } from "../../../../../shared/domain/Result";
import { Task } from "../../../../../shared/domain/entities/Task";
import type { TaskRepository } from "../../../../../shared/domain/repositories/TaskRepository";
import { TaskCategory, TaskStatus } from "../../../../../shared/domain/types";
import { NonEmptyTitle } from "../../../../../shared/domain/value-objects/NonEmptyTitle";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";
import {
  createTaskViewModel,
  type TaskViewModelDependencies,
} from "../TaskViewModel";

const taskRepository: Pick<TaskRepository, "findAll"> = {
  findAll: vi.fn(),
};
const createTaskUseCase: Pick<CreateTaskUseCase, "execute"> = {
  execute: vi.fn(),
};
const updateTaskUseCase: Pick<UpdateTaskUseCase, "execute"> = {
  execute: vi.fn(),
};
const completeTaskUseCase: Pick<CompleteTaskUseCase, "execute"> = {
  execute: vi.fn(),
};
const deleteTaskUseCase: Pick<DeleteTaskUseCase, "execute"> = {
  execute: vi.fn(),
};
const getTodayTasksUseCase: Pick<GetTodayTasksUseCase, "execute"> = {
  execute: vi.fn(),
};

const dependencies: TaskViewModelDependencies = {
  taskRepository,
  createTaskUseCase,
  updateTaskUseCase,
  completeTaskUseCase,
  deleteTaskUseCase,
  getTodayTasksUseCase,
};

const projectedTask = (
  taskId: string,
  completion: WorkspaceTaskReadModel["completion"] = "active"
): WorkspaceTaskReadModel => ({
  workspaceId: "workspace-1",
  taskId,
  title: `Task ${taskId}`,
  note: "",
  tags: [],
  category: "SIMPLE",
  completion,
  positionKey: taskId,
  deferredUntil: null,
  inboxEnteredOn: null,
});

const legacyTask = (
  taskId: string,
  category: TaskCategory,
  status: TaskStatus = TaskStatus.ACTIVE
): Task =>
  new Task(
    TaskId.fromString(taskId),
    NonEmptyTitle.fromString(`Task ${taskId}`),
    category,
    status,
    1,
    new Date("2026-07-22T00:00:00.000Z"),
    new Date("2026-07-22T00:00:00.000Z")
  );

describe("TaskViewModel Task-8 contracts", () => {
  let viewModel: ReturnType<typeof createTaskViewModel>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskRepository.findAll).mockResolvedValue([]);
    viewModel = createTaskViewModel(dependencies);
  });

  it("starts with an explicit empty, idle state", () => {
    expect(viewModel.getState()).toMatchObject({
      tasks: [],
      loading: false,
      error: null,
      filter: {},
      overdueDays: 3,
    });
  });

  it("loads the legacy read view and clears the loading flag", async () => {
    const tasks = [
      legacyTask("01J00000000000000000000001", TaskCategory.SIMPLE),
      legacyTask("01J00000000000000000000002", TaskCategory.FOCUS),
    ];
    vi.mocked(taskRepository.findAll).mockResolvedValue(tasks);

    const loading = viewModel.getState().loadTasks();
    expect(viewModel.getState().loading).toBe(true);
    await loading;

    expect(viewModel.getState()).toMatchObject({
      tasks,
      loading: false,
      error: null,
    });
  });

  it("keeps silent reloads silent and surfaces repository failures", async () => {
    vi.mocked(taskRepository.findAll).mockResolvedValueOnce([]);
    await viewModel.getState().loadTasks({ silent: true });
    expect(viewModel.getState().loading).toBe(false);

    vi.mocked(taskRepository.findAll).mockRejectedValueOnce(
      new Error("Database unavailable")
    );
    await viewModel.getState().loadTasks();
    expect(viewModel.getState()).toMatchObject({
      loading: false,
      error: "Database unavailable",
    });
  });

  it("exposes no legacy note mutation or fake completion-revert action", () => {
    const stateKeys = Object.keys(viewModel.getState());
    const dependencyKeys = Object.keys(dependencies);

    expect(stateKeys).not.toContain("changeTaskNote");
    expect(stateKeys).not.toContain("revertTaskCompletion");
    expect(dependencyKeys).not.toContain("changeTaskNoteUseCase");
  });

  it("returns the exact created task ID and refreshes the legacy read view", async () => {
    vi.mocked(createTaskUseCase.execute).mockResolvedValue(
      ResultUtils.ok({ taskId: "01J00000000000000000000020" })
    );

    const taskId = await viewModel.getState().createTask({
      title: "New task",
      category: TaskCategory.SIMPLE,
    });

    expect(taskId).toBe("01J00000000000000000000020");
    expect(taskRepository.findAll).toHaveBeenCalledOnce();
  });

  it("returns null on create failure without searching tasks by timestamp", async () => {
    vi.mocked(createTaskUseCase.execute).mockResolvedValue(
      ResultUtils.error(
        new TaskCreationError("Creation failed", "CREATION_FAILED")
      )
    );

    const taskId = await viewModel.getState().createTask({
      title: "New task",
      category: TaskCategory.SIMPLE,
    });

    expect(taskId).toBeNull();
    expect(viewModel.getState().error).toBe("Creation failed");
    expect(taskRepository.findAll).not.toHaveBeenCalled();
  });

  it("updates only category with the exact Application request", async () => {
    vi.mocked(updateTaskUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );
    const request = {
      taskId: "01J00000000000000000000021",
      category: TaskCategory.FOCUS,
    };

    await viewModel.getState().updateTask(request);

    expect(updateTaskUseCase.execute).toHaveBeenCalledWith(request);
  });

  it("maps Today IDs directly from workspace projections", async () => {
    vi.mocked(getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.ok({
        tasks: [projectedTask("task-a"), projectedTask("task-b", "completed")],
        date: "2026-07-22",
        totalCount: 2,
        completedCount: 1,
        activeCount: 1,
      })
    );

    await expect(viewModel.getState().getTodayTaskIds()).resolves.toEqual([
      "task-a",
      "task-b",
    ]);
  });

  it("keeps Result failures inside update and Today state boundaries", async () => {
    vi.mocked(updateTaskUseCase.execute).mockResolvedValue(
      ResultUtils.error(new TaskUpdateError("Cannot update", "UPDATE_FAILED"))
    );

    await expect(
      viewModel.getState().updateTask({
        taskId: "01J00000000000000000000022",
        category: TaskCategory.INBOX,
      })
    ).resolves.toBe(false);
    expect(viewModel.getState().error).toBe("Cannot update");

    vi.mocked(getTodayTasksUseCase.execute).mockResolvedValue(
      ResultUtils.error(new GetTodayTasksError("Cannot read", "GET_FAILED"))
    );
    await expect(viewModel.getState().getTodayTaskIds()).resolves.toEqual([]);
    expect(viewModel.getState().error).toBe("Cannot read");
  });

  it("completes through the string-ID command and refreshes", async () => {
    vi.mocked(completeTaskUseCase.execute).mockResolvedValue(
      ResultUtils.ok(undefined)
    );

    await expect(
      viewModel.getState().completeTask("01J00000000000000000000025")
    ).resolves.toBe(true);
    expect(completeTaskUseCase.execute).toHaveBeenCalledWith({
      taskId: "01J00000000000000000000025",
    });
    expect(taskRepository.findAll).toHaveBeenCalledOnce();
  });

  it("surfaces completion failures without refreshing", async () => {
    vi.mocked(completeTaskUseCase.execute).mockResolvedValue(
      ResultUtils.error(
        new TaskCompletionError("Cannot complete", "COMPLETION_FAILED")
      )
    );

    await expect(
      viewModel.getState().completeTask("01J00000000000000000000026")
    ).resolves.toBe(false);
    expect(viewModel.getState().error).toBe("Cannot complete");
    expect(taskRepository.findAll).not.toHaveBeenCalled();
  });

  it("filters and groups only active legacy read entities", () => {
    const simple = legacyTask(
      "01J00000000000000000000003",
      TaskCategory.SIMPLE
    );
    const focus = legacyTask("01J00000000000000000000004", TaskCategory.FOCUS);
    const completed = legacyTask(
      "01J00000000000000000000005",
      TaskCategory.SIMPLE,
      TaskStatus.COMPLETED
    );
    viewModel.setState({ tasks: [simple, focus, completed] });

    expect(viewModel.getState().getFilteredTasks()).toEqual([simple, focus]);
    viewModel.getState().setFilter({ category: TaskCategory.FOCUS });
    expect(viewModel.getState().getFilteredTasks()).toEqual([focus]);
    expect(viewModel.getState().getTasksByCategory()).toMatchObject({
      [TaskCategory.SIMPLE]: [simple],
      [TaskCategory.FOCUS]: [focus],
      [TaskCategory.INBOX]: [],
      [TaskCategory.DEFERRED]: [],
    });
  });

  it("clears a displayed error", () => {
    viewModel.setState({ error: "Visible error" });
    viewModel.getState().clearError();
    expect(viewModel.getState().error).toBeNull();
  });

  it("deletes through the string-ID command and refreshes", async () => {
    vi.mocked(deleteTaskUseCase.execute).mockResolvedValue(
      ResultUtils.ok({ taskId: "01J00000000000000000000023" })
    );

    await expect(
      viewModel.getState().deleteTask("01J00000000000000000000023")
    ).resolves.toBe(true);
    expect(deleteTaskUseCase.execute).toHaveBeenCalledWith({
      taskId: "01J00000000000000000000023",
    });
    expect(taskRepository.findAll).toHaveBeenCalledOnce();
  });

  it("surfaces delete failures without refreshing", async () => {
    vi.mocked(deleteTaskUseCase.execute).mockResolvedValue(
      ResultUtils.error(new TaskDeletionError("Missing", "TASK_NOT_FOUND"))
    );

    await expect(
      viewModel.getState().deleteTask("01J00000000000000000000024")
    ).resolves.toBe(false);
    expect(viewModel.getState().error).toBe("Missing");
    expect(taskRepository.findAll).not.toHaveBeenCalled();
  });
});
