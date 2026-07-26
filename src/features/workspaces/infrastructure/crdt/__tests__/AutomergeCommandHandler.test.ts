import { describe, expect, it } from "vitest";

import type { WorkspaceCommand } from "../../../application/commands/WorkspaceCommand";
import { comparePositions } from "../../../domain/ConflictPolicy";
import {
  createEmptyWorkspace,
  type TaskCrdtState,
  type WorkspaceState,
} from "../../../domain/WorkspaceState";
import { AutomergeCommandHandler } from "../AutomergeCommandHandler";
import { AutomergeWorkspaceDocument } from "../AutomergeWorkspaceDocument";

const WORKSPACE_ID = "workspace-1";
const ACTOR_A = "11".repeat(16);
const ACTOR_B = "22".repeat(16);
const ACTOR_C = "33".repeat(16);
const ACTOR_D = "44".repeat(16);
const AUDIT_TIME = "2026-07-22T08:00:00.000Z";

const task = (
  id: string,
  position: TaskCrdtState["position"],
  completion: TaskCrdtState["completion"] = "active"
): TaskCrdtState => ({
  id,
  title: id,
  note: "",
  category: "INBOX",
  position,
  created: { deviceId: "DEVICE", auditTime: AUDIT_TIME },
  inboxEnteredOn: "2026-07-22",
  deferredUntil: null,
  originalCategory: null,
  completion,
  completionEpoch: completion === "completed" ? 1 : 0,
  tags: { adds: {}, removedDots: {} },
  deletionDots: {},
});

const handler = (): AutomergeCommandHandler =>
  new AutomergeCommandHandler({
    create: async () => "occurrence-id",
  });

const documentWith = (
  build: (state: WorkspaceState) => void
): AutomergeWorkspaceDocument => {
  const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
  build(state);
  return AutomergeWorkspaceDocument.create(state, ACTOR_A);
};

const completionCommand = (
  type: "CompleteTask" | "ReopenTask",
  operationId: string,
  actorId = ACTOR_A
): Extract<WorkspaceCommand, { type: "CompleteTask" | "ReopenTask" }> =>
  type === "CompleteTask"
    ? {
        type,
        workspaceId: WORKSPACE_ID,
        actorId,
        operationId,
        taskId: "task",
        effectiveDate: "2026-07-22",
        auditTime: AUDIT_TIME,
        categoryAtCompletion: "INBOX",
      }
    : {
        type,
        workspaceId: WORKSPACE_ID,
        actorId,
        operationId,
        taskId: "task",
        effectiveDate: "2026-07-22",
        auditTime: AUDIT_TIME,
      };

