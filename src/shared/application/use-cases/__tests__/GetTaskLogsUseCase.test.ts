import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLogEntry } from "../../../../features/workspaces/application/ports/AuditLogRepository";
import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import { ResultUtils } from "../../../domain/Result";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { GetTaskLogsUseCase } from "../GetTaskLogsUseCase";

const entry = (
  recordId: string,
  overrides: Partial<AuditLogEntry> = {}
): AuditLogEntry => ({
  workspaceId: "workspace-1",
  source: "audit",
  recordId,
  taskId: null,
  effectiveDate: null,
  kind: "created",
  actorId: "actor-1",
  auditTime: `2026-07-22T08:00:0${recordId}.000Z`,
  data: { type: "SYSTEM", message: `message-${recordId}` },
  ...overrides,
});

describe("GetTaskLogsUseCase", () => {
  const query = vi.fn();
  const useCase = new GetTaskLogsUseCase(
    {
      getId: () => WorkspaceId("workspace-1"),
      requireId: () => WorkspaceId("workspace-1"),
    },
    { query }
  );

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({
      entries: [
        entry("2"),
        entry("1", { data: { type: "USER", message: "note" } }),
      ],
      nextCursor: null,
    });
  });

  it("maps immutable audit projections to compatibility log entries", async () => {
    const result = await useCase.execute();
    expect(ResultUtils.isSuccess(result)).toBe(true);
    if (!ResultUtils.isSuccess(result)) return;
    expect(result.data.logs).toMatchObject([
      { id: "audit:2", type: "SYSTEM", message: "message-2" },
      { id: "audit:1", type: "USER", message: "note" },
    ]);
    expect(result.data.pagination.totalCount).toBe(2);
  });

  it("filters by task and log type after validating the task ID", async () => {
    const taskId = TaskId.generate().value;
    const result = await useCase.execute({ taskId, logType: "USER" });
    expect(ResultUtils.isSuccess(result) && result.data.logs).toHaveLength(1);
    expect(query).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      taskId,
      limit: 100,
    });
  });

  it("rejects malformed task IDs without querying", async () => {
    const result = await useCase.execute({ taskId: "bad" });
    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "INVALID_TASK_ID"
    );
    expect(query).not.toHaveBeenCalled();
  });
});
