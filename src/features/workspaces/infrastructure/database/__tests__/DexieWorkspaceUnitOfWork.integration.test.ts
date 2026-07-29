import Dexie from "dexie";
import * as Automerge from "@automerge/automerge";

import type { WorkspaceCommand } from "../../../application/commands/WorkspaceCommand";
import type { AcceptedRemoteChange } from "../../../application/ports/WorkspaceUnitOfWork";
import {
  createEmptyWorkspace,
  type WorkspaceState,
} from "../../../domain/WorkspaceState";
import { Sha256OccurrenceIdFactory } from "../../../infrastructure/crypto/Sha256OccurrenceIdFactory";
import { AutomergeCommandHandler } from "../../crdt/AutomergeCommandHandler";
import {
  AutomergeWorkspaceDocument,
  WORKSPACE_GENESIS_ACTOR_ID,
  type BinaryWorkspaceChange,
} from "../../crdt/AutomergeWorkspaceDocument";
import {
  WorkspaceProjector,
  type WorkspaceProjection,
} from "../../crdt/WorkspaceProjector";
import { LiftSecureDatabase } from "../LiftSecureDatabase";
import { DexieWorkspaceRepository } from "../DexieWorkspaceRepository";
import { DexieWorkspaceUnitOfWork } from "../DexieWorkspaceUnitOfWork";

const WORKSPACE_ID = "workspace-1";
const ACTOR_ID = "11".repeat(16);
const CREATED_AT = "2026-07-22T08:00:00.000Z";
const PERSISTED_AT = Date.parse(CREATED_AT);

const ownedDatabaseNames = new Set<string>();
const openDatabases = new Set<LiftSecureDatabase>();

const createDatabase = (): LiftSecureDatabase => {
  const name = `LiftSecureDatabase-task-7-${crypto.randomUUID()}`;
  ownedDatabaseNames.add(name);
  const database = new LiftSecureDatabase(name);
  openDatabases.add(database);
  return database;
};

const activateRemoteRoom = (
  database: LiftSecureDatabase,
  workspaceId = WORKSPACE_ID
): Promise<string> =>
  database.syncTargets.add({
    id: `${workspaceId}:remote-test-target`,
    workspaceId,
    serverProfileId: "remote-test-profile",
    roomId: "!workspace:example.test",
    mode: "active",
    state: "active",
    createdAt: PERSISTED_AT,
    updatedAt: PERSISTED_AT,
  });

const cleanup = async (): Promise<void> => {
  for (const database of openDatabases) {
    database.close();
  }
  openDatabases.clear();
  for (const name of ownedDatabaseNames) {
    await Dexie.delete(name);
  }
  ownedDatabaseNames.clear();
};

const createTaskCommand: Extract<WorkspaceCommand, { type: "CreateTask" }> = {
  type: "CreateTask",
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  operationId: "operation-create-task-1",
  taskId: "task-1",
  title: "Atomic task",
  note: "Stored with every artifact",
  category: "INBOX",
  effectiveDate: "2026-07-22",
  deviceId: "DEVICE-1",
  auditTime: CREATED_AT,
  leftTaskId: null,
  rightTaskId: null,
};

const taskCreatedEvent = {
  eventId: "event-task-created-1",
  aggregateId: "task-1",
  aggregateType: "Task",
  eventType: "TASK_CREATED",
  payload: { taskId: "task-1", title: "Atomic task" },
  occurredAt: PERSISTED_AT,
};

const createUnitOfWork = (
  database: LiftSecureDatabase,
  projector:
    | WorkspaceProjector
    | {
        project(): WorkspaceProjection;
      } = new WorkspaceProjector(),
  signalOutbox: () => void | Promise<void> = () => undefined,
  now = PERSISTED_AT
): DexieWorkspaceUnitOfWork =>
  new DexieWorkspaceUnitOfWork(
    database,
    new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
    projector,
    {
      now: () => now,
      effectiveDate: () => "2026-07-22",
    },
    signalOutbox
  );

const remoteInput = (
  change: BinaryWorkspaceChange,
  eventId: string
): AcceptedRemoteChange => ({
  workspaceId: WORKSPACE_ID,
  actorId: "44".repeat(16),
  eventId,
  roomId: "!workspace:example.test",
  senderUserId: "@alice:example.test",
  senderDeviceId: "ALICE",
  wireEvent: JSON.stringify({ eventId }),
  bytes: change.bytes.slice(),
  changeHash: change.hash,
  dependencies: [...change.dependencies],
});

const remoteChain = (): {
  readonly base: AutomergeWorkspaceDocument;
  readonly parent: BinaryWorkspaceChange;
  readonly child: BinaryWorkspaceChange;
} => {
  const base = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00"),
    "aa".repeat(16)
  );
  const source = AutomergeWorkspaceDocument.load(base.save(), "bb".repeat(16));
  const parent = source.change("remote parent", (draft) => {
    draft.tasks["remote-task"] = {
      id: "remote-task",
      title: "Remote task",
      note: "",
      category: "INBOX",
      position: { key: "a0", actorId: "bb".repeat(16) },
      created: { deviceId: "REMOTE", auditTime: CREATED_AT },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
  })[0];
  const child = source.change("remote child", (draft) => {
    draft.tasks["remote-task"].category = "FOCUS";
  })[0];
  if (parent === undefined || child === undefined) {
    throw new Error("Expected a two-change remote chain");
  }
  return { base, parent, child };
};

const binaryChange = (bytes: Uint8Array): BinaryWorkspaceChange => {
  const decoded = Automerge.decodeChange(bytes);
  return {
    bytes: bytes.slice(),
    hash: decoded.hash,
    dependencies: [...decoded.deps].sort(),
  };
};

const invalidPendingChain = (): {
  readonly base: AutomergeWorkspaceDocument;
  readonly parent: BinaryWorkspaceChange;
  readonly invalidChild: BinaryWorkspaceChange;
} => {
  const base = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00"),
    "aa".repeat(16)
  );
  const rawBase = Automerge.load<WorkspaceState>(base.save(), {
    actor: "bb".repeat(16),
  });
  const withParent = Automerge.change(
    rawBase,
    { message: "valid parent", time: 0 },
    (draft) => {
      draft.tasks["remote-task"] = {
        id: "remote-task",
        title: "Valid parent task",
        note: "",
        category: "INBOX",
        position: { key: "a0", actorId: "bb".repeat(16) },
        created: { deviceId: "REMOTE", auditTime: CREATED_AT },
        inboxEnteredOn: "2026-07-22",
        deferredUntil: null,
        originalCategory: null,
        completion: "active",
        completionEpoch: 0,
        tags: { adds: {}, removedDots: {} },
        deletionDots: {},
      };
    }
  );
  const withInvalidChild = Automerge.change(
    withParent,
    { message: "invalid child", time: 0 },
    (draft) => {
      Reflect.set(draft.tasks["remote-task"], "title", 42);
    }
  );
  const parentBytes = Automerge.getChanges(rawBase, withParent)[0];
  const invalidBytes = Automerge.getChanges(withParent, withInvalidChild)[0];
  if (parentBytes === undefined || invalidBytes === undefined) {
    throw new Error("Expected valid parent and invalid child changes");
  }
  return {
    base,
    parent: binaryChange(parentBytes),
    invalidChild: binaryChange(invalidBytes),
  };
};