describe("AutomergeCommandHandler repaired invariants", () => {
  it("creates a task and its day selection in one Automerge change", async () => {
    const document = documentWith((state) => {
      state.dailySelections["2026-07-22"] = {
        adds: { existing: { "existing-dot": true } },
        removedDots: {},
      };
    });
    const changes = await handler().handle(document, {
      type: "CreateTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "create-today",
      taskId: "today-task",
      title: "Atomic Today task",
      category: "INBOX",
      effectiveDate: "2026-07-22",
      addToDate: "2026-07-22",
      deviceId: "DEVICE",
      auditTime: AUDIT_TIME,
    });

    expect(changes).toHaveLength(1);
    expect(document.value().tasks["today-task"]?.title).toBe(
      "Atomic Today task"
    );
    expect(
      document.value().dailySelections["2026-07-22"]?.adds["today-task"]
    ).toEqual({ "create-today": true });
    expect(
      document.value().dailySelections["2026-07-22"]?.adds.existing
    ).toEqual({ "existing-dot": true });
  });

  it("makes already-target complete and reopen commands atomic no-ops", async () => {
    const document = documentWith((state) => {
      state.tasks.task = task("task", { key: "a0", actorId: ACTOR_A });
    });
    const commands = handler();

    const alreadyActive = await commands.handle(
      document,
      completionCommand("ReopenTask", "reopen-active")
    );
    const completed = await commands.handle(
      document,
      completionCommand("CompleteTask", "complete-transition")
    );
    const alreadyCompleted = await commands.handle(
      document,
      completionCommand("CompleteTask", "complete-again")
    );
    const reopened = await commands.handle(
      document,
      completionCommand("ReopenTask", "reopen-transition")
    );
    const activeAgain = await commands.handle(
      document,
      completionCommand("ReopenTask", "reopen-again")
    );

    expect(alreadyActive).toEqual([]);
    expect(completed).toHaveLength(1);
    expect(alreadyCompleted).toEqual([]);
    expect(reopened).toHaveLength(1);
    expect(activeAgain).toEqual([]);
    expect(Object.keys(document.value().completionRecords)).toEqual([
      "complete-transition",
      "reopen-transition",
    ]);
    expect(
      document.value().completionRecords["complete-transition"]
    ).toMatchObject({
      fromCompletionEpoch: 0,
      completionEpoch: 1,
      categoryAtCompletion: "INBOX",
    });
    expect(
      document.value().completionRecords["reopen-transition"]
    ).toMatchObject({
      fromCompletionEpoch: 1,
      completionEpoch: 2,
      categoryAtCompletion: null,
    });
  });

  it("deduplicates concurrent lifecycle intent by epoch and never lets a stale ancestor roll back a reopen", async () => {
    const base = documentWith((state) => {
      state.tasks.task = task("task", { key: "a0", actorId: ACTOR_A });
    });
    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, ACTOR_A);
    const right = AutomergeWorkspaceDocument.load(snapshot, ACTOR_B);
    const commands = handler();

    const completeLeft = await commands.handle(
      left,
      completionCommand("CompleteTask", "complete-left", ACTOR_A)
    );
    const completeRight = await commands.handle(
      right,
      completionCommand("CompleteTask", "complete-right", ACTOR_B)
    );
    const merged = AutomergeWorkspaceDocument.load(snapshot, ACTOR_C);
    merged.apply([...completeRight, ...completeLeft]);

    expect(merged.value().tasks.task).toMatchObject({
      completion: "completed",
      completionEpoch: 1,
    });
    expect(
      Object.values(merged.value().completionRecords).map((record) => [
        record.fromCompletionEpoch,
        record.completionEpoch,
        record.kind,
      ])
    ).toEqual([
      [0, 1, "completed"],
      [0, 1, "completed"],
    ]);

    const reopened = await commands.handle(
      merged,
      completionCommand("ReopenTask", "reopen-after-merge", ACTOR_C)
    );
    const final = AutomergeWorkspaceDocument.load(snapshot, ACTOR_D);
    final.apply([...completeRight, ...completeLeft, ...reopened]);

    expect(final.value().tasks.task).toMatchObject({
      completion: "active",
      completionEpoch: 2,
    });
  });

  it("records explicit Inbox entry and retains concurrent first-review candidates", async () => {
    const base = documentWith(() => undefined);
    await handler().handle(base, {
      type: "CreateTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "create-inbox",
      taskId: "task",
      title: "Inbox task",
      category: "INBOX",
      effectiveDate: "2026-07-22",
      deviceId: "DEVICE",
      auditTime: AUDIT_TIME,
    });
    expect(base.value().tasks.task.inboxEnteredOn).toBe("2026-07-22");

    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, ACTOR_A);
    const right = AutomergeWorkspaceDocument.load(snapshot, ACTOR_B);
    const commands = handler();
    const leave = async (
      document: AutomergeWorkspaceDocument,
      actorId: string,
      operationId: string,
      category: "SIMPLE" | "FOCUS"
    ) =>
      commands.handle(document, {
        type: "ChangeTaskCategory",
        workspaceId: WORKSPACE_ID,
        actorId,
        operationId,
        taskId: "task",
        fromCategory: "INBOX",
        category,
        effectiveDate: "2026-07-23",
        auditTime: AUDIT_TIME,
      });

    const leftChanges = await leave(left, ACTOR_A, "review-left", "SIMPLE");
    const rightChanges = await leave(right, ACTOR_B, "review-right", "FOCUS");
    const merged = AutomergeWorkspaceDocument.load(snapshot, ACTOR_C);
    merged.apply([...rightChanges, ...leftChanges]);

    const candidates = Object.values(merged.value().auditRecords).filter(
      (record) => record.kind === "task.category-changed.v1"
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.every((record) => record.taskId === "task")).toBe(true);
    expect(
      candidates.every(
        (record) =>
          record.effectiveDate === "2026-07-23" &&
          record.data.firstInboxReview === "true"
      )
    ).toBe(true);

    await commands.handle(merged, {
      type: "ChangeTaskCategory",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_D,
      operationId: "reenter-inbox",
      taskId: "task",
      fromCategory: merged.value().tasks.task.category,
      category: "INBOX",
      effectiveDate: "2026-07-24",
      auditTime: "2026-07-24T08:00:00.000Z",
    });
    expect(merged.value().tasks.task.inboxEnteredOn).toBe("2026-07-24");
  });

  it("merges disjoint offline settings patches and binds exact retries to prior/target values", async () => {
    const base = documentWith(() => undefined);
    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, ACTOR_A);
    const right = AutomergeWorkspaceDocument.load(snapshot, ACTOR_B);
    const commands = handler();
    const timezoneCommand = {
      type: "UpdateWorkspaceSettings" as const,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "settings-timezone",
      timezone: "Europe/Moscow",
      fromTimezone: "UTC",
      auditTime: AUDIT_TIME,
    };
    const leftChanges = await commands.handle(left, timezoneCommand);
    const rightChanges = await commands.handle(right, {
      type: "UpdateWorkspaceSettings",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_B,
      operationId: "settings-start",
      startOfDay: "09:00",
      fromStartOfDay: "00:00",
      auditTime: AUDIT_TIME,
    });
    const merged = AutomergeWorkspaceDocument.load(snapshot, ACTOR_C);
    merged.apply([...rightChanges, ...leftChanges]);

    expect(merged.value().settings).toEqual({
      timezone: "Europe/Moscow",
      startOfDay: "09:00",
    });
    expect(Object.keys(merged.value().auditRecords)).toEqual([
      "settings-start",
      "settings-timezone",
    ]);

    await commands.handle(merged, {
      type: "UpdateWorkspaceSettings",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_C,
      operationId: "settings-timezone-later",
      timezone: "Asia/Tokyo",
      fromTimezone: "Europe/Moscow",
      auditTime: "2026-07-22T09:00:00.000Z",
    });
    await expect(commands.handle(merged, timezoneCommand)).resolves.toEqual([]);
    expect(merged.value().settings.timezone).toBe("Asia/Tokyo");
  });

  it("rejects an empty or unbound settings patch", async () => {
    const document = documentWith(() => undefined);
    const base = {
      type: "UpdateWorkspaceSettings",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "invalid-settings",
      auditTime: AUDIT_TIME,
    };

    await expect(
      handler().handle(document, base as WorkspaceCommand)
    ).rejects.toThrow("patch is empty");
    await expect(
      handler().handle(document, {
        ...base,
        timezone: "Europe/Moscow",
      } as WorkspaceCommand)
    ).rejects.toThrow("prior value");
  });

  it("validates a reused lifecycle operation before target-state idempotency", async () => {
    const document = documentWith((state) => {
      state.tasks.task = task("task", { key: "a0", actorId: ACTOR_A });
    });
    const commands = handler();
    const command = completionCommand("CompleteTask", "complete-once");

    await commands.handle(document, command);

    await expect(
      commands.handle(document, {
        ...command,
        auditTime: "2026-07-22T09:00:00.000Z",
      })
    ).rejects.toThrow(
      "operationId already identifies another completion record"
    );
  });

  it("rebalances equal-key canonical neighbours inside one MoveTask change", async () => {
    const document = documentWith((state) => {
      state.tasks.left = task("left", { key: "a0", actorId: ACTOR_A });
      state.tasks.right = task("right", { key: "a0", actorId: ACTOR_B });
      state.tasks.moving = task("moving", { key: "a1", actorId: ACTOR_C });
    });

    const changes = await handler().handle(document, {
      type: "MoveTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_D,
      operationId: "move-between-equal-keys",
      taskId: "moving",
      leftTaskId: "left",
      rightTaskId: "right",
    });
    const state = document.value();
    const ordered = Object.values(state.tasks).sort((left, right) =>
      comparePositions(
        { ...left.position, taskId: left.id },
        { ...right.position, taskId: right.id }
      )
    );

    expect(changes).toHaveLength(1);
    expect(ordered.map(({ id }) => id)).toEqual(["left", "moving", "right"]);
    expect(new Set(ordered.map(({ position }) => position.key)).size).toBe(3);
    expect(state.tasks.left.position.actorId).toBe(ACTOR_A);
    expect(state.tasks.right.position.actorId).toBe(ACTOR_B);
    expect(state.tasks.moving.position.actorId).toBe(ACTOR_D);
  });

  it("fails closed on reversed full-canonical bounds and non-neighbour bounds", async () => {
    const document = documentWith((state) => {
      state.tasks.first = task("first", { key: "a0", actorId: ACTOR_A });
      state.tasks.middle = task("middle", { key: "a1", actorId: ACTOR_B });
      state.tasks.last = task("last", { key: "a2", actorId: ACTOR_C });
      state.tasks.moving = task("moving", { key: "a3", actorId: ACTOR_D });
    });
    const commands = handler();

    await expect(
      commands.handle(document, {
        type: "MoveTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_A,
        operationId: "reversed",
        taskId: "moving",
        leftTaskId: "last",
        rightTaskId: "first",
      })
    ).rejects.toThrow("Invalid task position bounds");
    await expect(
      commands.handle(document, {
        type: "MoveTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_A,
        operationId: "not-neighbours",
        taskId: "moving",
        leftTaskId: "first",
        rightTaskId: "last",
      })
    ).rejects.toThrow("actual canonical neighbours");
  });

  it("validates operation actor reuse even when the reused text payload is a semantic no-op", async () => {
    const document = documentWith((state) => {
      state.tasks.task = task("task", { key: "a0", actorId: ACTOR_A });
      state.tasks.task.note = "A";
    });
    const commands = handler();
    const baseHeads = document.heads();
    await commands.handle(document, {
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "reused-text-operation",
      taskId: "task",
      path: "note",
      baseHeads,
      index: 1,
      deleteCount: 0,
      insert: "X",
    });

    await expect(
      commands.handle(document, {
        type: "SpliceTaskText",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_A,
        operationId: "reused-text-operation",
        taskId: "task",
        path: "note",
        baseHeads,
        index: 0,
        deleteCount: 0,
        insert: "",
      })
    ).rejects.toThrow("operation actor");
  });

  it("does not create a move change for the sole task with null neighbours", async () => {
    const document = documentWith((state) => {
      state.tasks.task = task("task", { key: "a0", actorId: ACTOR_A });
    });
    const beforeHeads = document.heads();

    const changes = await handler().handle(document, {
      type: "MoveTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_A,
      operationId: "move-sole-task",
      taskId: "task",
      leftTaskId: null,
      rightTaskId: null,
    });

    expect(changes).toEqual([]);
    expect(document.heads()).toEqual(beforeHeads);
  });
});
