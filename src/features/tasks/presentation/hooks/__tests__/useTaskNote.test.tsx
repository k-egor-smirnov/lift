import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../../shared/infrastructure/di", () => ({
  getService: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  }),
}));

import { renderHook, act } from "@testing-library/react";
import { useTaskNote } from "../useTaskNote";
import {
  createTaskViewModel,
  TaskViewModel,
  TaskViewModelDependencies,
} from "../../view-models/TaskViewModel";
import { TestTaskIdUtils } from "../../../../../test/utils/testHelpers";
import * as di from "../../../../../shared/infrastructure/di";

type ChangeTaskNoteResult =
  | { success: true; data: undefined }
  | { success: false; error: Error };

const successfulChangeTaskNoteResult: ChangeTaskNoteResult = {
  success: true,
  data: undefined,
};

interface CreateTaskViewModelStoreOptions {
  changeTaskNoteResult?: ChangeTaskNoteResult;
}

const createTaskViewModelStore = (
  options: CreateTaskViewModelStoreOptions = {}
) => {
  const { changeTaskNoteResult = successfulChangeTaskNoteResult } = options;

  const changeTaskNoteExecuteMock = vi
    .fn()
    .mockResolvedValue(changeTaskNoteResult);

  const taskRepositoryMock = {
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    findByCategory: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findByCategoryAndStatus: vi.fn().mockResolvedValue([]),
    findOverdueTasks: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    saveMany: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    countByCategory: vi.fn().mockResolvedValue(0),
    exists: vi.fn().mockResolvedValue(false),
  };

  const dependencies: TaskViewModelDependencies = {
    taskRepository: taskRepositoryMock as unknown as TaskViewModelDependencies["taskRepository"],
    createTaskUseCase: { execute: vi.fn() } as unknown as TaskViewModelDependencies["createTaskUseCase"],
    updateTaskUseCase: { execute: vi.fn() } as unknown as TaskViewModelDependencies["updateTaskUseCase"],
    completeTaskUseCase: { execute: vi.fn() } as unknown as TaskViewModelDependencies["completeTaskUseCase"],
    deleteTaskUseCase: { execute: vi.fn() } as unknown as TaskViewModelDependencies["deleteTaskUseCase"],
    changeTaskNoteUseCase: {
      execute: changeTaskNoteExecuteMock,
    } as unknown as TaskViewModelDependencies["changeTaskNoteUseCase"],
    getTodayTasksUseCase: {
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { tasks: [] },
      }),
    } as unknown as TaskViewModelDependencies["getTodayTasksUseCase"],
  };

  return {
    taskViewModel: createTaskViewModel(dependencies),
    changeTaskNoteExecuteMock,
    taskRepositoryMock,
  };
};

describe("useTaskNote", () => {
  let validTaskId: string;

  beforeEach(() => {
    validTaskId = TestTaskIdUtils.getValidTaskIdString();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with closed state", () => {
    const { taskViewModel } = createTaskViewModelStore();

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note", taskViewModel as TaskViewModel)
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it("should open note when openNote is called", () => {
    const { taskViewModel } = createTaskViewModelStore();

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note", taskViewModel as TaskViewModel)
    );

    act(() => {
      result.current.openNote();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("should close note when closeNote is called", () => {
    const { taskViewModel } = createTaskViewModelStore();

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note", taskViewModel as TaskViewModel)
    );

    act(() => {
      result.current.openNote();
    });

    act(() => {
      result.current.closeNote();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("should save note using TaskViewModel when provided", async () => {
    const { taskViewModel, changeTaskNoteExecuteMock, taskRepositoryMock } =
      createTaskViewModelStore();
    const getStateSpy = vi.spyOn(taskViewModel, "getState");

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note", taskViewModel as TaskViewModel)
    );

    await act(async () => {
      await result.current.saveNote("Updated note");
    });

    expect(changeTaskNoteExecuteMock).toHaveBeenCalledTimes(1);
    const request = changeTaskNoteExecuteMock.mock.calls[0][0];
    expect(request.note).toBe("Updated note");
    expect(request.taskId.value).toBe(validTaskId);
    expect(taskRepositoryMock.findAll).toHaveBeenCalled();
    expect(getStateSpy).toHaveBeenCalled();
  });

  it("should handle saving when taskViewModel is not provided", async () => {
    const executeMock = vi
      .fn()
      .mockResolvedValue({ success: true, data: undefined });

    const getServiceSpy = vi
      .spyOn(di, "getService")
      .mockReturnValue({ execute: executeMock } as unknown);

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note")
    );

    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).resolves.not.toThrow();

    expect(executeMock).toHaveBeenCalled();

    getServiceSpy.mockRestore();
  });

  it("should handle saving errors gracefully", async () => {
    const error = new Error("Use case failure");
    const { taskViewModel } = createTaskViewModelStore({
      changeTaskNoteResult: { success: false, error },
    });

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, "Initial note", taskViewModel as TaskViewModel)
    );

    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).rejects.toThrow("Failed to save note via TaskViewModel");

    expect(taskViewModel.getState().error).toBe(error.message);
  });
});
