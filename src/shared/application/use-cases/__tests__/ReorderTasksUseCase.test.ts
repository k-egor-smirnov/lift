import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { ReorderTasksUseCase } from "../ReorderTasksUseCase";
import {
  ACTOR_ID,
  LEFT_TASK_ID,
  OPERATION_ID,
  RIGHT_TASK_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeTaskState,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("ReorderTasksUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: ReorderTasksUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    dependencies.state.tasks[LEFT_TASK_ID] = makeTaskState({
      id: LEFT_TASK_ID,
      position: { key: "a0", actorId: ACTOR_ID },
    });
    dependencies.state.tasks[RIGHT_TASK_ID] = makeTaskState({
      id: RIGHT_TASK_ID,
      position: { key: "a2", actorId: ACTOR_ID },
    });
    useCase = new ReorderTasksUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.unitOfWork,
      dependencies.actor
    );
  });

  it("moves one task between stable neighbor IDs with one command", async () => {
    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith({
      type: "MoveTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: OPERATION_ID,
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });

  it("validates every referenced task before commit", async () => {
    delete dependencies.state.tasks[RIGHT_TASK_ID];

    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TASK_NOT_FOUND"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("accepts actual canonical neighbours with equal fractional keys", async () => {
    dependencies.state.tasks[LEFT_TASK_ID].position = {
      key: "a0",
      actorId: "11".repeat(16),
    };
    dependencies.state.tasks[RIGHT_TASK_ID].position = {
      key: "a0",
      actorId: "22".repeat(16),
    };

    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MoveTask",
        leftTaskId: LEFT_TASK_ID,
        rightTaskId: RIGHT_TASK_ID,
      })
    );
  });

  it("rejects equal-key bounds reversed by actor and task tie-breakers", async () => {
    dependencies.state.tasks[LEFT_TASK_ID].position = {
      key: "a0",
      actorId: "22".repeat(16),
    };
    dependencies.state.tasks[RIGHT_TASK_ID].position = {
      key: "a0",
      actorId: "11".repeat(16),
    };

    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "INVALID_POSITION"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("rejects bounds that skip an actual canonical neighbour", async () => {
    const middleTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FAY";
    dependencies.state.tasks[middleTaskId] = makeTaskState({
      id: middleTaskId,
      position: { key: "a1", actorId: ACTOR_ID },
    });
    dependencies.state.tasks[TASK_ID].position = {
      key: "a3",
      actorId: ACTOR_ID,
    };

    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "INVALID_POSITION"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("rejects malformed and self-neighbor IDs", async () => {
    const malformed = await useCase.execute({
      taskId: "bad",
      leftTaskId: null,
    });
    const self = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: TASK_ID,
    });

    expect(ResultUtils.isFailure(malformed) && malformed.error.code).toBe(
      "INVALID_TASK_ID"
    );
    expect(ResultUtils.isFailure(self) && self.error.code).toBe(
      "INVALID_POSITION"
    );
    expect(dependencies.unitOfWork.commit).not.toHaveBeenCalled();
  });

  it("maps commit failure", async () => {
    vi.mocked(dependencies.unitOfWork.commit).mockRejectedValueOnce(
      new Error("write failed")
    );

    const result = await useCase.execute({
      taskId: TASK_ID,
      leftTaskId: LEFT_TASK_ID,
      rightTaskId: RIGHT_TASK_ID,
    });

    expect(ResultUtils.isFailure(result) && result.error.code).toBe(
      "TRANSACTION_FAILED"
    );
    expect(dependencies.unitOfWork.commit).toHaveBeenCalledTimes(1);
  });
});
