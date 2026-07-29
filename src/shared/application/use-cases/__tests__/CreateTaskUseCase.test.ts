import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { TaskCategory } from "../../../domain/types";
import { CreateTaskUseCase } from "../CreateTaskUseCase";
import {
  ACTOR_ID,
  AUDIT_TIME,
  DEVICE_ID,
  EFFECTIVE_DATE,
  OPERATION_ID,
  WORKSPACE_ID,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("CreateTaskUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: CreateTaskUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies(false);
    useCase = new CreateTaskUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("commits exactly one authored CreateTask command", async () => {
    const result = await useCase.execute({
      title: "  Local task  ",
      category: TaskCategory.SIMPLE,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    if (!ResultUtils.isSuccess(result)) return;
    expect(result.data.taskId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "CreateTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: result.data.taskId,
      title: "Local task",
      category: "SIMPLE",
      effectiveDate: EFFECTIVE_DATE,
      deviceId: DEVICE_ID,
      auditTime: AUDIT_TIME,
    });
  });

  it("creates and selects a Today task in the same command", async () => {
    const result = await useCase.execute({
      title: "Today task",
      category: TaskCategory.INBOX,
      addToToday: true,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CreateTask",
        effectiveDate: EFFECTIVE_DATE,
        addToDate: EFFECTIVE_DATE,
      })
    );
  });

  it.each(["", "   "])(
    "rejects invalid title %j before commit",
    async (title) => {
      const result = await useCase.execute({
        title,
        category: TaskCategory.FOCUS,
      });

      expect(ResultUtils.isFailure(result)).toBe(true);
      if (ResultUtils.isFailure(result))
        expect(result.error.code).toBe("INVALID_TITLE");
      expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
      expect(dependencies.actor.nextOperationId).not.toHaveBeenCalled();
    }
  );

  it("rejects the projected DEFERRED category", async () => {
    const result = await useCase.execute({
      title: "Task",
      category: TaskCategory.DEFERRED,
    });

    expect(ResultUtils.isFailure(result)).toBe(true);
    if (ResultUtils.isFailure(result))
      expect(result.error.code).toBe("INVALID_CATEGORY");
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps a local commit failure to the Result error contract", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("disk full")
    );

    const result = await useCase.execute({
      title: "Task",
      category: TaskCategory.INBOX,
    });

    expect(ResultUtils.isFailure(result)).toBe(true);
    if (ResultUtils.isFailure(result)) {
      expect(result.error.code).toBe("TRANSACTION_FAILED");
      expect(result.error.message).toContain("disk full");
    }
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
