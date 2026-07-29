import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import { ResultUtils } from "../../../domain/Result";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { CreateSystemLogUseCase } from "../CreateSystemLogUseCase";

describe("CreateSystemLogUseCase", () => {
  const commit = vi.fn().mockResolvedValue({
    workspaceId: WorkspaceId("workspace-1"),
    changeHashes: [],
    heads: [],
  });
  const useCase = new CreateSystemLogUseCase(
    {
      getId: () => WorkspaceId("workspace-1"),
      requireId: () => WorkspaceId("workspace-1"),
    },
    { commit, applyRemote: vi.fn() },
    {
      require: () => ({ actorId: "actor-1", deviceId: "device-1" }),
      nextOperationId: () => "audit-1",
      auditTime: () => "2026-07-22T08:00:00Z",
    }
  );

  beforeEach(() => vi.clearAllMocks());

  it("appends a deterministic immutable audit command", async () => {
    const taskId = TaskId.generate().value;
    const result = await useCase.execute({
      taskId,
      action: "completed",
      message: "Completed",
      metadata: { categoryAtCompletion: "FOCUS", count: 1 },
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(commit).toHaveBeenCalledWith({
      type: "AppendAuditRecord",
      workspaceId: "workspace-1",
      actorId: "actor-1",
      operationId: "audit-1",
      auditRecordId: "audit-1",
      auditKind: "completed",
      auditTime: "2026-07-22T08:00:00Z",
      taskId,
      effectiveDate: null,
      data: {
        type: "SYSTEM",
        message: "Completed",
        categoryAtCompletion: "FOCUS",
        count: "1",
      },
    });
  });

  it("maps device-wide audit to a null task association", async () => {
    await useCase.execute({ taskId: "system", action: "daily_modal_check" });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: null })
    );
  });

  it("rejects malformed task IDs before authorship", async () => {
    const result = await useCase.execute({ taskId: "bad", action: "created" });
    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "INVALID_TASK_ID"
    );
    expect(commit).not.toHaveBeenCalled();
  });
});
