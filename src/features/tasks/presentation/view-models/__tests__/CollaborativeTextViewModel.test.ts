import { describe, expect, it, vi } from "vitest";

import type { WorkspaceCommand } from "../../../../workspaces/application/commands/WorkspaceCommand";
import type { CurrentActor } from "../../../../workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../../workspaces/application/ports/CurrentWorkspace";
import type {
  CommitResult,
  WorkspaceUnitOfWork,
} from "../../../../workspaces/application/ports/WorkspaceUnitOfWork";
import {
  createCollaborativeTextViewModel,
  type CollaborativeTextProjection,
  type CollaborativeTextViewModel,
} from "../CollaborativeTextViewModel";

const WORKSPACE_ID = "workspace-1";
const OTHER_WORKSPACE_ID = "workspace-2";
const ACTOR_ID = "11".repeat(16);
const hash = (suffix: string): string => suffix.padStart(64, "0");
const GENESIS = hash("1");
const LOCAL_1 = hash("2");
const LOCAL_2 = hash("3");
const LOCAL_3 = hash("4");
const REMOTE = hash("a");

const asChangeHash = (value: string): CommitResult["changeHashes"][number] =>
  value as CommitResult["changeHashes"][number];

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const commitResult = (
  changeHash: string,
  heads: readonly string[] = [changeHash]
): CommitResult => ({
  workspaceId: WORKSPACE_ID as CommitResult["workspaceId"],
  changeHashes: [asChangeHash(changeHash)],
  heads: [...heads].sort().map(asChangeHash),
});

const projection = (
  text: string,
  options: {
    readonly workspaceId?: string;
    readonly taskId?: string;
    readonly path?: "title" | "note";
    readonly heads?: readonly string[];
    readonly includedChangeHashes?: readonly string[];
  } = {}
): CollaborativeTextProjection => ({
  workspaceId: options.workspaceId ?? WORKSPACE_ID,
  taskId: options.taskId ?? "task-1",
  path: options.path ?? "title",
  text,
  heads: [...(options.heads ?? [GENESIS])].sort(),
  includedChangeHashes: [...(options.includedChangeHashes ?? [GENESIS])].sort(),
});

const createHarness = (
  options: {
    readonly path?: "title" | "note";
    readonly initialText?: string;
    readonly commit?: WorkspaceUnitOfWork["commit"];
  } = {}
): {
  readonly viewModel: CollaborativeTextViewModel;
  readonly commit: ReturnType<typeof vi.fn<WorkspaceUnitOfWork["commit"]>>;
  readonly requireWorkspaceId: ReturnType<
    typeof vi.fn<CurrentWorkspace["requireId"]>
  >;
  readonly switchWorkspace: (workspaceId: string) => void;
} => {
  let currentWorkspaceId = WORKSPACE_ID;
  const requireWorkspaceId = vi.fn<CurrentWorkspace["requireId"]>(
    () => currentWorkspaceId as ReturnType<CurrentWorkspace["requireId"]>
  );
  const workspace: CurrentWorkspace = {
    getId: () => currentWorkspaceId as ReturnType<CurrentWorkspace["getId"]>,
    requireId: requireWorkspaceId,
  };
  let operation = 0;
  const actor: CurrentActor = {
    require: () => ({ actorId: ACTOR_ID, deviceId: "DEVICE-1" }),
    nextOperationId: () => `operation-${++operation}`,
    auditTime: () => "2026-07-22T08:00:00.000Z",
  };
  const commit = vi.fn<WorkspaceUnitOfWork["commit"]>(
    options.commit ?? (async () => commitResult(LOCAL_1))
  );
  const unitOfWork: WorkspaceUnitOfWork = {
    commit,
    applyRemote: vi.fn(),
  };
  const path = options.path ?? "title";
  const initialText = options.initialText ?? "Task";

  return {
    viewModel: createCollaborativeTextViewModel(
      { workspace, actor, unitOfWork },
      {
        taskId: "task-1",
        path,
        initialProjection: projection(initialText, { path }),
      }
    ),
    commit,
    requireWorkspaceId,
    switchWorkspace: (workspaceId) => {
      currentWorkspaceId = workspaceId;
    },
  };
};

