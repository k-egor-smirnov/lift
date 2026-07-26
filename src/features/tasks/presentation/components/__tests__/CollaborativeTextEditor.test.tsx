import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  CollaborativeTextSnapshot,
  CollaborativeTextViewModel,
} from "../../view-models/CollaborativeTextViewModel";
import {
  CollaborativeTextEditor,
  type CollaborativeTextEditorHandle,
} from "../CollaborativeTextEditor";

const createViewModel = (
  initial: Partial<CollaborativeTextSnapshot> = {}
): {
  readonly viewModel: CollaborativeTextViewModel;
  readonly setSnapshot: (patch: Partial<CollaborativeTextSnapshot>) => void;
} => {
  let snapshot: CollaborativeTextSnapshot = {
    path: "title",
    text: "Task",
    projectedText: "Task",
    focused: false,
    dirty: false,
    saving: false,
    error: null,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const viewModel: CollaborativeTextViewModel = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setText: vi.fn(),
    applyProjection: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
  };
  return {
    viewModel,
    setSnapshot: (patch) => {
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    },
  };
};

describe("CollaborativeTextEditor", () => {
  it("renders an accessible controlled input for a title", () => {
    const { viewModel } = createViewModel();

    render(<CollaborativeTextEditor viewModel={viewModel} label="Title" />);

    const input = screen.getByRole("textbox", { name: "Title" });
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveValue("Task");
  });

  it("renders a plain textarea for a note", () => {
    const { viewModel } = createViewModel({
      path: "note",
      text: "Plain note",
      projectedText: "Plain note",
    });

    render(<CollaborativeTextEditor viewModel={viewModel} label="Note" />);

    const textarea = screen.getByRole("textbox", { name: "Note" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("Plain note");
    expect(document.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("emits no edits during IME composition and commits the final text", () => {
    const { viewModel } = createViewModel();
    render(<CollaborativeTextEditor viewModel={viewModel} label="Title" />);
    const input = screen.getByRole("textbox", { name: "Title" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "タスク" } });
    expect(viewModel.setText).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: "タスク" } });
    expect(viewModel.setText).toHaveBeenCalledTimes(1);
    expect(viewModel.setText).toHaveBeenCalledWith("タスク");
  });

  it("finalizes an active IME composition before imperative flush", async () => {
    const { viewModel } = createViewModel();
    const order: string[] = [];
    vi.mocked(viewModel.setText).mockImplementation((text) => {
      order.push(`set:${text}`);
    });
    vi.mocked(viewModel.flush).mockImplementation(async () => {
      order.push("flush");
    });
    const ref = createRef<CollaborativeTextEditorHandle>();
    render(
      <CollaborativeTextEditor ref={ref} viewModel={viewModel} label="Title" />
    );
    const input = screen.getByRole("textbox", { name: "Title" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "タスク" } });

    await act(async () => ref.current?.flush());

    expect(order).toEqual(["set:タスク", "flush"]);
  });

  it("preserves a focused caret when a clean remote projection renders", () => {
    const { viewModel, setSnapshot } = createViewModel();
    render(<CollaborativeTextEditor viewModel={viewModel} label="Title" />);
    const input = screen.getByRole("textbox", {
      name: "Title",
    }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(2, 2);
    fireEvent.select(input);

    act(() => {
      setSnapshot({ text: "Remote Task", projectedText: "Remote Task" });
    });

    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("shows a retryable error and exposes flush to its parent", async () => {
    const { viewModel } = createViewModel({
      dirty: true,
      error: "database unavailable",
    });
    const ref = createRef<CollaborativeTextEditorHandle>();
    render(
      <CollaborativeTextEditor ref={ref} viewModel={viewModel} label="Title" />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("database unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(viewModel.retry).toHaveBeenCalledTimes(1);

    await act(async () => ref.current?.flush());
    expect(viewModel.flush).toHaveBeenCalledTimes(1);
  });
});
