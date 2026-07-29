import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import {
  add,
  emptySet,
  removeObserved,
} from "../../../domain/ObservedRemoveSet";
import {
  createEmptyWorkspace,
  type TaskCrdtState,
  type WorkspaceState,
} from "../../../domain/WorkspaceState";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { DexieOfflineWorkspaceStore } from "../DexieOfflineWorkspaceStore";
import { LiftSecureDatabase } from "../LiftSecureDatabase";

const ACTOR_ID = "11".repeat(16);
const databases: LiftSecureDatabase[] = [];

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const createDatabase = async (): Promise<LiftSecureDatabase> => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

const task = (
  id: string,
  overrides: Partial<TaskCrdtState> = {}
): TaskCrdtState => ({
  id,
  title: `Title ${id}`,
  note: `Note ${id}`,
  category: "INBOX",
  position: { key: id, actorId: ACTOR_ID },
  created: { deviceId: "DEVICE", auditTime: "2026-07-01T00:00:00.000Z" },
  inboxEnteredOn: "2026-07-01",
  deferredUntil: null,
  originalCategory: null,
  completion: "active",
  completionEpoch: 0,
  tags: emptySet(),
  deletionDots: {},
  ...overrides,
});

const seedSnapshot = async (
  database: LiftSecureDatabase,
  workspaceId: string,
  savedAt: number,
  mutate: (state: WorkspaceState) => void = () => undefined
): Promise<void> => {
  const state = createEmptyWorkspace(workspaceId, "UTC", "00:00");
  mutate(state);
  const document = AutomergeWorkspaceDocument.create(state, ACTOR_ID);
  await database.workspaceSnapshots.add({
    workspaceId,
    schemaVersion: 1,
    bytes: document.save(),
    heads: [...document.heads()],
    savedAt,
  });
};

const seedTarget = async (
  database: LiftSecureDatabase,
  workspaceId: string,
  mode: "active" | "read-only",
  state: "active" | "paused"
): Promise<void> => {
  await database.syncTargets.add({
    id: `target_${workspaceId}`,
    workspaceId,
    serverProfileId: "profile",
    roomId: `!${workspaceId}:test`,
    mode,
    state,
    createdAt: 1,
    updatedAt: 2,
  });
};

const seedRetainedChange = async (
  database: LiftSecureDatabase,
  workspaceId: string,
  createdAt: number
): Promise<void> => {
  const snapshot = await database.workspaceSnapshots.get(workspaceId);
  if (snapshot === undefined) throw new Error("Expected seeded snapshot");
  const document = AutomergeWorkspaceDocument.load(
    new Uint8Array([...snapshot.bytes]),
    "22".repeat(16)
  );
  const change = document.change("retained change", (draft) => {
    draft.settings.startOfDay = "01:00";
  })[0];
  if (change === undefined) throw new Error("Expected retained change");
  await database.workspaceChanges.add({
    workspaceId,
    changeHash: change.hash,
    bytes: change.bytes,
    dependencies: [...change.dependencies],
    origin: "local",
    createdAt,
  });
};

