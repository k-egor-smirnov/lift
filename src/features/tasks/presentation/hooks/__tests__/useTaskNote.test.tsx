import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestTaskIdUtils } from "@/test/utils/testHelpers";

// Mock the ChangeTaskNoteUseCase
const mockChangeTaskNoteUseCase = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ success: true, data: undefined }),
}));

// Mock the DI container
vi.mock("../../../../shared/infrastructure/di", () => ({
  getService: vi.fn().mockReturnValue(mockChangeTaskNoteUseCase),
}));

// Mock the tokens
vi.mock("../../../../shared/infrastructure/di/tokens", () => ({
  CHANGE_TASK_NOTE_USE_CASE_TOKEN: "CHANGE_TASK_NOTE_USE_CASE_TOKEN",
}));

// Import after mocking
import { useTaskNote } from "../useTaskNote";
import { TaskViewModel } from "../../view-models/TaskViewModel";

describe("useTaskNote", () => {
  let mockTaskViewModel: TaskViewModel;
  let validTaskId: string;

  beforeEach(() => {
    validTaskId = TestTaskIdUtils.getValidTaskIdString();
    mockTaskViewModel = vi.fn().mockReturnValue({
      changeTaskNote: vi.fn().mockResolvedValue(true),
    }) as any;
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

    expect(mockChangeTaskNoteUseCase.execute).toHaveBeenCalledWith({
      taskId: expect.any(Object),
      note: "Updated note",
    });
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

  it("should handle error when using DI container", async () => {
    mockChangeTaskNoteUseCase.execute.mockRejectedValueOnce(
      new Error("Task not found")
    );

    const { result } = renderHook(() => useTaskNote(validTaskId));

    await act(async () => {
      await result.current.saveNote("Updated note");
    });

    expect(mockChangeTaskNoteUseCase.execute).toHaveBeenCalledWith({
      taskId: validTaskId,
      note: "Updated note",
    });
  });
});
