import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestTaskIdUtils } from "@/test/utils/testHelpers";
import { useTaskNote } from "../useTaskNote";
import type { TaskViewModel } from "../../view-models/TaskViewModel";
import { container } from "../../../../../shared/infrastructure/di";
import { TASK_REPOSITORY_TOKEN } from "../../../../../shared/infrastructure/di/tokens";
import { TaskId } from "../../../../../shared/domain/value-objects/TaskId";

// Mock TaskRepository to return a task
const mockTask = {
  changeNote: vi.fn().mockReturnValue([]),
};

const mockTaskRepository = {
  findById: vi.fn().mockResolvedValue(mockTask),
  save: vi.fn().mockResolvedValue(undefined),
};

// Replace TaskRepository in DI container
container.registerInstance(TASK_REPOSITORY_TOKEN, mockTaskRepository);

describe("useTaskNote", () => {
  let mockTaskViewModel: TaskViewModel;
  let validTaskId: string;

  beforeEach(() => {
    validTaskId = TestTaskIdUtils.getValidTaskIdString();
    mockTaskViewModel = vi.fn().mockReturnValue({
      changeTaskNote: vi.fn().mockResolvedValue(true),
    }) as any;

    // Reset all mocks
    vi.clearAllMocks();

    // Reset repository mocks
    mockTaskRepository.findById.mockClear();
    mockTaskRepository.save.mockClear();
    mockTask.changeNote.mockClear();
  });

  it("should initialize with closed state", () => {
    const { result } = renderHook(() =>
      useTaskNote(validTaskId, mockTaskViewModel as TaskViewModel)
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it("should open note when openNote is called", () => {
    const { result } = renderHook(() =>
      useTaskNote(validTaskId, mockTaskViewModel as TaskViewModel)
    );

    act(() => {
      result.current.openNote();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("should close note when closeNote is called", () => {
    const { result } = renderHook(() =>
      useTaskNote(validTaskId, mockTaskViewModel as TaskViewModel)
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
    const { result } = renderHook(() =>
      useTaskNote(validTaskId, mockTaskViewModel as TaskViewModel)
    );

    await act(async () => {
      await result.current.saveNote("Updated note");
    });

    const mockChangeTaskNote = mockTaskViewModel().changeTaskNote;
    expect(mockChangeTaskNote).toHaveBeenCalledWith(
      validTaskId,
      "Updated note"
    );
  });

  it("should handle saving when taskViewModel is not provided", async () => {
    const { result } = renderHook(() => useTaskNote(validTaskId));

    await act(async () => {
      await result.current.saveNote("Updated note");
    });

    expect(mockTaskRepository.findById).toHaveBeenCalledWith(
      expect.any(TaskId)
    );
    expect(mockTask.changeNote).toHaveBeenCalledWith("Updated note");
    expect(mockTaskRepository.save).toHaveBeenCalledWith(mockTask);
  });

  it("should handle saving errors gracefully", async () => {
    const mockTaskViewModelWithError = vi.fn().mockReturnValue({
      changeTaskNote: vi.fn().mockResolvedValue(false),
    }) as any;

    const { result } = renderHook(() =>
      useTaskNote(validTaskId, mockTaskViewModelWithError as TaskViewModel)
    );

    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).rejects.toThrow("Failed to save note via TaskViewModel");
  });

  it("should handle error when task is not found", async () => {
    mockTaskRepository.findById.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useTaskNote(validTaskId));

    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).rejects.toThrow("Task not found");

    expect(mockTaskRepository.findById).toHaveBeenCalledWith(
      expect.any(TaskId)
    );
  });
});
