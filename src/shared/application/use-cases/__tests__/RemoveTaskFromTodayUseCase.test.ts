import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { RemoveTaskFromTodayUseCase } from "../RemoveTaskFromTodayUseCase";
import {
  ACTOR_ID,
  EFFECTIVE_DATE,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("RemoveTaskFromTodayUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: RemoveTaskFromTodayUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new RemoveTaskFromTodayUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("commits one explicitly dated RemoveFromDay command", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      date: "2026-07-20",
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "RemoveFromDay",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      date: "2026-07-20",
    });
  });

  it("derives the implicit date from workspace settings", async () => {
    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.effectiveDateProvider.current).toHaveBeenCalledWith({
      timezone: "Europe/Moscow",
      startOfDay: "09:00",
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith(
      expect.objectContaining({ date: EFFECTIVE_DATE })
    );
  });

  it("validates date and task existence before commit", async () => {
    const invalid = await useCase.execute({ taskId: TASK_ID, date: "bad" });
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({
      taskId: TASK_ID,
      date: "2026-07-20",
    });

    expect(ResultUtils.isFailure(invalid) && invalid.error.code).toBe(
      "INVALID_DATE"
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
      date: "2026-07-20",
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