const committedCommand = (
  commit: ReturnType<typeof vi.fn<WorkspaceUnitOfWork["commit"]>>,
  index = 0
): WorkspaceCommand => commit.mock.calls[index][0];

describe("CollaborativeTextViewModel", () => {
  it.each([
    {
      name: "insert",
      initialText: "Task",
      nextText: "Task one",
      splice: { index: 4, deleteCount: 0, insert: " one" },
    },
    {
      name: "delete",
      initialText: "Task one",
      nextText: "Task",
      splice: { index: 4, deleteCount: 4, insert: "" },
    },
    {
      name: "replace",
      initialText: "Task one",
      nextText: "Task two",
      splice: { index: 5, deleteCount: 3, insert: "two" },
    },
  ])(
    "commits one minimal $name command at the projected causal base",
    async ({ initialText, nextText, splice }) => {
      const { viewModel, commit } = createHarness({ initialText });

      viewModel.setText(nextText);
      await viewModel.flush();

      expect(commit).toHaveBeenCalledTimes(1);
      expect(committedCommand(commit)).toEqual({
        type: "SpliceTaskText",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "operation-1",
        taskId: "task-1",
        path: "title",
        baseHeads: [GENESIS],
        ...splice,
      });
      expect(viewModel.getSnapshot()).toMatchObject({
        text: nextText,
        projectedText: initialText,
        dirty: true,
        saving: false,
        error: null,
      });

      expect(
        viewModel.applyProjection(
          projection(nextText, {
            heads: [LOCAL_1],
            includedChangeHashes: [GENESIS, LOCAL_1],
          })
        )
      ).toBe(true);
      expect(viewModel.getSnapshot()).toMatchObject({
        text: nextText,
        projectedText: nextText,
        dirty: false,
      });
    }
  );

  it("does not commit a no-op input", async () => {
    const { viewModel, commit } = createHarness();

    viewModel.setText("Task");
    await viewModel.flush();

    expect(commit).not.toHaveBeenCalled();
    expect(viewModel.getSnapshot().dirty).toBe(false);
  });

  it("constructs rapid commands lazily and advances the local branch from changeHashes, never merged heads", async () => {
    const first = deferred<CommitResult>();
    const { viewModel, commit } = createHarness({
      initialText: "A",
      commit: vi
        .fn<WorkspaceUnitOfWork["commit"]>()
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce(commitResult(LOCAL_2, [LOCAL_2, REMOTE])),
    });

    viewModel.setText("AB");
    viewModel.setText("ABC");
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(committedCommand(commit)).toMatchObject({
      baseHeads: [GENESIS],
      index: 1,
      deleteCount: 0,
      insert: "B",
    });

    first.resolve(commitResult(LOCAL_1, [LOCAL_1, REMOTE]));
    await viewModel.flush();

    expect(commit).toHaveBeenCalledTimes(2);
    expect(committedCommand(commit, 1)).toMatchObject({
      baseHeads: [LOCAL_1],
      index: 2,
      deleteCount: 0,
      insert: "C",
    });
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "ABC",
      dirty: true,
      saving: false,
    });
  });

  it("rejects a delayed causal subset after success and does not poison the next edit base", async () => {
    const { viewModel, commit } = createHarness({
      commit: vi
        .fn<WorkspaceUnitOfWork["commit"]>()
        .mockResolvedValueOnce(commitResult(LOCAL_1, [LOCAL_1, REMOTE]))
        .mockResolvedValueOnce(commitResult(LOCAL_2, [LOCAL_2, REMOTE])),
    });
    const delayedInitial = projection("Task");

    viewModel.setText("Local Task");
    await viewModel.flush();
    expect(viewModel.applyProjection(delayedInitial)).toBe(false);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Local Task",
      projectedText: "Task",
      dirty: true,
    });

    viewModel.setText("Local Task!");
    await viewModel.flush();

    expect(committedCommand(commit, 1)).toMatchObject({
      baseHeads: [LOCAL_1],
      index: 10,
      deleteCount: 0,
      insert: "!",
    });
    expect(
      viewModel.applyProjection(
        projection("Remote Local Task!", {
          heads: [LOCAL_2, REMOTE],
          includedChangeHashes: [GENESIS, LOCAL_1, LOCAL_2, REMOTE],
        })
      )
    ).toBe(true);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Remote Local Task!",
      projectedText: "Remote Local Task!",
      dirty: false,
    });
  });

  it("rejects a non-monotonic projection even when it arrives later", () => {
    const { viewModel } = createHarness();
    const newer = projection("Remote Task", {
      heads: [REMOTE],
      includedChangeHashes: [GENESIS, REMOTE],
    });

    expect(viewModel.applyProjection(newer)).toBe(true);
    expect(viewModel.applyProjection(projection("Task"))).toBe(false);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Remote Task",
      projectedText: "Remote Task",
    });
  });

  it("accepts a projection with only the first queued change without clearing the second edit", async () => {
    const first = deferred<CommitResult>();
    const second = deferred<CommitResult>();
    const { viewModel, commit } = createHarness({
      initialText: "ABCD",
      commit: vi
        .fn<WorkspaceUnitOfWork["commit"]>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    });
    viewModel.focus();
    viewModel.setText("ABXCD");
    viewModel.setText("ABXYCD");
    first.resolve(commitResult(LOCAL_1));
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(2));

    expect(
      viewModel.applyProjection(
        projection("ABXCD", {
          heads: [LOCAL_1],
          includedChangeHashes: [GENESIS, LOCAL_1],
        })
      )
    ).toBe(true);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "ABXYCD",
      projectedText: "ABXCD",
      dirty: true,
    });

    second.resolve(commitResult(LOCAL_2, [LOCAL_2, REMOTE]));
    await viewModel.flush();
    expect(committedCommand(commit, 1)).toMatchObject({
      baseHeads: [LOCAL_1],
      index: 3,
      insert: "Y",
    });
    expect(viewModel.getSnapshot().dirty).toBe(true);

    expect(
      viewModel.applyProjection(
        projection("RABXYCD", {
          heads: [LOCAL_2, REMOTE],
          includedChangeHashes: [GENESIS, LOCAL_1, LOCAL_2, REMOTE],
        })
      )
    ).toBe(true);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "RABXYCD",
      dirty: false,
    });
  });

  it("keeps a failed edit dirty and retries from the last committed local branch", async () => {
    const failure = new Error("database unavailable");
    const { viewModel, commit } = createHarness({
      commit: vi
        .fn<WorkspaceUnitOfWork["commit"]>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(commitResult(LOCAL_1)),
    });

    viewModel.setText("Task updated");
    await expect(viewModel.flush()).rejects.toBe(failure);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Task updated",
      dirty: true,
      saving: false,
      error: "database unavailable",
    });

    await viewModel.retry();

    expect(commit).toHaveBeenCalledTimes(2);
    expect(committedCommand(commit, 1)).toMatchObject({
      baseHeads: [GENESIS],
      index: 4,
      deleteCount: 0,
      insert: " updated",
    });
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Task updated",
      dirty: true,
      error: null,
    });
  });

  it("consolidates a partial queue failure on its local branch after accepting a remote projection", async () => {
    const failure = new Error("second commit failed");
    const { viewModel, commit } = createHarness({
      initialText: "ABCD",
      commit: vi
        .fn<WorkspaceUnitOfWork["commit"]>()
        .mockResolvedValueOnce(commitResult(LOCAL_1))
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(commitResult(LOCAL_3, [LOCAL_3, REMOTE])),
    });
    viewModel.setText("ABXCD");
    viewModel.setText("ABXYCD");
    viewModel.setText("ABXYZCD");

    await expect(viewModel.flush()).rejects.toBe(failure);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(
      viewModel.applyProjection(
        projection("RABXCD", {
          heads: [LOCAL_1, REMOTE],
          includedChangeHashes: [GENESIS, LOCAL_1, REMOTE],
        })
      )
    ).toBe(true);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "ABXYZCD",
      projectedText: "RABXCD",
      dirty: true,
    });

    await viewModel.retry();

    expect(commit).toHaveBeenCalledTimes(3);
    expect(committedCommand(commit, 2)).toMatchObject({
      baseHeads: [LOCAL_1],
      index: 3,
      deleteCount: 0,
      insert: "YZ",
    });
    expect(
      viewModel.applyProjection(
        projection("RABXYZCD", {
          heads: [LOCAL_3, REMOTE],
          includedChangeHashes: [GENESIS, LOCAL_1, LOCAL_3, REMOTE],
        })
      )
    ).toBe(true);
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "RABXYZCD",
      dirty: false,
      error: null,
    });
  });

  it("does not replace a dirty focused buffer with a causally accepted projection", async () => {
    const pending = deferred<CommitResult>();
    const { viewModel } = createHarness({ commit: () => pending.promise });

    viewModel.focus();
    viewModel.setText("Local Task");
    expect(
      viewModel.applyProjection(
        projection("Remote Task", {
          heads: [REMOTE],
          includedChangeHashes: [GENESIS, REMOTE],
        })
      )
    ).toBe(true);

    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Local Task",
      projectedText: "Remote Task",
      focused: true,
      dirty: true,
    });

    pending.resolve(commitResult(LOCAL_1, [LOCAL_1, REMOTE]));
    await viewModel.flush();
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "Local Task",
      dirty: true,
      saving: false,
    });
  });

  it("freezes the workspace identity for the lifetime of the session", async () => {
    const { viewModel, commit, requireWorkspaceId, switchWorkspace } =
      createHarness();
    expect(requireWorkspaceId).toHaveBeenCalledTimes(1);
    switchWorkspace(OTHER_WORKSPACE_ID);

    viewModel.setText("Task updated");
    await viewModel.flush();

    expect(committedCommand(commit)).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
    expect(requireWorkspaceId).toHaveBeenCalledTimes(1);
    expect(() =>
      viewModel.applyProjection(
        projection("Wrong workspace", { workspaceId: OTHER_WORKSPACE_ID })
      )
    ).toThrow("Projection identity does not match the editing session");
  });

  it("preserves emoji UTF-16 boundaries in a generated command", async () => {
    const { viewModel, commit } = createHarness({ initialText: "A😀B" });

    viewModel.setText("A😀XB");
    await viewModel.flush();

    expect(committedCommand(commit)).toMatchObject({
      baseHeads: [GENESIS],
      index: 3,
      deleteCount: 0,
      insert: "X",
    });
  });

  it("rejects a blank title before command creation", async () => {
    const { viewModel, commit } = createHarness();

    viewModel.setText("   ");
    await expect(viewModel.flush()).rejects.toThrow("Title cannot be empty");

    expect(commit).not.toHaveBeenCalled();
    expect(viewModel.getSnapshot()).toMatchObject({
      text: "   ",
      dirty: true,
      error: "Title cannot be empty",
    });
  });

  it("uses the note path and allows an empty note", async () => {
    const { viewModel, commit } = createHarness({
      path: "note",
      initialText: "note",
    });

    viewModel.setText("");
    await viewModel.flush();

    expect(committedCommand(commit)).toMatchObject({
      path: "note",
      baseHeads: [GENESIS],
      index: 0,
      deleteCount: 4,
      insert: "",
    });
  });
});
