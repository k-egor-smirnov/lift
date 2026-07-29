import { describe, expect, it } from "vitest";

import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { AutomergeWorkspaceDocument } from "../AutomergeWorkspaceDocument";
import { WorkspaceProjector } from "../WorkspaceProjector";

const ACTOR = "11".repeat(16);
const AUDIT_TIME = "2026-07-22T08:00:00.000Z";

describe("WorkspaceProjector deterministic audit/statistics", () => {
  it("projects one logical row per lifecycle epoch and one canonical concurrent review", () => {
    const state = createEmptyWorkspace("workspace-1", "UTC", "00:00");
    state.tasks.task = {
      id: "task",
      title: "Task",
      note: "",
      category: "FOCUS",
      position: { key: "a0", actorId: ACTOR },
      created: { deviceId: "device", auditTime: AUDIT_TIME },
      inboxEnteredOn: "2026-07-19",
      deferredUntil: null,
      originalCategory: null,
      completion: "completed",
      completionEpoch: 3,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    state.completionRecords = {
      "complete-a": {
        id: "complete-a",
        taskId: "task",
        effectiveDate: "2026-07-22",
        kind: "completed",
        fromCompletionEpoch: 0,
        completionEpoch: 1,
        categoryAtCompletion: "SIMPLE",
        actorId: "22".repeat(16),
        auditTime: "2030-01-01T00:00:00.000Z",
      },
      "complete-b": {
        id: "complete-b",
        taskId: "task",
        effectiveDate: "2026-07-21",
        kind: "completed",
        fromCompletionEpoch: 0,
        completionEpoch: 1,
        categoryAtCompletion: "FOCUS",
        actorId: ACTOR,
        auditTime: "2020-01-01T00:00:00.000Z",
      },
      reopen: {
        id: "reopen",
        taskId: "task",
        effectiveDate: "2026-07-22",
        kind: "reopened",
        fromCompletionEpoch: 1,
        completionEpoch: 2,
        categoryAtCompletion: null,
        actorId: ACTOR,
        auditTime: AUDIT_TIME,
      },
      "complete-again": {
        id: "complete-again",
        taskId: "task",
        effectiveDate: "2026-07-23",
        kind: "completed",
        fromCompletionEpoch: 2,
        completionEpoch: 3,
        categoryAtCompletion: "SIMPLE",
        actorId: ACTOR,
        auditTime: AUDIT_TIME,
      },
    };
    state.auditRecords = {
      "review-late": {
        id: "review-late",
        kind: "task.category-changed.v1",
        taskId: "task",
        effectiveDate: "2026-07-20",
        actorId: ACTOR,
        auditTime: "2020-01-01T00:00:00.000Z",
        data: {
          fromCategory: "INBOX",
          toCategory: "SIMPLE",
          firstInboxReview: "true",
        },
      },
      "review-canonical": {
        id: "review-canonical",
        kind: "task.category-changed.v1",
        taskId: "task",
        effectiveDate: "2026-07-19",
        actorId: "22".repeat(16),
        auditTime: "2030-01-01T00:00:00.000Z",
        data: {
          fromCategory: "INBOX",
          toCategory: "FOCUS",
          firstInboxReview: "true",
        },
      },
    };
    const document = AutomergeWorkspaceDocument.create(state, ACTOR);
    const projector = new WorkspaceProjector();
    const first = projector.project(document, "2026-07-23", 1);
    const second = projector.project(document, "2026-07-23", 999);

    expect(first.audit).toEqual(second.audit);
    expect(first.dailyStatistics).toEqual(second.dailyStatistics);
    expect(
      first.audit.filter(({ source }) => source === "completion")
    ).toHaveLength(3);
    expect(first.dailyStatistics).toEqual([
      {
        workspaceId: "workspace-1",
        date: "2026-07-19",
        simpleCompleted: 0,
        focusCompleted: 0,
        inboxReviewed: 1,
      },
      {
        workspaceId: "workspace-1",
        date: "2026-07-21",
        simpleCompleted: 0,
        focusCompleted: 1,
        inboxReviewed: 0,
      },
      {
        workspaceId: "workspace-1",
        date: "2026-07-23",
        simpleCompleted: 1,
        focusCompleted: 0,
        inboxReviewed: 0,
      },
    ]);
  });
});
