import Dexie from "dexie";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import type { CurrentActor } from "../../../../workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../../workspaces/application/ports/CurrentWorkspace";
import type {
  AcceptedRemoteChange,
  WorkspaceUnitOfWork,
} from "../../../../workspaces/application/ports/WorkspaceUnitOfWork";
import { createEmptyWorkspace } from "../../../../workspaces/domain/WorkspaceState";
import { Sha256OccurrenceIdFactory } from "../../../../workspaces/infrastructure/crypto/Sha256OccurrenceIdFactory";
import { AutomergeCommandHandler } from "../../../../workspaces/infrastructure/crdt/AutomergeCommandHandler";
import { AutomergeWorkspaceDocument } from "../../../../workspaces/infrastructure/crdt/AutomergeWorkspaceDocument";
import { WorkspaceProjector } from "../../../../workspaces/infrastructure/crdt/WorkspaceProjector";
import { DexieWorkspaceRepository } from "../../../../workspaces/infrastructure/database/DexieWorkspaceRepository";
import { DexieWorkspaceUnitOfWork } from "../../../../workspaces/infrastructure/database/DexieWorkspaceUnitOfWork";
import { LiftSecureDatabase } from "../../../../workspaces/infrastructure/database/LiftSecureDatabase";
import {
  createCollaborativeTextViewModel,
  type CollaborativeTextProjection,
  type CollaborativeTextViewModel,
} from "../CollaborativeTextViewModel";

const WORKSPACE_ID = "workspace-text-convergence";
const TASK_ID = "task-1";
const ACTOR_A = "11".repeat(16);
const ACTOR_B = "22".repeat(16);
const NOW = Date.parse("2026-07-22T08:00:00.000Z");

const databaseNames = new Set<string>();
const databases = new Set<LiftSecureDatabase>();

const createDatabase = (): LiftSecureDatabase => {
  const name = `LiftSecureDatabase-task-8b-${crypto.randomUUID()}`;
  databaseNames.add(name);
  const database = new LiftSecureDatabase(name);
  databases.add(database);
  return database;
};

const activateRemoteRoom = (database: LiftSecureDatabase): Promise<string> =>
  database.syncTargets.add({
    id: "remote-test-target",
    workspaceId: WORKSPACE_ID,
    serverProfileId: "remote-test-profile",
    roomId: "!workspace:example.test",
    mode: "active",
    state: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });

const cleanup = async (): Promise<void> => {
  for (const database of databases) database.close();
  databases.clear();
  for (const name of databaseNames) await Dexie.delete(name);
  databaseNames.clear();
};

const unitOfWork = (database: LiftSecureDatabase) =>
  new DexieWorkspaceUnitOfWork(
    database,
    new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
    new WorkspaceProjector(),
    {
      now: () => NOW,
      effectiveDate: () => "2026-07-22",
    }
  );

const actor = (actorId: string): CurrentActor => {
  let operation = 0;
  return {
    require: () => ({ actorId, deviceId: `device-${actorId.slice(0, 4)}` }),
    nextOperationId: () => `${actorId}-operation-${++operation}`,
    auditTime: () => "2026-07-22T08:00:00.000Z",
  };
};

const workspace: CurrentWorkspace = {
  getId: () => WORKSPACE_ID as ReturnType<CurrentWorkspace["getId"]>,
  requireId: () => WORKSPACE_ID as ReturnType<CurrentWorkspace["requireId"]>,
};

const initialProjection = (
  text: string,
  heads: readonly string[]
): CollaborativeTextProjection => ({
  workspaceId: WORKSPACE_ID,
  taskId: TASK_ID,
  path: "title",
  text,
  heads: [...heads].sort(),
  includedChangeHashes: [...heads].sort(),
});

const authoritativeProjection = async (
  database: LiftSecureDatabase,
  actorId: string,
  genesisHeads: readonly string[]
): Promise<CollaborativeTextProjection> => {
  const repository = new DexieWorkspaceRepository(database);
  const [task, workspaceState, changes] = await Promise.all([
    repository.findTask(WORKSPACE_ID, TASK_ID, "2026-07-22"),
    repository.getWorkspace(WORKSPACE_ID, actorId),
    database.workspaceChanges.toArray(),
  ]);
  if (!task || !workspaceState) {
    throw new Error("Expected an authoritative task projection");
  }
  return {
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    path: "title",
    text: task.title,
    heads: [...workspaceState.heads].sort(),
    includedChangeHashes: [
      ...new Set([
        ...genesisHeads,
        ...changes.map(({ changeHash }) => changeHash),
      ]),
    ].sort(),
  };
};

