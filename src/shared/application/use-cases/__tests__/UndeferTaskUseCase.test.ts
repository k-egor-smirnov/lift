import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { TaskCategory } from "../../../domain/types";
import { UndeferTaskUseCase } from "../UndeferTaskUseCase";
import {
  ACTOR_ID,
  OPERATION_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("UndeferTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: UndeferTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    dependencies.state.tasks[TASK_ID].deferredUntil = "2026-08-01";
    dependencies.state.tasks[TASK_ID].originalCategory = "FOCUS";
    useCase = new UndeferTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("commits explicit DeferTask null and reports the restored category", async () => {
    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isSuccess(result) && result.data).toEqual({
      taskId: TASK_ID,
      restoredCategory: TaskCategory.FOCUS,
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "DeferTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      deferredUntil: null,
    });
  });

  it("does not create a time-crossing mutation for an active task", async () => {
    dependencies.state.tasks[TASK_ID].deferredUntil = null;
    dependencies.state.tasks[TASK_ID].originalCategory = null;

    const result = await useCase.execute({ taskId: TASK_ID });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TASK_NOT_DEFERRED"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps missing tasks and commit failures", async () => {
    delete dependencies.state.tasks[TASK_ID];
    const missing = await useCase.execute({ taskId: TASK_ID });
    expect(ResultUtils.isFailure(missing) && missing.error.code).toBe(
      "TASK_NOT_FOUND"
    );

    dependencies.state.tasks[TASK_ID] = {
      id: TASK_ID,
      title: "Task",
      note: "",
      category: "SIMPLE",
      position: { key: "a", actorId: ACTOR_ID },
      created: { deviceId: "device", auditTime: "2026-07-22T08:00:00Z" },
      inboxEnteredOn: null,
      deferredUntil: "2026-08-01",
      originalCategory: "SIMPLE",
      completion: "active",
      completionEpoch: 0,
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
