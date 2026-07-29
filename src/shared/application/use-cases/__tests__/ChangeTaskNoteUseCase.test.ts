import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { ChangeTaskNoteUseCase } from "../ChangeTaskNoteUseCase";
import {
  ACTOR_ID,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("ChangeTaskNoteUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: ChangeTaskNoteUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    dependencies.state.tasks[TASK_ID].note = "alpha beta";
    useCase = new ChangeTaskNoteUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("turns a full note replacement into one minimal splice command", async () => {
    const baseHeads = ["aa".repeat(32), "bb".repeat(32)];
    vi.mocked(dependencies.repository.getWorkspace).mockResolvedValueOnce({
      state: dependencies.state,
      heads: baseHeads,
    });

    const result = await useCase.execute({
      taskId: TASK_ID,
      note: "alpha zeta",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      path: "note",
      baseHeads,
      index: 6,
      deleteCount: 1,
      insert: "z",
    });
  });

  it("treats undefined as an empty note and skips unchanged text", async () => {
    dependencies.state.tasks[TASK_ID].note = "";

    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
    expect(dependencies.actor.nextOperationId).not.toHaveBeenCalled();
  });

  it("validates task identity and existence before commit", async () => {
    const invalid = await useCase.execute({ taskId: "invalid", note: "x" });
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({ taskId: TASK_ID, note: "x" });

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
      new Error("disk error")
    );

    const result = await useCase.execute({ taskId: TASK_ID, note: "changed" });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
