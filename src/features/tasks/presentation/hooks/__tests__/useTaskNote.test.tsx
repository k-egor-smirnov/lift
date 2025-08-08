import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTaskNote } from "../useTaskNote";
import { TaskViewModel } from "../../view-models/TaskViewModel";

describe("useTaskNote", () => {
  let mockTaskViewModel: Partial<TaskViewModel>;

  beforeEach(() => {
    mockTaskViewModel = {
      changeTaskNote: vi.fn().mockReturnValue(true),
    };
  });

  it("should initialize with closed state", () => {
    const { result } = renderHook(() =>
      useTaskNote("task-1", "Initial note", mockTaskViewModel as TaskViewModel)
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it("should open note when openNote is called", () => {
    const { result } = renderHook(() =>
      useTaskNote("task-1", "Initial note", mockTaskViewModel as TaskViewModel)
    );

    act(() => {
      result.current.openNote();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("should close note when closeNote is called", () => {
    const { result } = renderHook(() =>
      useTaskNote("task-1", "Initial note", mockTaskViewModel as TaskViewModel)
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
      useTaskNote("task-1", "Initial note", mockTaskViewModel as TaskViewModel)
    );

    await act(async () => {
      await result.current.saveNote("Updated note");
    });

    expect(mockTaskViewModel.changeTaskNote).toHaveBeenCalledWith(
      "task-1",
      "Updated note"
    );
  });

  it("should handle saving when taskViewModel is not provided", async () => {
    // Mock the DI container
    vi.mock("../../../../shared/infrastructure/di", () => ({
      getService: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({ success: true }),
      }),
    }));

    const { result } = renderHook(() => useTaskNote("task-1", "Initial note"));

    // Should not throw error
    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).resolves.not.toThrow();
  });

  it("should handle saving errors gracefully", async () => {
    const mockTaskViewModelWithError = {
      changeTaskNote: vi.fn().mockReturnValue(false),
    };

    const { result } = renderHook(() =>
      useTaskNote(
        "task-1",
        "Initial note",
        mockTaskViewModelWithError as TaskViewModel
      )
    );

    await expect(
      act(async () => {
        await result.current.saveNote("Updated note");
      })
    ).rejects.toThrow("Failed to save note via TaskViewModel");
  });
});