const forgedGenesisActorChange = (
  snapshot: Uint8Array
): BinaryWorkspaceChange => {
  const before = Automerge.load<WorkspaceState>(snapshot, {
    actor: WORKSPACE_GENESIS_ACTOR_ID,
  });
  const after = Automerge.change(
    before,
    { message: "forged genesis actor change", time: 0 },
    (draft) => {
      draft.settings.startOfDay = "01:00";
    }
  );
  const bytes = Automerge.getChanges(before, after)[0];
  if (bytes === undefined) {
    throw new Error("Expected a forged reserved-actor change");
  }
  const forged = binaryChange(bytes);
  const decoded = Automerge.decodeChange(forged.bytes);
  if (decoded.actor !== WORKSPACE_GENESIS_ACTOR_ID || decoded.seq !== 2) {
    throw new Error("Expected an honest seq-2 reserved-actor change");
  }
  return forged;
};

describe("DexieWorkspaceUnitOfWork", () => {
  afterEach(cleanup);
  afterAll(cleanup);

  it("rolls every artifact back on projection failure and commits one coherent change when healthy", async () => {
    const database = createDatabase();
    await database.open();
    await database.syncTargets.bulkAdd([
      {
        id: "target-active",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "profile-1",
        roomId: "!active:example.test",
        mode: "active",
        state: "active",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
      {
        id: "target-candidate",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "profile-1",
        roomId: "!candidate:example.test",
        mode: "candidate",
        state: "active",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
      {
        id: "target-read-only",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "profile-1",
        roomId: "!readonly:example.test",
        mode: "read-only",
        state: "active",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
      {
        id: "target-paused",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "profile-1",
        roomId: "!paused:example.test",
        mode: "active",
        state: "paused",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
    ]);

    const commandHandler = new AutomergeCommandHandler(
      new Sha256OccurrenceIdFactory()
    );
    const failingProjector = {
      project(): WorkspaceProjection {
        throw new Error("projection failed");
      },
    };
    const failingUnitOfWork = new DexieWorkspaceUnitOfWork(
      database,
      commandHandler,
      failingProjector,
      {
        now: () => PERSISTED_AT,
        effectiveDate: () => "2026-07-22",
      }
    );

    await expect(failingUnitOfWork.commit(createTaskCommand)).rejects.toThrow(
      "projection failed"
    );
    expect(await database.workspaceSnapshots.count()).toBe(0);
    expect(await database.workspaceChanges.count()).toBe(0);
    expect(await database.syncOutbox.count()).toBe(0);
    expect(await database.taskProjections.count()).toBe(0);
    expect(await database.dailySelectionProjections.count()).toBe(0);
    expect(await database.conflictProjections.count()).toBe(0);
    expect(await database.domainEvents.count()).toBe(0);

    let snapshotCountObservedBySignal = -1;
    let eventCountObservedBySignal = -1;
    const healthyUnitOfWork = new DexieWorkspaceUnitOfWork(
      database,
      commandHandler,
      new WorkspaceProjector(),
      {
        now: () => PERSISTED_AT,
        effectiveDate: () => "2026-07-22",
      },
      async () => {
        snapshotCountObservedBySignal =
          await database.workspaceSnapshots.count();
      },
      async () => {
        eventCountObservedBySignal = await database.domainEvents.count();
      }
    );

    const result = await healthyUnitOfWork.commit(createTaskCommand, [
      taskCreatedEvent,
    ]);

    expect(result.changeHashes).toHaveLength(1);
    const [changeHash] = result.changeHashes;
    expect(changeHash).toBeDefined();
    expect(
      await database.workspaceChanges.get([WORKSPACE_ID, changeHash])
    ).toBeDefined();
    expect(await database.workspaceSnapshots.get(WORKSPACE_ID)).toMatchObject({
      heads: result.heads,
    });
    expect(await database.taskProjections.toArray()).toMatchObject([
      { workspaceId: WORKSPACE_ID, taskId: "task-1", title: "Atomic task" },
    ]);
    expect(await database.syncOutbox.toArray()).toMatchObject([
      {
        workspaceId: WORKSPACE_ID,
        targetId: "target-active",
        changeHash,
      },
    ]);
    expect(await database.domainEvents.toArray()).toMatchObject([
      {
        id: "event-task-created-1",
        workspaceId: WORKSPACE_ID,
        aggregateId: "task-1",
        eventType: "TASK_CREATED",
        aggregateSequence: 1,
        status: "pending",
        leaseUntil: null,
      },
    ]);
    expect(snapshotCountObservedBySignal).toBe(1);
    expect(eventCountObservedBySignal).toBe(1);
  });

  it("reconstructs exact heads after reopen and atomically rebuilds disposable projections", async () => {
    const database = createDatabase();
    await database.open();
    const unitOfWork = new DexieWorkspaceUnitOfWork(
      database,
      new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
      new WorkspaceProjector(),
      {
        now: () => PERSISTED_AT,
        effectiveDate: () => "2026-07-22",
      }
    );
    const committed = await unitOfWork.commit(createTaskCommand);
    const databaseName = database.name;
    await database.taskProjections.clear();
    database.close();

    const reopened = new LiftSecureDatabase(databaseName);
    openDatabases.add(reopened);
    await reopened.open();
    const repository = new DexieWorkspaceRepository(reopened);
    const reconstructed = await repository.getWorkspace(
      WORKSPACE_ID,
      "22".repeat(16)
    );

    expect(reconstructed?.heads).toEqual(committed.heads);
    expect(reconstructed?.state.tasks["task-1"]?.title).toBe("Atomic task");
    expect(await reopened.taskProjections.count()).toBe(0);

    const reopenedUnitOfWork = new DexieWorkspaceUnitOfWork(
      reopened,
      new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
      new WorkspaceProjector(),
      {
        now: () => PERSISTED_AT + 1,
        effectiveDate: () => "2026-07-22",
      }
    );
    await reopenedUnitOfWork.rebuildProjections(WORKSPACE_ID, "22".repeat(16));

    expect(await reopened.taskProjections.toArray()).toMatchObject([
      { taskId: "task-1", title: "Atomic task" },
    ]);
    expect(await reopened.workspaceChanges.count()).toBe(1);
    expect(
      (await repository.getWorkspace(WORKSPACE_ID, ACTOR_ID))?.heads
    ).toEqual(committed.heads);
  });

  it("durably waits for a missing parent and topologically applies parent plus child after reopen", async () => {
    const { base, parent, child } = remoteChain();
    const database = createDatabase();
    await database.open();
    await activateRemoteRoom(database);
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const beforeSnapshot = await database.workspaceSnapshots.get(WORKSPACE_ID);

    const waiting = await createUnitOfWork(database).applyRemote(
      remoteInput(child, "$child")
    );

    expect(waiting.status).toBe("waiting-dependencies");
    expect(await database.workspaceChanges.count()).toBe(1);
    expect(await database.syncInbox.get("$child")).toMatchObject({
      state: "waiting-dependencies",
    });
    expect(await database.matrixEventIndex.get("$child")).toMatchObject({
      changeHash: child.hash,
    });
    expect(await database.workspaceSnapshots.get(WORKSPACE_ID)).toEqual(
      beforeSnapshot
    );
    expect(await database.taskProjections.count()).toBe(0);

    const duplicateWhilePending = await createUnitOfWork(
      database,
      new WorkspaceProjector(),
      () => undefined,
      PERSISTED_AT + 1
    ).applyRemote(remoteInput(child, "$child-pending-duplicate"));
    expect(duplicateWhilePending.status).toBe("waiting-dependencies");
    expect(
      await database.syncInbox.get("$child-pending-duplicate")
    ).toMatchObject({ state: "waiting-dependencies" });
    expect(await database.workspaceChanges.count()).toBe(1);
    database.close();

    const reopened = new LiftSecureDatabase(database.name);
    openDatabases.add(reopened);
    await reopened.open();
    const applied = await createUnitOfWork(
      reopened,
      new WorkspaceProjector(),
      () => undefined,
      PERSISTED_AT + 1
    ).applyRemote(remoteInput(parent, "$parent"));

    expect(applied.status).toBe("applied");
    expect(applied.appliedChangeHashes).toEqual(
      [parent.hash, child.hash].sort()
    );
    expect(await reopened.workspaceChanges.count()).toBe(2);
    expect(await reopened.syncInbox.get("$child")).toMatchObject({
      state: "handled",
      lastError: null,
    });
    expect(await reopened.syncInbox.get("$parent")).toMatchObject({
      state: "handled",
    });
    expect(await reopened.taskProjections.toArray()).toMatchObject([
      { taskId: "remote-task", category: "FOCUS" },
    ]);
    expect(await reopened.syncOutbox.count()).toBe(0);

    const projectionBeforeDuplicate = await reopened.taskProjections.toArray();
    const duplicate = await createUnitOfWork(
      reopened,
      new WorkspaceProjector(),
      () => undefined,
      PERSISTED_AT + 2
    ).applyRemote(remoteInput(child, "$child-duplicate"));

    expect(duplicate.status).toBe("duplicate");
    expect(await reopened.workspaceChanges.count()).toBe(2);
    expect(await reopened.taskProjections.toArray()).toEqual(
      projectionBeforeDuplicate
    );
    expect(await reopened.syncOutbox.count()).toBe(0);
    expect(await reopened.syncInbox.get("$child-duplicate")).toMatchObject({
      state: "handled",
    });

    const inboxCount = await reopened.syncInbox.count();
    await expect(
      createUnitOfWork(reopened).applyRemote({
        ...remoteInput(child, "$tampered-duplicate"),
        bytes: parent.bytes.slice(),
      })
    ).rejects.toThrow("hash mismatch");
    expect(await reopened.syncInbox.count()).toBe(inboxCount);
    expect(
      await reopened.matrixEventIndex.get("$tampered-duplicate")
    ).toBeUndefined();
  });

  it("rejects a late remote change from the read-only source room after migration", async () => {
    const { base, parent } = remoteChain();
    const database = createDatabase();
    await database.open();
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    await database.syncTargets.bulkAdd([
      {
        id: "old-source",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "primary",
        roomId: "!workspace:example.test",
        mode: "read-only",
        state: "active",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
      {
        id: "new-target",
        workspaceId: WORKSPACE_ID,
        serverProfileId: "secondary",
        roomId: "!new:example.test",
        mode: "active",
        state: "active",
        createdAt: PERSISTED_AT,
        updatedAt: PERSISTED_AT,
      },
    ]);

    await expect(
      createUnitOfWork(database).applyRemote(remoteInput(parent, "$late-old"))
    ).rejects.toThrow("Remote event room is not the active sync target");
    expect(await database.workspaceChanges.count()).toBe(0);
    expect(await database.syncInbox.count()).toBe(0);
  });

  it("rejects invalid remote metadata without altering any persisted table", async () => {
    const { base, parent } = remoteChain();
    const database = createDatabase();
    await database.open();
    await activateRemoteRoom(database);
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const before = {
      snapshots: await database.workspaceSnapshots.toArray(),
      changes: await database.workspaceChanges.toArray(),
      tasks: await database.taskProjections.toArray(),
      daily: await database.dailySelectionProjections.toArray(),
      conflicts: await database.conflictProjections.toArray(),
      inbox: await database.syncInbox.toArray(),
      index: await database.matrixEventIndex.toArray(),
      outbox: await database.syncOutbox.toArray(),
    };
    const invalid = remoteInput(parent, "$invalid");

    await expect(
      createUnitOfWork(database).applyRemote({
        ...invalid,
        changeHash: "00".repeat(32),
      })
    ).rejects.toThrow("hash mismatch");

    expect({
      snapshots: await database.workspaceSnapshots.toArray(),
      changes: await database.workspaceChanges.toArray(),
      tasks: await database.taskProjections.toArray(),
      daily: await database.dailySelectionProjections.toArray(),
      conflicts: await database.conflictProjections.toArray(),
      inbox: await database.syncInbox.toArray(),
      index: await database.matrixEventIndex.toArray(),
      outbox: await database.syncOutbox.toArray(),
    }).toEqual(before);
  });

  it("quarantines a forged reserved-genesis-actor change without mutating workspace state", async () => {
    const base = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00"),
      "aa".repeat(16)
    );
    const forged = forgedGenesisActorChange(base.save());
    const database = createDatabase();
    await database.open();
    await activateRemoteRoom(database);
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const snapshotBefore = await database.workspaceSnapshots.get(WORKSPACE_ID);
    const workspaceBefore = await new DexieWorkspaceRepository(
      database
    ).getWorkspace(WORKSPACE_ID, "22".repeat(16));

    const result = await createUnitOfWork(database).applyRemote(
      remoteInput(forged, "$forged-genesis-actor")
    );

    const detail =
      "Reserved Automerge genesis actor cannot author incoming changes";
    expect(result).toMatchObject({
      status: "quarantined",
      appliedChangeHashes: [],
      heads: base.heads(),
    });
    expect(await database.syncInbox.get("$forged-genesis-actor")).toMatchObject(
      {
        workspaceId: WORKSPACE_ID,
        state: "quarantined",
        lastError: detail,
      }
    );
    expect(
      await database.matrixEventIndex.get("$forged-genesis-actor")
    ).toMatchObject({
      workspaceId: WORKSPACE_ID,
      changeHash: forged.hash,
    });
    expect(await database.quarantine.toArray()).toMatchObject([
      {
        eventId: "$forged-genesis-actor",
        workspaceId: WORKSPACE_ID,
        reason: "invalid-schema",
        detail,
      },
    ]);
    expect(
      await database.workspaceChanges.get([WORKSPACE_ID, forged.hash])
    ).toBeUndefined();
    expect(await database.workspaceChanges.count()).toBe(0);
    expect(await database.syncOutbox.count()).toBe(0);
    expect(await database.workspaceSnapshots.get(WORKSPACE_ID)).toEqual(
      snapshotBefore
    );
    expect(await database.taskProjections.count()).toBe(0);
    expect(await database.dailySelectionProjections.count()).toBe(0);
    expect(await database.conflictProjections.count()).toBe(0);
    const workspaceAfter = await new DexieWorkspaceRepository(
      database
    ).getWorkspace(WORKSPACE_ID, "33".repeat(16));
    expect(workspaceAfter).toEqual(workspaceBefore);
  });

  it("quarantines a schema-invalid pending child and still applies its valid parent after reopen", async () => {
    const { base, parent, invalidChild } = invalidPendingChain();
    const database = createDatabase();
    await database.open();
    await activateRemoteRoom(database);
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const waiting = await createUnitOfWork(database).applyRemote(
      remoteInput(invalidChild, "$invalid-child")
    );
    expect(waiting.status).toBe("waiting-dependencies");
    database.close();

    const reopened = new LiftSecureDatabase(database.name);
    openDatabases.add(reopened);
    await reopened.open();
    const applied = await createUnitOfWork(
      reopened,
      new WorkspaceProjector(),
      () => undefined,
      PERSISTED_AT + 1
    ).applyRemote(remoteInput(parent, "$valid-parent"));

    expect(applied.status).toBe("applied");
    expect(
      await reopened.workspaceChanges.get([WORKSPACE_ID, invalidChild.hash])
    ).toBeUndefined();
    expect(
      await reopened.workspaceChanges.get([WORKSPACE_ID, parent.hash])
    ).toBeDefined();
    expect(await reopened.syncInbox.get("$invalid-child")).toMatchObject({
      state: "quarantined",
      lastError:
        "Invalid Automerge workspace state at tasks.remote-task.title: Invalid input: expected string, received number",
    });
    expect(await reopened.syncInbox.get("$valid-parent")).toMatchObject({
      state: "handled",
    });
    expect(await reopened.quarantine.toArray()).toMatchObject([
      {
        eventId: "$invalid-child",
        workspaceId: WORKSPACE_ID,
        reason: "invalid-schema",
        detail:
          "Invalid Automerge workspace state at tasks.remote-task.title: Invalid input: expected string, received number",
      },
    ]);
    expect(await reopened.taskProjections.toArray()).toMatchObject([
      { taskId: "remote-task", title: "Valid parent task" },
    ]);
    const reconstructed = await new DexieWorkspaceRepository(
      reopened
    ).getWorkspace(WORKSPACE_ID, "33".repeat(16));
    expect(reconstructed?.heads).toEqual([parent.hash]);
    expect(reconstructed?.state.tasks["remote-task"]?.title).toBe(
      "Valid parent task"
    );
  });

  it("rolls back all writes on a database constraint failure", async () => {
    const database = createDatabase();
    await database.open();
    await database.syncTargets.add({
      id: "target-active",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!active:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    await database.domainEvents.add({
      id: taskCreatedEvent.eventId,
      workspaceId: WORKSPACE_ID,
      aggregateId: "existing",
      aggregateType: "Task",
      eventType: "EXISTING",
      aggregateSequence: 1,
      payload: "{}",
      occurredAt: PERSISTED_AT,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: PERSISTED_AT,
      leaseUntil: null,
      lastError: null,
    });

    await expect(
      createUnitOfWork(database).commit(createTaskCommand, [taskCreatedEvent])
    ).rejects.toMatchObject({ name: "BulkError" });

    expect(await database.workspaceSnapshots.count()).toBe(0);
    expect(await database.workspaceChanges.count()).toBe(0);
    expect(await database.taskProjections.count()).toBe(0);
    expect(await database.syncOutbox.count()).toBe(0);
    expect(await database.domainEvents.toArray()).toMatchObject([
      { id: taskCreatedEvent.eventId, eventType: "EXISTING" },
    ]);
  });

  it("keeps a committed mutation when the post-commit outbox signal fails", async () => {
    const database = createDatabase();
    await database.open();
    await database.syncTargets.add({
      id: "target-active",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!active:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });

    await expect(
      createUnitOfWork(database, new WorkspaceProjector(), async () => {
        expect(await database.workspaceChanges.count()).toBe(1);
        throw new Error("processor offline");
      }).commit(createTaskCommand)
    ).resolves.toMatchObject({ workspaceId: WORKSPACE_ID });

    expect(await database.workspaceSnapshots.count()).toBe(1);
    expect(await database.workspaceChanges.count()).toBe(1);
    expect(await database.taskProjections.count()).toBe(1);
    expect(await database.syncOutbox.count()).toBe(1);
  });

  it("projects deterministic conflict alternatives and position/actor/task order", () => {
    const task = (
      id: string,
      actorId: string
    ): WorkspaceState["tasks"][string] => ({
      id,
      title: id,
      note: "",
      category: "INBOX",
      position: { key: "a0", actorId },
      created: { deviceId: "DEVICE", auditTime: CREATED_AT },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    });
    const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
    state.tasks = {
      "task-z": task("task-z", "22".repeat(16)),
      "task-b": task("task-b", "11".repeat(16)),
      "task-a": task("task-a", "11".repeat(16)),
    };
    const base = AutomergeWorkspaceDocument.create(state, "aa".repeat(16));
    const left = AutomergeWorkspaceDocument.load(base.save(), "bb".repeat(16));
    const right = AutomergeWorkspaceDocument.load(base.save(), "cc".repeat(16));
    const leftChanges = left.change("left", (draft) => {
      draft.tasks["task-a"].category = "FOCUS";
      draft.tasks["task-a"].completion = "active";
    });
    const rightChanges = right.change("right", (draft) => {
      draft.tasks["task-a"].category = "SIMPLE";
      draft.tasks["task-a"].completion = "completed";
    });
    const merged = AutomergeWorkspaceDocument.load(
      base.save(),
      "dd".repeat(16)
    );
    merged.apply([...rightChanges, ...leftChanges]);

    const projection = new WorkspaceProjector().project(
      merged,
      "2026-07-22",
      PERSISTED_AT
    );

    expect(projection.tasks.map(({ taskId }) => taskId)).toEqual([
      "task-a",
      "task-b",
      "task-z",
    ]);
    expect(projection.tasks[0]).toMatchObject({
      category: "SIMPLE",
      completion: "active",
    });
    expect(
      projection.conflicts
        .filter(({ taskId }) => taskId === "task-a")
        .map(({ path, winningValue, alternativeValues }) => ({
          path,
          winningValue,
          alternativeValues,
        }))
    ).toEqual([
      {
        path: "category",
        winningValue: "SIMPLE",
        alternativeValues: ["FOCUS"],
      },
    ]);
  });

  it("materializes a deterministic occurrence exactly once", async () => {
    const database = createDatabase();
    await database.open();
    const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
    state.recurrenceTemplates["template-1"] = {
      id: "template-1",
      title: "Daily review",
      note: "Review inbox",
      category: "FOCUS",
      rule: {
        frequency: "daily",
        interval: 1,
        weekdays: [],
        startsOn: "2026-07-01",
        endsOn: null,
      },
      deletionDots: {},
    };
    const base = AutomergeWorkspaceDocument.create(state, ACTOR_ID);
    await database.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const command: WorkspaceCommand = {
      type: "MaterializeOccurrence",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "materialize-1",
      templateId: "template-1",
      occurrenceDate: "2026-07-22",
      deviceId: "DEVICE-1",
      auditTime: CREATED_AT,
      leftTaskId: null,
      rightTaskId: null,
    };
    const unitOfWork = createUnitOfWork(database);

    const first = await unitOfWork.commit(command);
    const taskId = await new Sha256OccurrenceIdFactory().create(
      "template-1",
      "2026-07-22"
    );
    const countsAfterFirst = {
      changes: await database.workspaceChanges.count(),
      tasks: await database.taskProjections.count(),
      outbox: await database.syncOutbox.count(),
    };
    const second = await unitOfWork.commit(command);

    expect(first.changeHashes).toHaveLength(1);
    expect(second.changeHashes).toEqual([]);
    expect(
      await database.taskProjections.get([WORKSPACE_ID, taskId])
    ).toMatchObject({ title: "Daily review", category: "FOCUS" });
    expect({
      changes: await database.workspaceChanges.count(),
      tasks: await database.taskProjections.count(),
      outbox: await database.syncOutbox.count(),
    }).toEqual(countsAfterFirst);
  });

  it("rejects every task edit after grow-only deletion and rejects surrogate-splitting splices", async () => {
    const database = createDatabase();
    await database.open();
    const unitOfWork = createUnitOfWork(database);
    const emojiCreate: WorkspaceCommand = {
      ...createTaskCommand,
      title: "A😀B",
    };
    const emojiCreated = await unitOfWork.commit(emojiCreate);
    await expect(
      unitOfWork.commit({
        type: "SpliceTaskText",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "split-surrogate",
        taskId: "task-1",
        path: "title",
        baseHeads: [...emojiCreated.heads],
        index: 2,
        deleteCount: 0,
        insert: "x",
      })
    ).rejects.toThrow("UTF-16 splice boundary");
    await unitOfWork.commit({
      type: "DeleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "delete-1",
      taskId: "task-1",
    });
    const snapshotAfterDelete =
      await database.workspaceSnapshots.get(WORKSPACE_ID);
    const deletedEdits: WorkspaceCommand[] = [
      {
        type: "SpliceTaskText",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-1",
        taskId: "task-1",
        path: "note",
        baseHeads: [...(snapshotAfterDelete?.heads ?? [])],
        index: 0,
        deleteCount: 0,
        insert: "x",
      },
      {
        type: "ChangeTaskCategory",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-2",
        taskId: "task-1",
        fromCategory: "INBOX",
        category: "FOCUS",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
      },
      {
        type: "MoveTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-3",
        taskId: "task-1",
        leftTaskId: null,
        rightTaskId: null,
      },
      {
        type: "CompleteTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-4",
        taskId: "task-1",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
        categoryAtCompletion: "INBOX",
      },
      {
        type: "ReopenTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-5",
        taskId: "task-1",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
      },
      {
        type: "DeferTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-6",
        taskId: "task-1",
        deferredUntil: "2026-07-23",
      },
      {
        type: "AddTag",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-7",
        taskId: "task-1",
        tag: "tag",
      },
      {
        type: "RemoveTag",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-8",
        taskId: "task-1",
        tag: "tag",
      },
      {
        type: "AddToDay",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-9",
        taskId: "task-1",
        date: "2026-07-22",
      },
      {
        type: "RemoveFromDay",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-10",
        taskId: "task-1",
        date: "2026-07-22",
      },
      {
        type: "DeleteTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "edit-11",
        taskId: "task-1",
      },
    ];

    for (const command of deletedEdits) {
      await expect(unitOfWork.commit(command)).rejects.toThrow(
        "Cannot edit deleted task"
      );
    }
    expect(await database.workspaceSnapshots.get(WORKSPACE_ID)).toEqual(
      snapshotAfterDelete
    );
    expect(await database.taskProjections.count()).toBe(0);
  });

  it("executes the complete semantic command family through one persisted path", async () => {
    const database = createDatabase();
    await database.open();
    const unitOfWork = createUnitOfWork(database);
    await unitOfWork.commit({ ...createTaskCommand, title: "A😀B" });
    const secondCreated = await unitOfWork.commit({
      ...createTaskCommand,
      operationId: "create-task-2",
      taskId: "task-2",
      title: "Second",
      leftTaskId: "task-1",
      rightTaskId: null,
    });
    const commands: WorkspaceCommand[] = [
      {
        type: "SpliceTaskText",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "splice-1",
        taskId: "task-1",
        path: "title",
        baseHeads: [...secondCreated.heads],
        index: 1,
        deleteCount: 2,
        insert: "X",
      },
      {
        type: "ChangeTaskCategory",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "category-1",
        taskId: "task-1",
        fromCategory: "INBOX",
        category: "FOCUS",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
      },
      {
        type: "MoveTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "move-1",
        taskId: "task-2",
        leftTaskId: null,
        rightTaskId: "task-1",
      },
      {
        type: "CompleteTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "complete-1",
        taskId: "task-1",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
        categoryAtCompletion: "FOCUS",
      },
      {
        type: "ReopenTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "reopen-1",
        taskId: "task-1",
        effectiveDate: "2026-07-22",
        auditTime: CREATED_AT,
      },
      {
        type: "DeferTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "defer-1",
        taskId: "task-1",
        deferredUntil: "2026-07-23",
      },
      {
        type: "AddTag",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "tag-add-1",
        taskId: "task-1",
        tag: "important",
      },
      {
        type: "AddToDay",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "day-add-1",
        taskId: "task-1",
        date: "2026-07-22",
      },
      {
        type: "UpdateWorkspaceSettings",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "settings-1",
        timezone: "Europe/Moscow",
        fromTimezone: "UTC",
        startOfDay: "04:00",
        fromStartOfDay: "00:00",
        auditTime: CREATED_AT,
      },
      {
        type: "AppendAuditRecord",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "audit-operation-1",
        auditRecordId: "audit-1",
        auditKind: "manual-review",
        auditTime: CREATED_AT,
        taskId: "task-1",
        effectiveDate: "2026-07-22",
        data: { taskId: "task-1", result: "ok" },
      },
    ];
    for (const command of commands) {
      const result = await unitOfWork.commit(command);
      expect(result.changeHashes).toHaveLength(1);
    }

    expect(
      await database.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({
      title: "AXB",
      category: "DEFERRED",
      completion: "active",
      tags: ["important"],
    });
    expect(
      await database.dailySelectionProjections.get([
        WORKSPACE_ID,
        "2026-07-22",
        "task-1",
      ])
    ).toMatchObject({ selected: true });

    for (const command of [
      {
        type: "RemoveTag",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "tag-remove-1",
        taskId: "task-1",
        tag: "important",
      },
      {
        type: "RemoveFromDay",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "day-remove-1",
        taskId: "task-1",
        date: "2026-07-22",
      },
      {
        type: "DeferTask",
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        operationId: "undefer-1",
        taskId: "task-1",
        deferredUntil: null,
      },
    ] satisfies WorkspaceCommand[]) {
      await unitOfWork.commit(command);
    }

    const repository = new DexieWorkspaceRepository(database);
    const workspace = await repository.getWorkspace(WORKSPACE_ID, ACTOR_ID);
    expect(workspace?.state).toMatchObject({
      settings: { timezone: "Europe/Moscow", startOfDay: "04:00" },
      tasks: {
        "task-1": {
          title: "AXB",
          category: "FOCUS",
          completion: "active",
          deferredUntil: null,
          originalCategory: null,
        },
      },
      auditRecords: {
        "audit-1": {
          kind: "manual-review",
          data: { taskId: "task-1", result: "ok" },
        },
      },
    });
    expect(Object.keys(workspace?.state.completionRecords ?? {})).toEqual([
      "complete-1",
      "reopen-1",
    ]);
    expect(await database.auditProjections.count()).toBe(5);
    await expect(
      database.dailyStatisticsProjections.get([WORKSPACE_ID, "2026-07-22"])
    ).resolves.toMatchObject({
      simpleCompleted: 0,
      focusCompleted: 1,
      inboxReviewed: 1,
    });
    const auditBeforeRebuild = await database.auditProjections.toArray();
    const statisticsBeforeRebuild =
      await database.dailyStatisticsProjections.toArray();
    await database.auditProjections.clear();
    await database.dailyStatisticsProjections.clear();
    await unitOfWork.rebuildProjections(WORKSPACE_ID, ACTOR_ID);
    expect(await database.auditProjections.toArray()).toEqual(
      auditBeforeRebuild
    );
    expect(await database.dailyStatisticsProjections.toArray()).toEqual(
      statisticsBeforeRebuild
    );
    expect(
      (
        await repository.findTasks({
          workspaceId: WORKSPACE_ID,
          effectiveDate: "2026-07-22",
        })
      ).map(({ taskId }) => taskId)
    ).toEqual(["task-2", "task-1"]);
    expect(
      await repository.getTaskIdsForDay(WORKSPACE_ID, "2026-07-22")
    ).toEqual([]);
    expect(
      await database.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ category: "FOCUS", tags: [] });
  });

  it("keeps independent databases and port-owned binary inputs isolated", async () => {
    const first = createDatabase();
    const second = createDatabase();
    await Promise.all([first.open(), second.open()]);
    await createUnitOfWork(first).commit(createTaskCommand);
    await createUnitOfWork(second).commit({
      ...createTaskCommand,
      title: "Independent",
    });

    expect((await first.taskProjections.toArray())[0]?.title).toBe(
      "Atomic task"
    );
    expect((await second.taskProjections.toArray())[0]?.title).toBe(
      "Independent"
    );

    const { base, parent } = remoteChain();
    const third = createDatabase();
    await third.open();
    await activateRemoteRoom(third);
    await third.workspaceSnapshots.add({
      workspaceId: WORKSPACE_ID,
      schemaVersion: 1,
      bytes: base.save(),
      heads: [...base.heads()],
      savedAt: PERSISTED_AT,
    });
    const remote = remoteInput(parent, "$copy");
    const expectedBytes = [...remote.bytes];
    const applying = createUnitOfWork(third).applyRemote(remote);
    remote.bytes.fill(0);
    const applied = await applying;
    const stored = await third.workspaceChanges.get([
      WORKSPACE_ID,
      applied.changeHash,
    ]);
    expect(Array.from(stored?.bytes ?? [])).toEqual(expectedBytes);
  });

  it("fails closed for an unknown runtime command discriminator", async () => {
    const database = createDatabase();
    await database.open();
    const invalidCommand = structuredClone(createTaskCommand);
    Reflect.set(invalidCommand, "type", "UnknownCommand");

    await expect(
      createUnitOfWork(database).commit(invalidCommand)
    ).rejects.toThrow("Invalid workspace command type");
    expect(await database.workspaceSnapshots.count()).toBe(0);
    expect(await database.workspaceChanges.count()).toBe(0);
  });

  it("bootstraps a clean independent database from only the first outboxed binary change", async () => {
    const first = createDatabase();
    const second = createDatabase();
    await Promise.all([first.open(), second.open()]);
    await activateRemoteRoom(second);
    await first.syncTargets.add({
      id: "target-device-b",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!workspace:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    const firstUnitOfWork = createUnitOfWork(first);
    const secondUnitOfWork = new DexieWorkspaceUnitOfWork(
      second,
      new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
      new WorkspaceProjector(),
      {
        now: () => PERSISTED_AT + 1,
        effectiveDate: () => "2026-07-22",
      }
    );

    const local = await firstUnitOfWork.commit(createTaskCommand);
    const outbox = await first.syncOutbox.toArray();
    expect(outbox.map(({ changeHash }) => changeHash)).toEqual(
      local.changeHashes
    );
    expect(await second.workspaceSnapshots.count()).toBe(0);
    expect(await second.workspaceChanges.count()).toBe(0);

    for (const [index, changeHash] of local.changeHashes.entries()) {
      const stored = await first.workspaceChanges.get([
        WORKSPACE_ID,
        changeHash,
      ]);
      if (stored === undefined) {
        throw new Error(`Missing outboxed change ${changeHash}`);
      }
      const remote = await secondUnitOfWork.applyRemote({
        workspaceId: WORKSPACE_ID,
        actorId: "22".repeat(16),
        eventId: `$bootstrap-${index}`,
        roomId: "!workspace:example.test",
        senderUserId: "@device-a:example.test",
        senderDeviceId: "DEVICE-A",
        bytes: new Uint8Array([...stored.bytes]),
        changeHash: stored.changeHash,
        dependencies: [...stored.dependencies],
      });
      expect(remote.status).toBe("applied");
    }

    expect(await second.taskProjections.toArray()).toMatchObject([
      { taskId: "task-1", title: "Atomic task" },
    ]);
    const firstState = await new DexieWorkspaceRepository(first).getWorkspace(
      WORKSPACE_ID,
      ACTOR_ID
    );
    const secondState = await new DexieWorkspaceRepository(second).getWorkspace(
      WORKSPACE_ID,
      "22".repeat(16)
    );
    expect(secondState?.state).toEqual(firstState?.state);
    expect(secondState?.heads).toEqual(firstState?.heads);
    expect(await second.syncOutbox.count()).toBe(0);
  });

  it("recomputes deferred category for every explicit read date without mutation or rebuild", async () => {
    const database = createDatabase();
    await database.open();
    const unitOfWork = createUnitOfWork(database);
    await unitOfWork.commit({
      ...createTaskCommand,
      category: "FOCUS",
    });
    await unitOfWork.commit({
      type: "DeferTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "defer-date-read",
      taskId: "task-1",
      deferredUntil: "2026-07-23",
    });
    const before = await database.workspaceChanges.count();
    const repository = new DexieWorkspaceRepository(database);

    expect(
      await repository.findTask(WORKSPACE_ID, "task-1", "2026-07-22")
    ).toMatchObject({ category: "DEFERRED" });
    expect(
      await repository.findTask(WORKSPACE_ID, "task-1", "2026-07-23")
    ).toMatchObject({ category: "FOCUS" });
    expect(
      await repository.findTasks({
        workspaceId: WORKSPACE_ID,
        projectedCategory: "FOCUS",
        effectiveDate: "2026-07-23",
      })
    ).toHaveLength(1);
    expect(await database.workspaceChanges.count()).toBe(before);
    expect(
      await database.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ category: "DEFERRED" });
  });

  it("commits a queued text splice on its exact causal branch across a remote interleave and retries it exactly once", async () => {
    const deviceA = createDatabase();
    const deviceB = createDatabase();
    await Promise.all([deviceA.open(), deviceB.open()]);
    await activateRemoteRoom(deviceB);
    await deviceA.syncTargets.add({
      id: "target-device-b",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!workspace:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    const unitA = createUnitOfWork(deviceA);
    const unitB = createUnitOfWork(deviceB);

    const created = await unitA.commit({
      ...createTaskCommand,
      title: "ABCD",
      note: "",
    });
    const createHash = created.changeHashes[0];
    if (createHash === undefined) throw new Error("Expected create change");
    const createRecord = await deviceA.workspaceChanges.get([
      WORKSPACE_ID,
      createHash,
    ]);
    if (createRecord === undefined) throw new Error("Missing create change");
    await unitB.applyRemote(
      remoteInput(
        binaryChange(new Uint8Array([...createRecord.bytes])),
        "$text-create"
      )
    );

    const baseHeads = [...created.heads];
    const firstLocal = await unitA.commit({
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "text-a-insert-x",
      taskId: "task-1",
      path: "title",
      baseHeads,
      index: 2,
      deleteCount: 0,
      insert: "X",
    });
    const remote = await unitB.commit({
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: "22".repeat(16),
      operationId: "text-b-insert-r",
      taskId: "task-1",
      path: "title",
      baseHeads,
      index: 0,
      deleteCount: 0,
      insert: "R",
    });
    const remoteHash = remote.changeHashes[0];
    if (remoteHash === undefined)
      throw new Error("Expected remote text change");
    const remoteRecord = await deviceB.workspaceChanges.get([
      WORKSPACE_ID,
      remoteHash,
    ]);
    if (remoteRecord === undefined)
      throw new Error("Missing remote text change");
    await unitA.applyRemote(
      remoteInput(
        binaryChange(new Uint8Array([...remoteRecord.bytes])),
        "$text-remote-r"
      )
    );

    const secondCommand: WorkspaceCommand = {
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "text-a-insert-y",
      taskId: "task-1",
      path: "title",
      baseHeads: [...firstLocal.heads],
      index: 3,
      deleteCount: 0,
      insert: "Y",
    };
    const secondLocal = await unitA.commit(secondCommand);
    expect(
      await deviceA.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ title: "RABXYCD" });
    const countsAfterCommit = {
      changes: await deviceA.workspaceChanges.count(),
      outbox: await deviceA.syncOutbox.count(),
    };
    const retry = await unitA.commit(secondCommand);

    expect(
      await deviceA.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ title: "RABXYCD" });
    expect(secondLocal.changeHashes).toHaveLength(1);
    expect(retry.changeHashes).toEqual([]);
    expect({
      changes: await deviceA.workspaceChanges.count(),
      outbox: await deviceA.syncOutbox.count(),
    }).toEqual(countsAfterCommit);
    await expect(
      unitA.commit({ ...secondCommand, insert: "Z" })
    ).rejects.toThrow("operation actor");

    deviceA.close();
    openDatabases.delete(deviceA);
    await deviceA.open();
    openDatabases.add(deviceA);
    const reopened = await new DexieWorkspaceRepository(deviceA).getWorkspace(
      WORKSPACE_ID,
      ACTOR_ID
    );
    expect(reopened?.state.tasks["task-1"]?.title).toBe("RABXYCD");
    expect(reopened?.heads).toEqual(secondLocal.heads);
    for (const hash of [
      firstLocal.changeHashes[0],
      secondLocal.changeHashes[0],
    ]) {
      if (hash === undefined)
        throw new Error("Expected local text change hash");
      const stored = await deviceA.workspaceChanges.get([WORKSPACE_ID, hash]);
      expect(stored).toBeDefined();
      expect(() => Automerge.decodeChange(stored!.bytes)).not.toThrow();
    }
  });

  it("rejects a forged same-metadata operation actor whose Automerge payload differs from the intended splice", async () => {
    const database = createDatabase();
    await database.open();
    await database.syncTargets.add({
      id: "target",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!workspace:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    const unitOfWork = createUnitOfWork(database);
    const created = await unitOfWork.commit({
      ...createTaskCommand,
      title: "ABCD",
      note: "",
    });
    const intended: WorkspaceCommand = {
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "forged-same-metadata-operation",
      taskId: "task-1",
      path: "title",
      baseHeads: [...created.heads],
      index: 2,
      deleteCount: 0,
      insert: "X",
    };
    const snapshot = await database.workspaceSnapshots.get(WORKSPACE_ID);
    if (snapshot === undefined) throw new Error("Expected workspace snapshot");
    const expectedDocument = AutomergeWorkspaceDocument.load(
      new Uint8Array([...snapshot.bytes]),
      "55".repeat(16)
    );
    const expected = (
      await new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()).handle(
        expectedDocument,
        intended
      )
    )[0];
    if (expected === undefined)
      throw new Error("Expected intended text change");
    const expectedMetadata = Automerge.decodeChange(expected.bytes);
    if (typeof expectedMetadata.message !== "string") {
      throw new Error("Expected deterministic semantic message");
    }

    const rawBase = Automerge.load<WorkspaceState>(
      new Uint8Array([...snapshot.bytes]),
      { actor: expectedMetadata.actor }
    );
    const forgedResult = Automerge.changeAt(
      rawBase,
      [...created.heads],
      { message: expectedMetadata.message, time: 0 },
      (draft) => {
        Automerge.splice(draft, ["tasks", "task-1", "title"], 2, 0, "Z");
      }
    );
    const forgedBytes = Automerge.getChanges(rawBase, forgedResult.newDoc)[0];
    if (forgedBytes === undefined) throw new Error("Expected forged change");
    const forged = binaryChange(forgedBytes);
    const forgedMetadata = Automerge.decodeChange(forged.bytes);
    expect(forgedMetadata).toMatchObject({
      actor: expectedMetadata.actor,
      seq: 1,
      time: 0,
      message: expectedMetadata.message,
      deps: [...created.heads],
    });
    expect(forged.hash).not.toBe(expected.hash);
    expect(
      await unitOfWork.applyRemote(
        remoteInput(forged, "$forged-same-metadata-operation")
      )
    ).toMatchObject({ status: "applied" });
    expect(
      await database.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ title: "ABZCD" });
    const countsBeforeRetry = {
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    };

    await expect(unitOfWork.commit(intended)).rejects.toThrow("payload");

    expect({
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    }).toEqual(countsBeforeRetry);
    expect(
      await database.taskProjections.get([WORKSPACE_ID, "task-1"])
    ).toMatchObject({ title: "ABZCD" });
  });

  it("rebalances merged equal-key neighbours in one move and converges after shuffled duplicate delivery and reopen", async () => {
    const deviceA = createDatabase();
    const deviceB = createDatabase();
    await Promise.all([deviceA.open(), deviceB.open()]);
    await activateRemoteRoom(deviceB);
    const baseState = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
    baseState.tasks.moving = {
      id: "moving",
      title: "Moving",
      note: "",
      category: "INBOX",
      position: { key: "a1", actorId: "33".repeat(16) },
      created: { deviceId: "BASE", auditTime: CREATED_AT },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    const base = AutomergeWorkspaceDocument.create(baseState, ACTOR_ID);
    for (const database of [deviceA, deviceB]) {
      await database.workspaceSnapshots.add({
        workspaceId: WORKSPACE_ID,
        schemaVersion: 1,
        bytes: base.save(),
        heads: [...base.heads()],
        savedAt: PERSISTED_AT,
      });
    }
    await deviceA.syncTargets.add({
      id: "target-device-b",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!workspace:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    const unitA = createUnitOfWork(deviceA);
    const unitB = createUnitOfWork(deviceB);
    const createEqual = (
      actorId: string,
      operationId: string,
      taskId: string
    ): WorkspaceCommand => ({
      type: "CreateTask",
      workspaceId: WORKSPACE_ID,
      actorId,
      operationId,
      taskId,
      title: taskId,
      note: "",
      category: "INBOX",
      effectiveDate: "2026-07-22",
      deviceId: actorId,
      auditTime: CREATED_AT,
      leftTaskId: null,
      rightTaskId: "moving",
    });
    const left = await unitA.commit(
      createEqual(ACTOR_ID, "create-equal-left", "left")
    );
    const right = await unitB.commit(
      createEqual("22".repeat(16), "create-equal-right", "right")
    );
    const rightHash = right.changeHashes[0];
    if (rightHash === undefined)
      throw new Error("Expected right insert change");
    const rightRecord = await deviceB.workspaceChanges.get([
      WORKSPACE_ID,
      rightHash,
    ]);
    if (rightRecord === undefined)
      throw new Error("Missing right insert change");
    await unitA.applyRemote(
      remoteInput(
        binaryChange(new Uint8Array([...rightRecord.bytes])),
        "$equal-right"
      )
    );
    const beforeMove = await new DexieWorkspaceRepository(deviceA).getWorkspace(
      WORKSPACE_ID,
      ACTOR_ID
    );
    expect(beforeMove?.state.tasks.left.position.key).toBe(
      beforeMove?.state.tasks.right.position.key
    );

    const outboxBeforeMove = await deviceA.syncOutbox.count();
    const moved = await unitA.commit({
      type: "MoveTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "move-between-equal-neighbours",
      taskId: "moving",
      leftTaskId: "left",
      rightTaskId: "right",
    });
    expect(moved.changeHashes).toHaveLength(1);
    expect(await deviceA.syncOutbox.count()).toBe(outboxBeforeMove + 1);
    const canonicalA = await new DexieWorkspaceRepository(deviceA).getWorkspace(
      WORKSPACE_ID,
      ACTOR_ID
    );
    const orderedA = Object.values(canonicalA!.state.tasks).sort((a, b) =>
      a.position.key < b.position.key
        ? -1
        : a.position.key > b.position.key
          ? 1
          : a.position.actorId < b.position.actorId
            ? -1
            : a.position.actorId > b.position.actorId
              ? 1
              : a.id < b.id
                ? -1
                : 1
    );
    expect(orderedA.map(({ id }) => id)).toEqual(["left", "moving", "right"]);
    expect(new Set(orderedA.map(({ position }) => position.key)).size).toBe(3);
    expect(canonicalA?.state.tasks.left.position.actorId).toBe(ACTOR_ID);
    expect(canonicalA?.state.tasks.right.position.actorId).toBe(
      "22".repeat(16)
    );

    const leftHash = left.changeHashes[0];
    const moveHash = moved.changeHashes[0];
    if (leftHash === undefined || moveHash === undefined) {
      throw new Error("Expected left and move changes");
    }
    const leftRecord = await deviceA.workspaceChanges.get([
      WORKSPACE_ID,
      leftHash,
    ]);
    const moveRecord = await deviceA.workspaceChanges.get([
      WORKSPACE_ID,
      moveHash,
    ]);
    if (leftRecord === undefined || moveRecord === undefined) {
      throw new Error("Missing left or move change");
    }
    expect(
      await unitB.applyRemote(
        remoteInput(
          binaryChange(new Uint8Array([...moveRecord.bytes])),
          "$equal-move"
        )
      )
    ).toMatchObject({ status: "waiting-dependencies" });
    expect(
      await unitB.applyRemote(
        remoteInput(
          binaryChange(new Uint8Array([...leftRecord.bytes])),
          "$equal-left"
        )
      )
    ).toMatchObject({ status: "applied" });
    expect(
      await unitB.applyRemote(
        remoteInput(
          binaryChange(new Uint8Array([...moveRecord.bytes])),
          "$equal-move"
        )
      )
    ).toMatchObject({ status: "duplicate" });
    expect(
      await unitB.applyRemote(
        remoteInput(
          binaryChange(new Uint8Array([...leftRecord.bytes])),
          "$equal-left"
        )
      )
    ).toMatchObject({ status: "duplicate" });

    deviceB.close();
    openDatabases.delete(deviceB);
    await deviceB.open();
    openDatabases.add(deviceB);
    const canonicalB = await new DexieWorkspaceRepository(deviceB).getWorkspace(
      WORKSPACE_ID,
      "22".repeat(16)
    );
    expect(canonicalB?.state).toEqual(canonicalA?.state);
    expect(canonicalB?.heads).toEqual(canonicalA?.heads);
  });

  it("persists no lifecycle artifact for already-target completion states", async () => {
    const database = createDatabase();
    await database.open();
    await database.syncTargets.add({
      id: "target",
      workspaceId: WORKSPACE_ID,
      serverProfileId: "profile-1",
      roomId: "!workspace:example.test",
      mode: "active",
      state: "active",
      createdAt: PERSISTED_AT,
      updatedAt: PERSISTED_AT,
    });
    const unitOfWork = createUnitOfWork(database);
    await unitOfWork.commit(createTaskCommand);
    const initialCounts = {
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    };

    const alreadyActive = await unitOfWork.commit({
      type: "ReopenTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "reopen-already-active",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      auditTime: CREATED_AT,
    });
    expect(alreadyActive.changeHashes).toEqual([]);
    expect({
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    }).toEqual(initialCounts);

    const completed = await unitOfWork.commit({
      type: "CompleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "complete-transition",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      auditTime: CREATED_AT,
      categoryAtCompletion: "INBOX",
    });
    const afterCompletion = {
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    };
    const alreadyCompleted = await unitOfWork.commit({
      type: "CompleteTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "complete-already-completed",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      auditTime: CREATED_AT,
      categoryAtCompletion: "INBOX",
    });
    expect(completed.changeHashes).toHaveLength(1);
    expect(alreadyCompleted.changeHashes).toEqual([]);
    expect({
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    }).toEqual(afterCompletion);

    const reopened = await unitOfWork.commit({
      type: "ReopenTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "reopen-transition",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      auditTime: CREATED_AT,
    });
    const afterReopen = {
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    };
    const activeAgain = await unitOfWork.commit({
      type: "ReopenTask",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      operationId: "reopen-already-active-again",
      taskId: "task-1",
      effectiveDate: "2026-07-22",
      auditTime: CREATED_AT,
    });
    expect(reopened.changeHashes).toHaveLength(1);
    expect(activeAgain.changeHashes).toEqual([]);
    expect({
      changes: await database.workspaceChanges.count(),
      outbox: await database.syncOutbox.count(),
    }).toEqual(afterReopen);

    const workspace = await new DexieWorkspaceRepository(database).getWorkspace(
      WORKSPACE_ID,
      ACTOR_ID
    );
    expect(Object.keys(workspace!.state.completionRecords)).toEqual([
      "complete-transition",
      "reopen-transition",
    ]);
  });
});
