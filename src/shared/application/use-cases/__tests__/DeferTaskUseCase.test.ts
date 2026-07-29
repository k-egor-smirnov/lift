import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { DeferTaskUseCase } from "../DeferTaskUseCase";
import {
  ACTOR_ID,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("DeferTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: DeferTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new DeferTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("commits one date-only DeferTask command", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      deferredUntil: "2026-08-01",
    });

    expect(ResultUtils.isSuccess(result) && result.data).toEqual({
      taskId: TASK_ID,
      deferredUntil: "2026-08-01",
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "DeferTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      deferredUntil: "2026-08-01",
    });
  });

  it("validates date and task before commit", async () => {
    const invalidDate = await useCase.execute({
      taskId: TASK_ID,
      deferredUntil: "2026-02-30",
    });
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({
      taskId: TASK_ID,
      deferredUntil: "2026-08-01",
    });

    expect(ResultUtils.isFailure(invalidDate) && invalidDate.error.code).toBe(
      "INVALID_DEFERRAL_DATE"
    );
    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps commit failure", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("disk")
    );
    const result = await useCase.execute({
      taskId: TASK_ID,
      deferredUntil: "2026-08-01",
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
