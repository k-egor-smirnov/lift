import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../../../shared/domain/Result";
import {
  ACTOR_ID,
  AUDIT_TIME,
  OPERATION_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "../../../../../shared/application/use-cases/__tests__/workspaceUseCaseTestUtils";
import {
  UpdateWorkspaceSettingsUseCase,
  type UpdateWorkspaceSettingsRequest,
} from "../UpdateWorkspaceSettingsUseCase";

describe("UpdateWorkspaceSettingsUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: UpdateWorkspaceSettingsUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies(false);
    useCase = new UpdateWorkspaceSettingsUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("commits only changed fields with their canonical prior values", async () => {
    const result = await useCase.execute({
      timezone: "UTC",
      startOfDay: "09:00",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "UpdateWorkspaceSettings",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      auditTime: AUDIT_TIME,
      timezone: "UTC",
      fromTimezone: "Europe/Moscow",
    });
  });

  it("returns a same-value no-op before command authorship", async () => {
    const result = await useCase.execute({
      timezone: "Europe/Moscow",
      startOfDay: "09:00",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.actor.nextOperationId).not.toHaveBeenCalled();
    expect(dependencies.actor.auditTime).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "EMPTY_PATCH"],
    [{ timezone: "not/a-zone" }, "INVALID_TIMEZONE"],
    [{ startOfDay: "24:00" }, "INVALID_START_OF_DAY"],
  ] as const)("rejects %j before reading or writing", async (request, code) => {
    const result = await useCase.execute(
      request as UpdateWorkspaceSettingsRequest
    );

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(code);
    expect(dependencies.repository.getWorkspace).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps a commit failure through Result", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("disk full")
    );
    const result = await useCase.execute({ startOfDay: "04:00" });
    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
  });
});
