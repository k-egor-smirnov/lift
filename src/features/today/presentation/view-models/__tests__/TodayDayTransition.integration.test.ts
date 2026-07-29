import { afterEach, describe, expect, it, vi } from "vitest";

import type { AddTaskToTodayUseCase } from "../../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import type { CompleteTaskUseCase } from "../../../../../shared/application/use-cases/CompleteTaskUseCase";
import { GetTodayTasksUseCase } from "../../../../../shared/application/use-cases/GetTodayTasksUseCase";
import type { RemoveTaskFromTodayUseCase } from "../../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import type { RevertTaskCompletionUseCase } from "../../../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import { WorkspaceId } from "../../../../workspaces/domain/WorkspaceIdentity";
import { createEmptyWorkspace } from "../../../../workspaces/domain/WorkspaceState";
import { AutomergeWorkspaceDocument } from "../../../../workspaces/infrastructure/crdt/AutomergeWorkspaceDocument";
import { WorkspaceProjector } from "../../../../workspaces/infrastructure/crdt/WorkspaceProjector";
import { DexieWorkspaceRepository } from "../../../../workspaces/infrastructure/database/DexieWorkspaceRepository";
import { LiftSecureDatabase } from "../../../../workspaces/infrastructure/database/LiftSecureDatabase";
import { MutableDevClock } from "../../../../workspaces/infrastructure/time/MutableDevClock";
import { SystemEffectiveDateProvider } from "../../../../workspaces/infrastructure/time/SystemEffectiveDateProvider";
import {
  createTodayViewModel,
  type TodayViewModelDependencies,
} from "../TodayViewModel";

const WORKSPACE_ID = "workspace-day-transition";
const ACTOR_ID = "31".repeat(16);
let databaseSequence = 0;

const task = (taskId: string, title: string) => ({
  id: taskId,
  title,
  note: "",
  category: "FOCUS" as const,
  position: { key: taskId, actorId: ACTOR_ID },
  created: { deviceId: "device-1", auditTime: "2026-07-21T08:00:00Z" },
  inboxEnteredOn: null,
  deferredUntil: null,
  originalCategory: null,
  completion: "active" as const,
  completionEpoch: 0,
  tags: { adds: {}, removedDots: {} },
  deletionDots: {},
});

describe("Today effective-date transition", () => {
  let database: LiftSecureDatabase | undefined;

  afterEach(async () => {
    if (database !== undefined) {
      database.close();
      await database.delete();
      database = undefined;
    }
  });

  it("changes the visible dated set with zero synchronized writes", async () => {
    databaseSequence += 1;
    database = new LiftSecureDatabase(
      `LiftSecureDatabase-day-transition-${databaseSequence}`
    );
    await database.open();

    const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "06:00");
    state.tasks.yesterday = task("yesterday", "Yesterday");
    state.tasks.today = task("today", "Today");
    state.dailySelections["2026-07-21"] = {
      adds: { yesterday: { "1@device": true } },
      removedDots: {},
    };
    state.dailySelections["2026-07-22"] = {
      adds: { today: { "2@device": true } },
      removedDots: {},
    };
    const document = AutomergeWorkspaceDocument.create(state, ACTOR_ID);
    const projection = new WorkspaceProjector().project(
      document,
      "2026-07-21",
      1
    );
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: document.save(),
      heads: [...document.heads()],
      savedAt: 1,
    });
    await Promise.all([
      database.taskProjections.bulkAdd([...projection.tasks]),
      database.dailySelectionProjections.bulkAdd([
        ...projection.dailySelections,
      ]),
    ]);

    const clock = new MutableDevClock(new Date("2026-07-22T05:59:59.000Z"));
    const repository = new DexieWorkspaceRepository(database);
    const getToday = new GetTodayTasksUseCase(
      {
        getId: () => WorkspaceId(WORKSPACE_ID),
        requireId: () => WorkspaceId(WORKSPACE_ID),
      },
      repository,
      {
        require: () => ({ actorId: ACTOR_ID, deviceId: "device-1" }),
        nextOperationId: () => "unused",
        auditTime: () => "2026-07-22T06:00:00Z",
      },
      new SystemEffectiveDateProvider(clock)
    );
    const unusedExecute = vi.fn();
    const dependencies: TodayViewModelDependencies = {
      getTodayTasksUseCase: getToday,
      addTaskToTodayUseCase: {
        execute: unusedExecute,
      } as Pick<AddTaskToTodayUseCase, "execute">,
      removeTaskFromTodayUseCase: {
        execute: unusedExecute,
      } as Pick<RemoveTaskFromTodayUseCase, "execute">,
      completeTaskUseCase: {
        execute: unusedExecute,
      } as Pick<CompleteTaskUseCase, "execute">,
      revertTaskCompletionUseCase: {
        execute: unusedExecute,
      } as Pick<RevertTaskCompletionUseCase, "execute">,
    };
    const viewModel = createTodayViewModel(dependencies);

    await viewModel.getState().refreshToday();
    expect(viewModel.getState().currentDate).toBe("2026-07-21");
    expect(viewModel.getState().getTodayTaskIds()).toEqual(["yesterday"]);
    const changesBefore = await database.workspaceChanges.count();
    const outboxBefore = await database.syncOutbox.count();

    clock.set(new Date("2026-07-22T06:00:00.000Z"));
    await viewModel.getState().refreshToday();

    expect(viewModel.getState().currentDate).toBe("2026-07-22");
    expect(viewModel.getState().getTodayTaskIds()).toEqual(["today"]);
    expect(await database.workspaceChanges.count()).toBe(changesBefore);
    expect(await database.syncOutbox.count()).toBe(outboxBefore);
    await expect(
      repository.getTaskIdsForDay(WORKSPACE_ID, "2026-07-21")
    ).resolves.toContain("yesterday");

    viewModel.getState().disableAutoRefresh();
  });
});