const seedDeletionArtifacts = async (
  database: LiftSecureDatabase,
  workspaceId: string,
  ordinal: number
): Promise<void> => {
  const id = `${workspaceId}_${ordinal}`;
  await seedSnapshot(database, workspaceId, 1_000 + ordinal);
  await database.workspaceMetadata.add({
    workspaceId,
    createdAt: 900 + ordinal,
  });
  await seedRetainedChange(database, workspaceId, 950 + ordinal);
  await database.taskProjections.add({
    workspaceId,
    taskId: `task_${id}`,
    title: id,
    note: "",
    tags: [],
    category: "INBOX",
    completion: "active",
    positionKey: "a",
    deferredUntil: null,
    inboxEnteredOn: "2026-07-01",
    deleted: false,
    updatedAt: 1_000 + ordinal,
  });
  await database.dailySelectionProjections.add({
    workspaceId,
    date: "2026-07-01",
    taskId: `task_${id}`,
    selected: true,
    updatedAt: 1_000 + ordinal,
  });
  await database.conflictProjections.add({
    id: `conflict_${id}`,
    workspaceId,
    taskId: `task_${id}`,
    path: "title",
    winningValue: id,
    alternativeValues: [],
    state: "unresolved",
    detectedAt: 1_000 + ordinal,
    resolvedAt: null,
  });
  await database.auditProjections.add({
    workspaceId,
    source: "audit",
    recordId: `audit_${id}`,
    taskId: `task_${id}`,
    effectiveDate: "2026-07-01",
    kind: "seed.v1",
    actorId: ACTOR_ID,
    auditTime: "2026-07-01T00:00:00.000Z",
    data: { id },
  });
  await database.dailyStatisticsProjections.add({
    workspaceId,
    date: "2026-07-01",
    simpleCompleted: ordinal,
    focusCompleted: 0,
    inboxReviewed: 0,
  });
  await database.syncOutbox.add({
    id: `outbox_${id}`,
    workspaceId,
    targetId: `target_${id}`,
    changeHash: `change_${id}`,
    innerType: "dev.lift.crdt.change.v1",
    authEpoch: 0,
    state: "pending",
    attemptCount: 0,
    nextAttemptAt: 1_000 + ordinal,
    lastError: null,
    matrixTxnId: `txn_${id}`,
    matrixEventIds: [],
    nextFragmentIndex: 0,
  });
  await database.syncInbox.add({
    eventId: `$inbox_${id}`,
    workspaceId,
    roomId: `!${id}:test`,
    wireEvent: JSON.stringify({ id }),
    state: "received",
    receivedAt: 1_000 + ordinal,
    lastError: null,
  });
  await database.matrixEventIndex.add({
    eventId: `$index_${id}`,
    workspaceId,
    changeHash: `change_${id}`,
    roomId: `!${id}:test`,
    senderUserId: "@alice:test",
    senderDeviceId: "DEVICE",
    receivedAt: 1_000 + ordinal,
  });
  await database.verifiedCheckpoints.add({
    hash: `verified_${id}`,
    workspaceId,
    schemaVersion: 1,
    authEpoch: 1,
    heads: [`head_${id}`],
    coveredChangeHashes: [`change_${id}`],
    compressedSnapshot: new Uint8Array([ordinal]),
    matrixEventIds: [`$checkpoint_${id}`],
    verifiedAt: 1_000 + ordinal,
  });
  await database.checkpointPublications.add({
    id: `publication_${id}`,
    hash: `publication_hash_${id}`,
    workspaceId,
    targetId: `target_${id}`,
    schemaVersion: 1,
    authEpoch: 1,
    heads: [`head_${id}`],
    coveredChangeHashes: [`change_${id}`],
    compressedSnapshot: new Uint8Array([ordinal + 1]),
    createdAt: 1_000 + ordinal,
  });
  await database.quarantine.add({
    id: `quarantine_${id}`,
    eventId: `$quarantine_${id}`,
    workspaceId,
    reason: "invalid-schema",
    detail: id,
    createdAt: 1_000 + ordinal,
  });
  await database.payloadFragments.add({
    direction: "outbound",
    transferId: `transfer_${id}`,
    index: 0,
    count: 1,
    workspaceId,
    changeHash: `change_${id}`,
    fragmentHash: `fragment_${id}`,
    bytes: new Uint8Array([ordinal + 2]),
    matrixEventId: null,
  });
  await database.domainEvents.add({
    id: `domain_${id}`,
    workspaceId,
    aggregateId: `aggregate_${id}`,
    aggregateType: "Task",
    eventType: "seed.v1",
    aggregateSequence: 1,
    payload: JSON.stringify({ id }),
    occurredAt: 1_000 + ordinal,
    status: "done",
    attemptCount: 0,
    nextAttemptAt: 1_000 + ordinal,
    leaseUntil: null,
    lastError: null,
  });
  await database.handledDomainEvents.add({
    eventId: `domain_${id}`,
    handlerId: "seed-handler",
    handledAt: 1_000 + ordinal,
  });
};

