import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { RevertTaskCompletionUseCase } from "../RevertTaskCompletionUseCase";
import {
  ACTOR_ID,
  AUDIT_TIME,
  EFFECTIVE_DATE,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("RevertTaskCompletionUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: RevertTaskCompletionUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    dependencies.state.tasks[TASK_ID].completion = "completed";
    useCase = new RevertTaskCompletionUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("commits exactly one ReopenTask command using the provider date", async () => {
    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "ReopenTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      effectiveDate: EFFECTIVE_DATE,
      auditTime: AUDIT_TIME,
    });
  });

  it("accepts a valid explicit date without consulting the clock", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      effectiveDate: "2026-07-19",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveDate: "2026-07-19" })
    );
  });

  it("returns success without command metadata or commit when already active", async () => {
    dependencies.state.tasks[TASK_ID].completion = "active";

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

  it("rejects invalid date, missing task, and maps commit failure", async () => {
    const invalid = await useCase.execute({
      taskId: TASK_ID,
      effectiveDate: "bad",
    });
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isFailure(invalid) && invalid.error.code).toBe(
      "INVALID_DATE"
    );
    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();

    dependencies.state.tasks[TASK_ID] = {
      id: TASK_ID,
      title: "Task",
      note: "",
      category: "SIMPLE",
      position: { key: "a", actorId: ACTOR_ID },
      created: { deviceId: "device", auditTime: AUDIT_TIME },
      inboxEnteredOn: null,
      deferredUntil: null,
      originalCategory: null,
      completion: "completed",
      completionEpoch: 1,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("disk")
    );
    const failed = await useCase.execute({ taskId: TASK_ID });
    expect(ResultUtils.isFailure(failed) && failed.error.code).toBe(
      "TRANSACTION_FAILED"
    );
  });
});
