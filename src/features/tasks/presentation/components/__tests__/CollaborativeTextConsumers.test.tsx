import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskCategory } from "../../../../../shared/domain/types";
import { NoteModal } from "../../../../../shared/ui/components/NoteModal";
import type {
  CollaborativeTextSnapshot,
  CollaborativeTextViewModel,
} from "../../view-models/CollaborativeTextViewModel";
import { TaskEditModal } from "../task-card/TaskEditModal";
import { TaskTitleEditor } from "../task-card/TaskTitleEditor";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

const waitForPromiseBoundary = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const observeUnhandledRejections = () => {
  const listener = vi.fn<(reason: unknown) => void>();
  process.on("unhandledRejection", listener);
  return {
    listener,
    stop: () => process.off("unhandledRejection", listener),
  };
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createViewModel = (
  path: "title" | "note",
  text: string,
  flush: () => Promise<void> = async () => undefined
): CollaborativeTextViewModel => {
  const snapshot: CollaborativeTextSnapshot = {
    path,
    text,
    projectedText: text,
    focused: false,
    dirty: false,
    saving: false,
    error: null,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    setText: vi.fn(),
    applyProjection: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn(flush),
    retry: vi.fn().mockResolvedValue(undefined),
  };
};

describe("collaborative text consumers", () => {
  it("TaskTitleEditor waits for autosave flush before closing", async () => {
    const pending = deferred<void>();
    const viewModel = createViewModel("title", "Task", () => pending.promise);
    const onClose = vi.fn();
    render(<TaskTitleEditor viewModel={viewModel} onClose={onClose} />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /^(Close|common\.close)$/ })[0]
    );
    expect(viewModel.flush).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("TaskTitleEditor ignores Enter while an IME composition is active", () => {
    const viewModel = createViewModel("title", "");
    const onClose = vi.fn();
    render(<TaskTitleEditor viewModel={viewModel} onClose={onClose} />);

    const input = screen.getByRole("textbox", { name: "Title" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "タスク" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, {
      key: "Enter",
      isComposing: false,
      keyCode: 229,
    });

    expect(viewModel.flush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("TaskTitleEditor finalizes active IME text before a close-button flush", async () => {
    const order: string[] = [];
    const viewModel = createViewModel("title", "");
    vi.mocked(viewModel.setText).mockImplementation((text) => {
      order.push(`set:${text}`);
    });
    vi.mocked(viewModel.flush).mockImplementation(async () => {
      order.push("flush");
    });
    const onClose = vi.fn(() => order.push("close"));
    render(<TaskTitleEditor viewModel={viewModel} onClose={onClose} />);

    const input = screen.getByRole("textbox", { name: "Title" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "タスク" } });
    fireEvent.click(
      screen.getAllByRole("button", { name: /^(Close|common\.close)$/ })[0]
    );

    await act(waitForPromiseBoundary);
    expect(order).toEqual(["set:タスク", "flush", "close"]);
  });

  it("TaskTitleEditor contains a rejected flush and remains open", async () => {
    const failure = new Error("title flush failed");
    const viewModel = createViewModel("title", "Task", async () => {
      throw failure;
    });
    const onClose = vi.fn();
    const unhandled = observeUnhandledRejections();

    try {
      render(<TaskTitleEditor viewModel={viewModel} onClose={onClose} />);
      fireEvent.click(
        screen.getAllByRole("button", { name: /^(Close|common\.close)$/ })[0]
      );

      await act(waitForPromiseBoundary);
      expect(onClose).not.toHaveBeenCalled();
      expect(unhandled.listener).not.toHaveBeenCalled();
    } finally {
      unhandled.stop();
    }
  });

  it("NoteModal is plain text and waits for flush before closing", async () => {
    const pending = deferred<void>();
    const viewModel = createViewModel(
      "note",
      "plain note",
      () => pending.promise
    );
    const onClose = vi.fn();
    render(
      <NoteModal
        isOpen
        viewModel={viewModel}
        taskTitle="Task"
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole("textbox", { name: /^(Note|taskCard\.note)$/ })
    ).toHaveValue("plain note");
    fireEvent.click(
      screen.getAllByRole("button", { name: /^(Close|common\.close)$/ })[1]
    );
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("TaskEditModal flushes both text sessions before saving non-text fields", async () => {
    const titleViewModel = createViewModel("title", "Task");
    const noteViewModel = createViewModel("note", "plain note");
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <TaskEditModal
        isOpen
        titleViewModel={titleViewModel}
        noteViewModel={noteViewModel}
        initialCategory={TaskCategory.INBOX}
        onClose={onClose}
        onSave={onSave}
        tags={[]}
        selectedTagIds={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^(Save|toasts\.save)$/ })
    );

    await act(async () => undefined);
    expect(titleViewModel.flush).toHaveBeenCalledTimes(1);
    expect(noteViewModel.flush).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      category: TaskCategory.INBOX,
      tagIds: [],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("TaskEditModal contains a rejected text flush and does not save or close", async () => {
    const titleViewModel = createViewModel("title", "Task", async () => {
      throw new Error("title flush failed");
    });
    const noteViewModel = createViewModel("note", "plain note");
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const unhandled = observeUnhandledRejections();

    try {
      render(
        <TaskEditModal
          isOpen
          titleViewModel={titleViewModel}
          noteViewModel={noteViewModel}
          initialCategory={TaskCategory.INBOX}
          onClose={onClose}
          onSave={onSave}
          tags={[]}
          selectedTagIds={[]}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /^(Save|toasts\.save)$/ })
      );

      await act(waitForPromiseBoundary);
      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(unhandled.listener).not.toHaveBeenCalled();
    } finally {
      unhandled.stop();
    }
  });

  it("TaskEditModal shows a local error when non-text save rejects", async () => {
    const titleViewModel = createViewModel("title", "Task");
    const noteViewModel = createViewModel("note", "plain note");
    const onSave = vi.fn().mockRejectedValue(new Error("server unavailable"));
    const onClose = vi.fn();
    const unhandled = observeUnhandledRejections();

    try {
      render(
        <TaskEditModal
          isOpen
          titleViewModel={titleViewModel}
          noteViewModel={noteViewModel}
          initialCategory={TaskCategory.INBOX}
          onClose={onClose}
          onSave={onSave}
          tags={[]}
          selectedTagIds={[]}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /^(Save|toasts\.save)$/ })
      );

      await act(waitForPromiseBoundary);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /не удалось сохранить изменения/i
      );
      expect(unhandled.listener).not.toHaveBeenCalled();
    } finally {
      unhandled.stop();
    }
  });
});
