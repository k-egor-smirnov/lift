import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResultUtils } from "../../../domain/Result";
import { GetTodayTasksUseCase } from "../GetTodayTasksUseCase";
import {
  EFFECTIVE_DATE,
  LEFT_TASK_ID,
  RIGHT_TASK_ID,
  TASK_ID,
  WORKSPACE_ID,
  makeTaskReadModel,
  makeUseCaseDependencies,
  type UseCaseTestDependencies,
} from "./workspaceUseCaseTestUtils";

describe("GetTodayTasksUseCase", () => {
  let dependencies: UseCaseTestDependencies;
  let useCase: GetTodayTasksUseCase;

  beforeEach(() => {
    dependencies = makeUseCaseDependencies();
    useCase = new GetTodayTasksUseCase(
      dependencies.workspace,
      dependencies.repository,
      dependencies.actor,
      dependencies.effectiveDateProvider
    );
  });

  it("queries an explicit dated OR-set and preserves repository CRDT order", async () => {
    vi.mocked(dependencies.repository.getTaskIdsForDay).mockResolvedValueOnce([
      RIGHT_TASK_ID,
      TASK_ID,
      "missing-task",
    ]);
    vi.mocked(dependencies.repository.findTasks).mockResolvedValueOnce([
      makeTaskReadModel({ taskId: LEFT_TASK_ID, positionKey: "a0" }),
      makeTaskReadModel({
        taskId: TASK_ID,
        positionKey: "a1",
        completion: "completed",
      }),
      makeTaskReadModel({ taskId: RIGHT_TASK_ID, positionKey: "a2" }),
    ]);

    const result = await useCase.execute({ date: "2026-07-20" });

    expect(ResultUtils.isSuccess(result)).toBe(true);
    if (!ResultUtils.isSuccess(result)) return;
    expect(result.data).toEqual({
      tasks: [
        makeTaskReadModel({
          taskId: TASK_ID,
          positionKey: "a1",
          completion: "completed",
        }),
        makeTaskReadModel({ taskId: RIGHT_TASK_ID, positionKey: "a2" }),
      ],
      date: "2026-07-20",
      totalCount: 2,
      completedCount: 1,
      activeCount: 1,
    });
    expect(result.data.tasks[0]).not.toHaveProperty("selectedAt");
    expect(result.data.tasks[0]).not.toHaveProperty("completedInSelection");
    expect(dependencies.repository.findTasks).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      effectiveDate: "2026-07-20",
    });
    expect(dependencies.effectiveDateProvider.current).not.toHaveBeenCalled();
  });

  it("loads workspace settings only when the date is implicit", async () => {
    const result = await useCase.execute();

    expect(ResultUtils.isSuccess(result) && result.data.date).toBe(
      EFFECTIVE_DATE
    );
    expect(dependencies.repository.getWorkspace).toHaveBeenCalledTimes(1);
    expect(dependencies.effectiveDateProvider.current).toHaveBeenCalledWith({
      timezone: "Europe/Moscow",
      startOfDay: "09:00",
    });
    expect(dependencies.repository.getTaskIdsForDay).toHaveBeenCalledWith(
      WORKSPACE_ID,
      EFFECTIVE_DATE
    );
  });

  it("filters completion from the task projection and derives counts from returned tasks", async () => {
    vi.mocked(dependencies.repository.getTaskIdsForDay).mockResolvedValueOnce([
      TASK_ID,
      RIGHT_TASK_ID,
    ]);
    vi.mocked(dependencies.repository.findTasks).mockResolvedValueOnce([
      makeTaskReadModel({ taskId: TASK_ID, completion: "completed" }),
      makeTaskReadModel({ taskId: RIGHT_TASK_ID, completion: "active" }),
    ]);

    const result = await useCase.execute({
      date: "2026-07-20",
      includeCompleted: false,
    });

    expect(ResultUtils.isSuccess(result) && result.data).toEqual({
      tasks: [
        makeTaskReadModel({ taskId: RIGHT_TASK_ID, completion: "active" }),
      ],
      date: "2026-07-20",
      totalCount: 1,
      completedCount: 0,
      activeCount: 1,
    });
  });

  it("validates explicit dates and maps repository failure", async () => {
    const invalid = await useCase.execute({ date: "2026-02-30" });
    expect(ResultUtils.isFailure(invalid) && invalid.error.code).toBe(
      "INVALID_DATE"
    );
    expect(dependencies.repository.getTaskIdsForDay).not.toHaveBeenCalled();

    vi.mocked(dependencies.repository.getTaskIdsForDay).mockRejectedValueOnce(
      new Error("read failed")
    );
    const failed = await useCase.execute({ date: "2026-07-20" });
    expect(ResultUtils.isFailure(failed) && failed.error.code).toBe(
      "GET_FAILED"
    );
  });
});
