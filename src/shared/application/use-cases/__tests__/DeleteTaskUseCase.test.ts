import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { DeleteTaskUseCase } from "../DeleteTaskUseCase";
import {
  ACTOR_ID,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("DeleteTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: DeleteTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new DeleteTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("commits one permanent DeleteTask tombstone command", async () => {
    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result) && result.data).toEqual({
      taskId: TASK_ID,
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "DeleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });

  it("returns idempotent success for an existing tombstoned task", async () => {
    dependencies.state.tasks[TASK_ID].deletionDots = { deletion: true };

    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result) && result.data).toEqual({
      taskId: TASK_ID,
    });
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("distinguishes an invalid ID from a task that never existed", async () => {
    const invalid = await useCase.execute({ taskId: "invalid" });
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isFailure(invalid) && invalid.error.code).toBe(
      "INVALID_TASK_ID"
    );
    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps commit failure", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("quota")
    );

    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