describe("DexieOfflineWorkspaceStore", () => {
  it("lists only snapshots without any target, ACL, or migration certificate", async () => {
    const database = await createDatabase();
    await seedSnapshot(database, "ws_candidate", 500, (state) => {
      state.tasks.active = task("active");
      state.tasks.deleted = task("deleted", {
        deletionDots: { [`1@${ACTOR_ID}`]: true },
      });
    });
    await database.workspaceMetadata.add({
      workspaceId: "ws_candidate",
      createdAt: 100,
    });

    await seedSnapshot(database, "ws_active_target", 200);
    await seedTarget(database, "ws_active_target", "active", "active");

    await seedSnapshot(database, "ws_paused_target", 300);
    await seedTarget(database, "ws_paused_target", "read-only", "paused");

    await seedSnapshot(database, "ws_acl", 400);
    await database.aclCheckpoints.add({
      workspaceId: "ws_acl",
      authEpoch: 1,
      hash: "acl-hash",
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 400,
    });

    await seedSnapshot(database, "ws_certificate", 600);
    await database.migrationCertificates.add({
      hash: "certificate-hash",
      workspaceId: "ws_certificate",
      sourceTargetId: "source",
      targetTargetId: "target",
      sourceAclHash: "source-acl",
      targetAclHash: "target-acl",
      heads: ["head"],
      bytes: new Uint8Array([2]),
      sourceEventId: "$source",
      targetEventId: "$target",
      verifiedAt: 600,
    });

    const store = new DexieOfflineWorkspaceStore(database);

    await expect(store.listCandidates()).resolves.toEqual([
      {
        workspaceId: "ws_candidate",
        createdAt: 100,
        createdAtSource: "metadata",
        taskCount: 1,
      },
    ]);
  });

  it("estimates legacy creation from the earliest retained snapshot or change", async () => {
    const database = await createDatabase();
    await seedSnapshot(database, "ws_snapshot_earliest", 200);
    await seedSnapshot(database, "ws_change_earliest", 400);
    await seedRetainedChange(database, "ws_snapshot_earliest", 300);
    await seedRetainedChange(database, "ws_change_earliest", 150);

    const store = new DexieOfflineWorkspaceStore(database);

    await expect(store.listCandidates()).resolves.toEqual([
      {
        workspaceId: "ws_change_earliest",
        createdAt: 150,
        createdAtSource: "estimated",
        taskCount: 0,
      },
      {
        workspaceId: "ws_snapshot_earliest",
        createdAt: 200,
        createdAtSource: "estimated",
        taskCount: 0,
      },
    ]);
  });

  it("reads canonical tasks, active tags, and all active selected dates", async () => {
    const database = await createDatabase();
    await seedSnapshot(database, "ws_source", 100, (state) => {
      const activeTags = add(
        add(emptySet(), "zeta", `1@${ACTOR_ID}`),
        "alpha",
        `2@${ACTOR_ID}`
      );
      state.tasks.second = task("second", {
        title: "Second",
        category: "FOCUS",
        position: { key: "b", actorId: ACTOR_ID },
        tags: removeObserved(activeTags, "zeta"),
        deferredUntil: "2026-08-01",
        originalCategory: "SIMPLE",
        completion: "completed",
        completionBaselineEpoch: 1,
        completionEpoch: 1,
        importedFrom: {
          version: "lift-offline-import-v1",
          sourceWorkspaceId: "ws_legacy",
          sourceTaskId: "legacy-second",
          targetWorkspaceId: "ws_source",
        },
      });
      state.tasks.first = task("first", {
        title: "First",
        category: "SIMPLE",
        position: { key: "a", actorId: ACTOR_ID },
        tags: add(emptySet(), "beta", `3@${ACTOR_ID}`),
      });
      state.tasks.deleted = task("deleted", {
        deletionDots: { [`4@${ACTOR_ID}`]: true },
      });
      state.dailySelections["2026-07-03"] = add(
        emptySet(),
        "first",
        `5@${ACTOR_ID}`
      );
      state.dailySelections["2026-07-01"] = add(
        emptySet(),
        "first",
        `6@${ACTOR_ID}`
      );
      state.dailySelections["2026-07-02"] = removeObserved(
        add(emptySet(), "first", `7@${ACTOR_ID}`),
        "first"
      );
      state.dailySelections["2026-07-04"] = add(
        emptySet(),
        "deleted",
        `8@${ACTOR_ID}`
      );
    });

    const store = new DexieOfflineWorkspaceStore(database);

    await expect(store.readCandidate("ws_source")).resolves.toEqual({
      workspaceId: "ws_source",
      tasks: [
        {
          sourceTaskId: "first",
          title: "First",
          note: "Note first",
          category: "SIMPLE",
          deferredUntil: null,
          originalCategory: null,
          completion: "active",
          inboxEnteredOn: "2026-07-01",
          tags: ["beta"],
          selectedDates: ["2026-07-01", "2026-07-03"],
        },
        {
          sourceTaskId: "second",
          title: "Second",
          note: "Note second",
          category: "FOCUS",
          deferredUntil: "2026-08-01",
          originalCategory: "SIMPLE",
          completion: "completed",
          inboxEnteredOn: "2026-07-01",
          tags: ["alpha"],
          selectedDates: [],
        },
      ],
    });
  });

  it.each(["target", "acl", "certificate"] as const)(
    "rejects reading a candidate that gained %s binding evidence",
    async (guard) => {
      const database = await createDatabase();
      await seedSnapshot(database, "ws_source", 100);
      const store = new DexieOfflineWorkspaceStore(database);
      await expect(store.listCandidates()).resolves.toHaveLength(1);

      if (guard === "target") {
        await seedTarget(database, "ws_source", "active", "active");
      } else if (guard === "acl") {
        await database.aclCheckpoints.add({
          workspaceId: "ws_source",
          authEpoch: 1,
          hash: "acl-hash",
          previousHash: null,
          bytes: new Uint8Array([1]),
          createdAt: 101,
        });
      } else {
        await database.migrationCertificates.add({
          hash: "certificate-hash",
          workspaceId: "ws_source",
          sourceTargetId: "source",
          targetTargetId: "target",
          sourceAclHash: "source-acl",
          targetAclHash: "target-acl",
          heads: ["head"],
          bytes: new Uint8Array([2]),
          sourceEventId: "$source",
          targetEventId: "$target",
          verifiedAt: 101,
        });
      }

      await expect(store.readCandidate("ws_source")).rejects.toThrow(/bound/i);
    }
  );

  it.each(["target", "acl"] as const)(
    "refuses deletion when a %s appears after candidate listing",
    async (guard) => {
      const database = await createDatabase();
      await seedSnapshot(database, "ws_source", 100);
      const store = new DexieOfflineWorkspaceStore(database);
      await expect(store.listCandidates()).resolves.toHaveLength(1);

      if (guard === "target") {
        await seedTarget(database, "ws_source", "read-only", "paused");
      } else {
        await database.aclCheckpoints.add({
          workspaceId: "ws_source",
          authEpoch: 1,
          hash: "late-acl",
          previousHash: null,
          bytes: new Uint8Array([1]),
          createdAt: 101,
        });
      }

      await expect(store.deleteCandidate("ws_source")).rejects.toThrow(
        /bound/i
      );
      await expect(
        database.workspaceSnapshots.get("ws_source")
      ).resolves.toBeDefined();
      await expect(
        guard === "target"
          ? database.syncTargets
              .where("workspaceId")
              .equals("ws_source")
              .count()
          : database.aclCheckpoints
              .where("workspaceId")
              .equals("ws_source")
              .count()
      ).resolves.toBe(1);
    }
  );

  it("deletes exactly the source workspace artifacts in one scoped operation", async () => {
    const database = await createDatabase();
    await seedDeletionArtifacts(database, "ws_source", 1);
    await seedDeletionArtifacts(database, "ws_other", 2);
    await seedTarget(database, "ws_other", "read-only", "paused");
    await database.aclCheckpoints.add({
      workspaceId: "ws_other",
      authEpoch: 1,
      hash: "other-acl",
      previousHash: null,
      bytes: new Uint8Array([7]),
      createdAt: 1_002,
    });
    await database.migrationCertificates.add({
      hash: "other-certificate",
      workspaceId: "ws_other",
      sourceTargetId: "source",
      targetTargetId: "target",
      sourceAclHash: "source-acl",
      targetAclHash: "target-acl",
      heads: ["head"],
      bytes: new Uint8Array([8]),
      sourceEventId: "$source",
      targetEventId: "$target",
      verifiedAt: 1_002,
    });
    await database.serverProfiles.add({
      id: "profile",
      name: "Profile",
      baseUrl: "https://matrix.test",
    });
    await database.localSecrets.add({
      id: "secret",
      serverProfileId: "profile",
      schemaVersion: 1,
      kind: "aes-gcm-ciphertext",
      wrappingKeyId: "wrapping-key",
      ciphertext: new Uint8Array([9]),
      iv: new Uint8Array(12),
      createdAt: 1,
      updatedAt: 2,
    });

    const otherBefore = {
      snapshot: await database.workspaceSnapshots.get("ws_other"),
      metadata: await database.workspaceMetadata.get("ws_other"),
      changes: await database.workspaceChanges
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      tasks: await database.taskProjections
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      selections: await database.dailySelectionProjections
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      conflicts: await database.conflictProjections
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      audits: await database.auditProjections
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      statistics: await database.dailyStatisticsProjections
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      outbox: await database.syncOutbox
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      inbox: await database.syncInbox
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      eventIndex: await database.matrixEventIndex
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      verified: await database.verifiedCheckpoints
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      publications: await database.checkpointPublications
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      quarantine: await database.quarantine
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      fragments: await database.payloadFragments
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      events: await database.domainEvents
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      handled: await database.handledDomainEvents
        .where("eventId")
        .equals("domain_ws_other_2")
        .toArray(),
      targets: await database.syncTargets
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      acls: await database.aclCheckpoints
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      certificates: await database.migrationCertificates
        .where("workspaceId")
        .equals("ws_other")
        .toArray(),
      profiles: await database.serverProfiles.toArray(),
      secrets: await database.localSecrets.toArray(),
    };

    const store = new DexieOfflineWorkspaceStore(database);
    await expect(store.listCandidates()).resolves.toEqual([
      {
        workspaceId: "ws_source",
        createdAt: 901,
        createdAtSource: "metadata",
        taskCount: 0,
      },
    ]);

    await expect(store.deleteCandidate("ws_source")).resolves.toEqual({
      workspaceId: "ws_source",
      artifacts: {
        workspaceSnapshots: 1,
        workspaceMetadata: 1,
        workspaceChanges: 1,
        taskProjections: 1,
        dailySelectionProjections: 1,
        conflictProjections: 1,
        auditProjections: 1,
        dailyStatisticsProjections: 1,
        syncOutbox: 1,
        syncInbox: 1,
        matrixEventIndex: 1,
        verifiedCheckpoints: 1,
        checkpointPublications: 1,
        quarantine: 1,
        payloadFragments: 1,
        domainEvents: 1,
        handledDomainEvents: 1,
      },
    });

    await expect(
      Promise.all([
        database.workspaceSnapshots.get("ws_source"),
        database.workspaceMetadata.get("ws_source"),
        database.workspaceChanges
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.taskProjections
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.dailySelectionProjections
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.conflictProjections
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.auditProjections
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.dailyStatisticsProjections
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.syncOutbox.where("workspaceId").equals("ws_source").count(),
        database.syncInbox.where("workspaceId").equals("ws_source").count(),
        database.matrixEventIndex
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.verifiedCheckpoints
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.checkpointPublications
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.quarantine.where("workspaceId").equals("ws_source").count(),
        database.payloadFragments
          .where("workspaceId")
          .equals("ws_source")
          .count(),
        database.domainEvents.where("workspaceId").equals("ws_source").count(),
        database.handledDomainEvents
          .where("eventId")
          .equals("domain_ws_source_1")
          .count(),
      ])
    ).resolves.toEqual([undefined, undefined, ...Array(15).fill(0)]);

    await expect(
      Promise.resolve({
        snapshot: await database.workspaceSnapshots.get("ws_other"),
        metadata: await database.workspaceMetadata.get("ws_other"),
        changes: await database.workspaceChanges
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        tasks: await database.taskProjections
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        selections: await database.dailySelectionProjections
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        conflicts: await database.conflictProjections
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        audits: await database.auditProjections
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        statistics: await database.dailyStatisticsProjections
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        outbox: await database.syncOutbox
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        inbox: await database.syncInbox
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        eventIndex: await database.matrixEventIndex
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        verified: await database.verifiedCheckpoints
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        publications: await database.checkpointPublications
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        quarantine: await database.quarantine
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        fragments: await database.payloadFragments
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        events: await database.domainEvents
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        handled: await database.handledDomainEvents
          .where("eventId")
          .equals("domain_ws_other_2")
          .toArray(),
        targets: await database.syncTargets
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        acls: await database.aclCheckpoints
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        certificates: await database.migrationCertificates
          .where("workspaceId")
          .equals("ws_other")
          .toArray(),
        profiles: await database.serverProfiles.toArray(),
        secrets: await database.localSecrets.toArray(),
      })
    ).resolves.toEqual(otherBefore);
  });
});
