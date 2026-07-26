import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import { ResultUtils } from "../../../domain/Result";
import { TaskId } from "../../../domain/value-objects/TaskId";
import { CreateUserLogUseCase } from "../CreateUserLogUseCase";

describe("CreateUserLogUseCase", () => {
  const commit = vi.fn().mockResolvedValue({
    workspaceId: WorkspaceId("workspace-1"),
    changeHashes: [],
    heads: [],
  });
  const useCase = new CreateUserLogUseCase(
    {
      getId: () => WorkspaceId("workspace-1"),
      requireId: () => WorkspaceId("workspace-1"),
    },
    { commit, applyRemote: vi.fn() },
    {
      require: () => ({ actorId: "actor-1", deviceId: "device-1" }),
      nextOperationId: () => "audit-user-1",
      auditTime: () => "2026-07-22T08:00:00Z",
    }
  );

  beforeEach(() => vi.clearAllMocks());

  it("trims and appends a user audit record", async () => {
    const taskId = TaskId.generate().value;
    const result = await useCase.execute({
      taskId,
      message: "  Working on it  ",
      metadata: { priority: "high" },
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "AppendAuditRecord",
        taskId,
        auditKind: "user_log",
        data: { type: "USER", message: "Working on it", priority: "high" },
      })
    );
  });

  it.each([
    ["", "EMPTY_MESSAGE"],
    ["   ", "EMPTY_MESSAGE"],
    ["a".repeat(501), "MESSAGE_TOO_LONG"],
  ])("rejects invalid message %#", async (message, code) => {
    const result = await useCase.execute({ message });
    expect(ResultUtils.isFailure(result) && result.error.code).toBe(code);
    expect(commit).not.toHaveBeenCalled();
  });

  it("allows an exact 500-character message", async () => {
    expect(
      ResultUtils.isSuccess(await useCase.execute({ message: "a".repeat(500) }))
    ).toBe(true);
  });
});
