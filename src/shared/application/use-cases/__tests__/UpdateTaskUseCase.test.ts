import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { TaskCategory } from "../../../domain/types";
import { UpdateTaskUseCase } from "../UpdateTaskUseCase";
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

describe("UpdateTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: UpdateTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new UpdateTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("maps the single-purpose request to one ChangeTaskCategory command", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      category: TaskCategory.FOCUS,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "ChangeTaskCategory",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      fromCategory: "SIMPLE",
      category: "FOCUS",
      effectiveDate: EFFECTIVE_DATE,
      auditTime: AUDIT_TIME,
    });
  });

  it("returns an unchanged-category no-op before date, authorship, or UoW", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      category: TaskCategory.SIMPLE,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
    expect(dependencies.actor.nextOperationId).not.toHaveBeenCalled();
    expect(dependencies.actor.auditTime).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("validates the task ID before reading canonical state", async () => {
    const result = await useCase.execute({
      taskId: "invalid",
      category: TaskCategory.SIMPLE,
    });

    expect(ResultUtils.isFailure(result)).toBe(true);
    if (ResultUtils.isFailure(result))
      expect(result.error.code).toBe("INVALID_TASK_ID");
    expect(dependencies.repository.getWorkspace).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("rejects a missing task and DEFERRED without committing", async () => {
    dependencies = makeUseCaseDependencies(false);
    useCase = new UpdateTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );

    const missing = await useCase.execute({
      taskId: TASK_ID,
      category: TaskCategory.FOCUS,
    });
    const deferred = await useCase.execute({
      taskId: TASK_ID,
      category: TaskCategory.DEFERRED,
    });

    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(ResultUtils.isFailure(deferred) && deferred.error.code).toBe(
      "INVALID_CATEGORY"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps commit failure without issuing a second command", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("write failed")
    );

    const result = await useCase.execute({
      taskId: TASK_ID,
      category: TaskCategory.INBOX,
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });

  it("maps actor identity failure to Result without calling the unit of work", async () => {
    vi.mocked(dependencies.actor.require).mockImplementationOnce(() => {
      throw new Error("actor unavailable");
    });

    await expect(
      useCase.execute({ taskId: TASK_ID, category: TaskCategory.FOCUS })
    ).resolves.toMatchObject({
      success: false,
      error: {
        code: "FIND_FAILED",
        message: expect.stringContaining("actor unavailable"),
      },
    });
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps operation metadata failure to Result without calling the unit of work", async () => {
    vi.mocked(dependencies.actor.nextOperationId).mockImplementationOnce(() => {
      throw new Error("actor locked");
    });

    await expect(
      useCase.execute({ taskId: TASK_ID, category: TaskCategory.FOCUS })
    ).resolves.toMatchObject({
      success: false,
      error: {
        code: "AUTHORSHIP_FAILED",
        message: expect.stringContaining("actor locked"),
      },
    });
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });
});
