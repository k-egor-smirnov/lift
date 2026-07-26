import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { CompleteTaskUseCase } from "../CompleteTaskUseCase";
import {
  ACTOR_ID,
  AUDIT_TIME,
  EFFECTIVE_DATE,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeTaskState,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("CompleteTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: CompleteTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new CompleteTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("commits an explicit dated completion with audit metadata", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      effectiveDate: "2026-07-20",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "CompleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      effectiveDate: "2026-07-20",
      auditTime: AUDIT_TIME,
      categoryAtCompletion: "SIMPLE",
    });
  });

  it("derives an implicit date from canonical workspace settings", async () => {
    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).toHaveBeenCalledWith({
      timezone: "Europe/Moscow",
      startOfDay: "09:00",
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveDate: EFFECTIVE_DATE })
    );
  });

  it("returns success without command metadata or commit when already completed", async () => {
    dependencies.state.tasks[TASK_ID].completion = "completed";
    dependencies.state.tasks[TASK_ID].completionEpoch = 1;

    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
    expect(dependencies.actor.nextOperationId).not.toHaveBeenCalled();
    expect(dependencies.actor.auditTime).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps audit metadata failure to Result without calling the unit of work", async () => {
    vi.mocked(dependencies.actor.auditTime).mockImplementationOnce(() => {
      throw new Error("actor locked");
    });

    await expect(
      useCase.execute({ taskId: TASK_ID, effectiveDate: "2026-07-20" })
    ).resolves.toMatchObject({
      success: false,
      error: {
        code: "AUTHORSHIP_FAILED",
        message: expect.stringContaining("actor locked"),
      },
    });
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("rejects an invalid explicit date before commit", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      effectiveDate: "2026-02-30",
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "INVALID_DATE"
    );
    expect(dependencies.repository.getWorkspace).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps missing task and commit failures", async () => {
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({ taskId: TASK_ID });
    dependencies.state.tasks[TASK_ID] = makeTaskState();
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("disk")
    );
    const failed = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(ResultUtils.isFailure(failed) && failed.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
