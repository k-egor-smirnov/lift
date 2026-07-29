import { afterEach, describe, expect, it, vi } from "vitest";

import { AutomergeCommandHandler } from "../../../../features/workspaces/infrastructure/crdt/AutomergeCommandHandler";
import { AutomergeWorkspaceDocument } from "../../../../features/workspaces/infrastructure/crdt/AutomergeWorkspaceDocument";
import { WorkspaceProjector } from "../../../../features/workspaces/infrastructure/crdt/WorkspaceProjector";
import { Sha256OccurrenceIdFactory } from "../../../../features/workspaces/infrastructure/crypto/Sha256OccurrenceIdFactory";
import { DexieWorkspaceRepository } from "../../../../features/workspaces/infrastructure/database/DexieWorkspaceRepository";
import { DexieWorkspaceUnitOfWork } from "../../../../features/workspaces/infrastructure/database/DexieWorkspaceUnitOfWork";
import { LiftSecureDatabase } from "../../../../features/workspaces/infrastructure/database/LiftSecureDatabase";
import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import { createEmptyWorkspace } from "../../../../features/workspaces/domain/WorkspaceState";
import { ResultUtils } from "../../../domain/Result";
import { TaskCategory } from "../../../domain/types";
import { CompleteTaskUseCase } from "../CompleteTaskUseCase";
import { CreateTaskUseCase } from "../CreateTaskUseCase";

const WORKSPACE_ID = "offline-workspace";
const ACTOR_ID = "7a".repeat(16);
let databaseSequence = 0;

const seedWorkspace = async (database: LiftSecureDatabase): Promise<void> => {
  const document = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00"),
    ACTOR_ID
  );
  await database.workspaceSnapshots.add({
    workspaceId: WORKSPACE_ID,
    schemaVersion: 1,
    bytes: document.save(),
    heads: [...document.heads()],
    savedAt: 1,
  });
};

describe("CreateTaskUseCase offline persistence", () => {
  let database: LiftSecureDatabase | undefined;
  let onlineDescriptor: PropertyDescriptor | undefined;

  afterEach(async () => {
    if (onlineDescriptor !== undefined) {
      Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
    } else {
      Reflect.deleteProperty(window.navigator, "onLine");
    }
    onlineDescriptor = undefined;
    if (database !== undefined) {
      database.close();
      await database.delete();
      database = undefined;
    }
  });

  it("makes a task immediately queryable and durably queues one pending change while offline", async () => {
    onlineDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "onLine"
    );
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    databaseSequence += 1;
    database = new LiftSecureDatabase(
      `LiftSecureDatabase-task-8a-${databaseSequence}`
    );
    await database.open();
    await seedWorkspace(database);
    await database.syncTargets.add({
      id: "active-target",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!offline:example.test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    const signalOutbox = vi.fn();
    const unitOfWork = new DexieWorkspaceUnitOfWork(
      database,
      new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
      new WorkspaceProjector(),
      {
        now: () => 1,
        effectiveDate: () => "2026-07-22",
      },
      signalOutbox
    );
    const repository = new DexieWorkspaceRepository(database);
    const useCase = new CreateTaskUseCase(
      {
        getId: () => WorkspaceId(WORKSPACE_ID),
        requireId: () => WorkspaceId(WORKSPACE_ID),
      },
      repository,
      unitOfWork,
      {
        require: () => ({ actorId: ACTOR_ID, deviceId: "offline-device" }),
        nextOperationId: () => "offline-create-operation",
        auditTime: () => "2026-07-22T08:00:00.000Z",
      },
      { current: () => "2026-07-22" }
    );

    const result = await useCase.execute({
      title: "Created offline",
      category: TaskCategory.INBOX,
    });

    expect(window.navigator.onLine).toBe(false);
    expect(ResultUtils.isSuccess(result)).toBe(true);
    if (!ResultUtils.isSuccess(result)) return;
    await expect(
      repository.findTask(WORKSPACE_ID, result.data.taskId, "2026-07-22")
    ).resolves.toMatchObject({
      taskId: result.data.taskId,
      title: "Created offline",
      category: "INBOX",
      completion: "active",
    });
    await expect(database.syncOutbox.toArray()).resolves.toMatchObject([
      {
        workspaceId: WORKSPACE_ID,
        targetId: "active-target",
        state: "pending",
        attemptCount: 0,
      },
    ]);
    expect(signalOutbox).toHaveBeenCalledTimes(1);
  });

  it("keeps one lifecycle record, transition change, and outbox entry across application and atomic duplicates", async () => {
    databaseSequence += 1;
    database = new LiftSecureDatabase(
      `LiftSecureDatabase-task-8a-lifecycle-${databaseSequence}`
    );
    await database.open();
    await seedWorkspace(database);
    await database.syncTargets.add({
      id: "active-target",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!offline:example.test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    const unitOfWork = new DexieWorkspaceUnitOfWork(
      database,
      new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
      new WorkspaceProjector(),
      {
        now: () => 1,
        effectiveDate: () => "2026-07-22",
      }
    );
    const commit = vi.spyOn(unitOfWork, "commit");
    const repository = new DexieWorkspaceRepository(database);
    const currentWorkspace = {
      getId: () => WorkspaceId(WORKSPACE_ID),
      requireId: () => WorkspaceId(WORKSPACE_ID),
    };
    const operationIds = ["seed-create", "complete-1"];
    const actor = {
      require: () => ({ actorId: ACTOR_ID, deviceId: "offline-device" }),
      nextOperationId: () => {
        const operationId = operationIds.shift();
        if (operationId === undefined)
          throw new Error("unexpected operation ID request");
        return operationId;
      },
      auditTime: () => "2026-07-22T08:00:00.000Z",
    };
    const create = new CreateTaskUseCase(
      currentWorkspace,
      repository,
      unitOfWork,
      actor,
      { current: () => "2026-07-22" }
    );
    const complete = new CompleteTaskUseCase(
      currentWorkspace,
      repository,
      unitOfWork,
      actor,
      { current: () => "2026-07-22" }
    );

    const created = await create.execute({
      title: "Lifecycle task",
      category: TaskCategory.SIMPLE,
    });
    expect(ResultUtils.isSuccess(created)).toBe(true);
    if (!ResultUtils.isSuccess(created)) return;
    expect(await database.workspaceChanges.count()).toBe(1);
    expect(await database.syncOutbox.count()).toBe(1);
    commit.mockClear();

    const transitioned = await complete.execute({
      taskId: created.data.taskId,
      effectiveDate: "2026-07-22",
    });
    const applicationDuplicate = await complete.execute({
      taskId: created.data.taskId,
      effectiveDate: "2026-07-22",
    });

    expect(ResultUtils.isSuccess(transitioned)).toBe(true);
    expect(ResultUtils.isSuccess(applicationDuplicate)).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);

    const atomicDuplicate = await unitOfWork.commit({
      type: "CompleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "complete-2",
      taskId: created.data.taskId,
      effectiveDate: "2026-07-22",
      auditTime: "2026-07-22T08:01:00.000Z",
      categoryAtCompletion: "SIMPLE",
    });
    expect(atomicDuplicate.changeHashes).toEqual([]);

    const workspace = await repository.getWorkspace(WORKSPACE_ID, ACTOR_ID);
    expect(workspace?.state.tasks[created.data.taskId]?.completion).toBe(
      "completed"
    );
    expect(Object.keys(workspace?.state.completionRecords ?? {})).toEqual([
      "complete-1",
    ]);
    expect(await database.workspaceChanges.count()).toBe(2);
    expect(await database.syncOutbox.count()).toBe(2);
  });
});