const remote = (
  record: {
    readonly bytes: Uint8Array;
    readonly changeHash: string;
    readonly dependencies: readonly string[];
  },
  actorId: string,
  eventId: string
): AcceptedRemoteChange => ({
  workspaceId: WORKSPACE_ID,
  actorId,
  eventId,
  roomId: "!workspace:example.test",
  senderUserId: `@${actorId.slice(0, 4)}:example.test`,
  senderDeviceId: `device-${actorId.slice(0, 4)}`,
  bytes: new Uint8Array([...record.bytes]),
  changeHash: record.changeHash,
  dependencies: [...record.dependencies],
});

describe("collaborative text convergence", () => {
  afterEach(cleanup);
  afterAll(cleanup);

  it("converges disjoint edits from two actors after opposite and duplicate delivery", async () => {
    const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
    state.tasks[TASK_ID] = {
      id: TASK_ID,
      title: "Alpha omega",
      note: "",
      category: "INBOX",
      position: { key: "a0", actorId: ACTOR_A },
      created: {
        deviceId: "seed-device",
        auditTime: "2026-07-22T08:00:00.000Z",
      },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    const base = AutomergeWorkspaceDocument.create(state, "aa".repeat(16));
    const databaseA = createDatabase();
    const databaseB = createDatabase();
    await Promise.all([databaseA.open(), databaseB.open()]);
    await Promise.all(
      [databaseA, databaseB].map((database) =>
        database.workspaceSnapshots.add({
          workspaceId: WORKSPACE_ID,
          schemaVersion: 1,
          bytes: base.save(),
          heads: [...base.heads()],
          savedAt: NOW,
        })
      )
    );
    await Promise.all(
      [databaseA, databaseB].map((database) => activateRemoteRoom(database))
    );

    const uowA = unitOfWork(databaseA);
    const uowB = unitOfWork(databaseB);
    const editorA = createCollaborativeTextViewModel(
      { workspace, actor: actor(ACTOR_A), unitOfWork: uowA },
      {
        taskId: TASK_ID,
        path: "title",
        initialProjection: initialProjection("Alpha omega", base.heads()),
      }
    );
    const editorB = createCollaborativeTextViewModel(
      { workspace, actor: actor(ACTOR_B), unitOfWork: uowB },
      {
        taskId: TASK_ID,
        path: "title",
        initialProjection: initialProjection("Alpha omega", base.heads()),
      }
    );

    editorA.setText("Alpha brave omega");
    editorB.setText("Alpha omega!");
    await Promise.all([editorB.flush(), editorA.flush()]);

    const [changeA] = await databaseA.workspaceChanges.toArray();
    const [changeB] = await databaseB.workspaceChanges.toArray();
    expect(changeA).toBeDefined();
    expect(changeB).toBeDefined();

    await expect(
      uowA.applyRemote(remote(changeB, ACTOR_B, "$b-before-a"))
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      uowB.applyRemote(remote(changeA, ACTOR_A, "$a-after-b"))
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      uowB.applyRemote(remote(changeA, ACTOR_A, "$a-duplicate"))
    ).resolves.toMatchObject({ status: "duplicate" });
    await expect(
      uowA.applyRemote(remote(changeB, ACTOR_B, "$b-duplicate"))
    ).resolves.toMatchObject({ status: "duplicate" });

    expect(
      editorA.applyProjection(
        await authoritativeProjection(databaseA, ACTOR_A, base.heads())
      )
    ).toBe(true);
    expect(
      editorB.applyProjection(
        await authoritativeProjection(databaseB, ACTOR_B, base.heads())
      )
    ).toBe(true);

    const repositoryA = new DexieWorkspaceRepository(databaseA);
    const repositoryB = new DexieWorkspaceRepository(databaseB);
    const [taskA, taskB, workspaceA, workspaceB] = await Promise.all([
      repositoryA.findTask(WORKSPACE_ID, TASK_ID, "2026-07-22"),
      repositoryB.findTask(WORKSPACE_ID, TASK_ID, "2026-07-22"),
      repositoryA.getWorkspace(WORKSPACE_ID, ACTOR_A),
      repositoryB.getWorkspace(WORKSPACE_ID, ACTOR_B),
    ]);

    expect(taskA?.title).toBe("Alpha brave omega!");
    expect(taskB?.title).toBe(taskA?.title);
    expect(workspaceA?.heads).toEqual([...(workspaceA?.heads ?? [])].sort());
    expect(workspaceB?.heads).toEqual([...(workspaceB?.heads ?? [])].sort());
    expect(workspaceB?.heads).toEqual(workspaceA?.heads);
    expect(editorA.getSnapshot()).toMatchObject({
      text: "Alpha brave omega!",
      dirty: false,
      saving: false,
    });
    expect(editorB.getSnapshot()).toMatchObject({
      text: "Alpha brave omega!",
      dirty: false,
      saving: false,
    });
  });

  it("preserves queued local intent when a real remote transaction interleaves local commits", async () => {
    const state = createEmptyWorkspace(WORKSPACE_ID, "UTC", "00:00");
    state.tasks[TASK_ID] = {
      id: TASK_ID,
      title: "ABCD",
      note: "",
      category: "INBOX",
      position: { key: "a0", actorId: ACTOR_A },
      created: {
        deviceId: "seed-device",
        auditTime: "2026-07-22T08:00:00.000Z",
      },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    };
    const base = AutomergeWorkspaceDocument.create(state, "aa".repeat(16));
    const databaseA = createDatabase();
    const databaseB = createDatabase();
    await Promise.all([databaseA.open(), databaseB.open()]);
    await Promise.all(
      [databaseA, databaseB].map((database) =>
        database.workspaceSnapshots.add({
          workspaceId: WORKSPACE_ID,
          schemaVersion: 1,
          bytes: base.save(),
          heads: [...base.heads()],
          savedAt: NOW,
        })
      )
    );
    await Promise.all(
      [databaseA, databaseB].map((database) => activateRemoteRoom(database))
    );

    const uowA = unitOfWork(databaseA);
    const uowB = unitOfWork(databaseB);
    await uowB.commit({
      type: "SpliceTaskText",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_B,
      operationId: "remote-insert-r",
      taskId: TASK_ID,
      path: "title",
      baseHeads: [...base.heads()],
      index: 0,
      deleteCount: 0,
      insert: "R",
    });
    const [changeB] = await databaseB.workspaceChanges.toArray();
    expect(changeB).toBeDefined();

    const editorARef: { current?: CollaborativeTextViewModel } = {};
    let localCommitCount = 0;
    const interleavingUnitOfWork: WorkspaceUnitOfWork = {
      applyRemote: (input) => uowA.applyRemote(input),
      commit: async (command, events) => {
        const result = await uowA.commit(command, events);
        localCommitCount += 1;
        if (localCommitCount === 1) {
          await uowA.applyRemote(
            remote(changeB, ACTOR_B, "$remote-between-local-commits")
          );
        }
        const envelope = await authoritativeProjection(
          databaseA,
          ACTOR_A,
          base.heads()
        );
        editorARef.current?.applyProjection(envelope);
        return result;
      },
    };
    const editorA = createCollaborativeTextViewModel(
      {
        workspace,
        actor: actor(ACTOR_A),
        unitOfWork: interleavingUnitOfWork,
      },
      {
        taskId: TASK_ID,
        path: "title",
        initialProjection: initialProjection("ABCD", base.heads()),
      }
    );
    editorARef.current = editorA;

    editorA.focus();
    editorA.setText("ABXCD");
    editorA.setText("ABXYCD");
    await editorA.flush();

    const repositoryA = new DexieWorkspaceRepository(databaseA);
    expect(
      await repositoryA.findTask(WORKSPACE_ID, TASK_ID, "2026-07-22")
    ).toMatchObject({ title: "RABXYCD" });
    expect(editorA.getSnapshot()).toMatchObject({
      text: "RABXYCD",
      projectedText: "RABXYCD",
      dirty: false,
      saving: false,
      error: null,
    });
    expect(await databaseA.workspaceChanges.count()).toBe(3);

    await expect(
      uowA.applyRemote(remote(changeB, ACTOR_B, "$remote-duplicate"))
    ).resolves.toMatchObject({ status: "duplicate" });
    expect(await databaseA.workspaceChanges.count()).toBe(3);

    const databaseName = databaseA.name;
    databaseA.close();
    const reopened = new LiftSecureDatabase(databaseName);
    databases.add(reopened);
    await reopened.open();
    const reopenedRepository = new DexieWorkspaceRepository(reopened);
    const reopenedWorkspace = await reopenedRepository.getWorkspace(
      WORKSPACE_ID,
      ACTOR_A
    );
    expect(
      await reopenedRepository.findTask(WORKSPACE_ID, TASK_ID, "2026-07-22")
    ).toMatchObject({ title: "RABXYCD" });
    expect(reopenedWorkspace?.heads).toEqual(
      [...(reopenedWorkspace?.heads ?? [])].sort()
    );
  });
});
