import Dexie from "dexie";

import { LiftSecureDatabase } from "../LiftSecureDatabase";
import type {
  AclCheckpointRecord,
  LocalSecretRecord,
  MatrixEventIndexRecord,
  PayloadFragmentRecord,
  QuarantineRecord,
  ServerProfileRecord,
  SyncInboxRecord,
  SyncOutboxRecord,
  SyncTargetRecord,
  TaskProjectionRecord,
  WorkspaceChangeRecord,
  WorkspaceSnapshotRecord,
} from "../records";

const TABLE_SCHEMAS = {
  aclCheckpoints: "&[workspaceId+authEpoch], &hash, previousHash",
  auditProjections:
    "&[workspaceId+source+recordId], [workspaceId+auditTime], [workspaceId+taskId], [workspaceId+kind]",
  conflictProjections: "&id, [workspaceId+taskId], path",
  dailySelectionProjections: "&[workspaceId+date+taskId], [workspaceId+date]",
  dailyStatisticsProjections: "&[workspaceId+date], workspaceId",
  domainEvents:
    "&id, [workspaceId+status], [status+nextAttemptAt], [aggregateId+aggregateSequence]",
  handledDomainEvents: "&[eventId+handlerId], eventId, handlerId",
  localSecrets: "&id, serverProfileId",
  matrixEventIndex: "&eventId, [workspaceId+changeHash], roomId",
  payloadFragments:
    "&[direction+transferId+index], [direction+transferId], workspaceId, changeHash",
  quarantine: "&id, eventId, workspaceId, reason, createdAt",
  serverProfiles: "&id, baseUrl",
  syncInbox: "&eventId, [workspaceId+state], [state+receivedAt], roomId",
  syncOutbox:
    "&id, [workspaceId+state], [state+nextAttemptAt], targetId, changeHash",
  syncTargets: "&id, workspaceId, serverProfileId, mode",
  taskProjections:
    "&[workspaceId+taskId], [workspaceId+category], [workspaceId+completion], [workspaceId+positionKey]",
  workspaceChanges:
    "&[workspaceId+changeHash], workspaceId, changeHash, origin",
  workspaceSnapshots: "&workspaceId",
} as const;

type ForbiddenTransportField = Extract<
  | keyof SyncOutboxRecord
  | keyof SyncInboxRecord
  | keyof MatrixEventIndexRecord
  | keyof SyncTargetRecord
  | keyof AclCheckpointRecord
  | keyof QuarantineRecord
  | keyof PayloadFragmentRecord
  | keyof ServerProfileRecord,
  "title" | "note" | "tag" | "tags" | "domainPlaintext"
>;

const openDatabases = new Set<LiftSecureDatabase>();
const ownedDatabaseNames = new Set<string>();

const uniqueDatabaseName = (): string => {
  const name = `LiftSecureDatabase-test-${crypto.randomUUID()}`;
  ownedDatabaseNames.add(name);
  return name;
};

const createDatabase = (name = uniqueDatabaseName()): LiftSecureDatabase => {
  const db = new LiftSecureDatabase(name);
  openDatabases.add(db);
  return db;
};

const cleanupOwnedDatabases = async (): Promise<void> => {
  for (const db of openDatabases) {
    db.close();
  }
  openDatabases.clear();

  const names = [...ownedDatabaseNames];
  const results = await Promise.allSettled(
    names.map(async (name) => {
      await Dexie.delete(name);
      ownedDatabaseNames.delete(name);
    })
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to clean Task 6 test databases");
  }
};

const schemaSources = (db: LiftSecureDatabase): Record<string, string> =>
  Object.fromEntries(
    db.tables.map((table) => {
      const primaryKeySource = `${table.schema.primKey.unique ? "&" : ""}${
        table.schema.primKey.src
      }`;
      return [
        table.name,
        [primaryKeySource, ...table.schema.indexes.map(({ src }) => src)]
          .filter((source) => source.length > 0)
          .join(", "),
      ];
    })
  );

describe("LiftSecureDatabase", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupOwnedDatabases();
  });
  afterAll(cleanupOwnedDatabases);

  it("declares exactly the clean-slate version-one table and index schema", async () => {
    const db = createDatabase();

    await db.open();

    expect(db.name.startsWith("LiftSecureDatabase")).toBe(true);
    expect(db.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(TABLE_SCHEMAS).sort()
    );
    expect(schemaSources(db)).toEqual(TABLE_SCHEMAS);
    expect(db.verno).toBe(1);
    expect(
      (
        db as unknown as {
          _versions: Array<{ _cfg: { version: number } }>;
        }
      )._versions.map(({ _cfg }) => _cfg.version)
    ).toEqual([1]);
  });

  it("rejects names outside the LiftSecureDatabase namespace before opening", () => {
    expect(new LiftSecureDatabase().name).toBe("LiftSecureDatabase");
    expect(() => new LiftSecureDatabase("")).toThrow(/LiftSecureDatabase/);
    expect(() => new LiftSecureDatabase("   ")).toThrow(/LiftSecureDatabase/);
    expect(() => new LiftSecureDatabase("TodoDatabase")).toThrow(
      /TodoDatabase/
    );
    expect(() => new LiftSecureDatabase("unrelated-database")).toThrow(
      /LiftSecureDatabase/
    );
  });

  it("does not create, delete, or open TodoDatabase", async () => {
    const legacyBefore = (await indexedDB.databases()).filter(
      ({ name }) => name === "TodoDatabase"
    );
    const openSpy = vi.spyOn(indexedDB, "open");
    const deleteSpy = vi.spyOn(indexedDB, "deleteDatabase");
    const db = createDatabase();

    await db.open();
    db.close();

    expect(openSpy.mock.calls.some(([name]) => name === "TodoDatabase")).toBe(
      false
    );
    expect(deleteSpy.mock.calls.some(([name]) => name === "TodoDatabase")).toBe(
      false
    );
    expect(
      (await indexedDB.databases()).filter(
        ({ name }) => name === "TodoDatabase"
      )
    ).toEqual(legacyBefore);
  });

  it("persists cloned binary records across close and reopen without aliasing", async () => {
    const name = uniqueDatabaseName();
    let db = createDatabase(name);
    const snapshotBytes = new Uint8Array([1, 2, 3]);
    const changeBytes = new Uint8Array([4, 5, 6]);
    const fragmentBytes = new Uint8Array([7, 8, 9]);
    const snapshot: WorkspaceSnapshotRecord = {
      workspaceId: "workspace-1",
      schemaVersion: 1,
      bytes: snapshotBytes,
      heads: ["head-1"],
      savedAt: 1,
    };
    const change: WorkspaceChangeRecord = {
      workspaceId: "workspace-1",
      changeHash: "change-1",
      bytes: changeBytes,
      dependencies: [],
      origin: "local",
      createdAt: 2,
    };
    const fragment: PayloadFragmentRecord = {
      direction: "outbound",
      transferId: "transfer-1",
      index: 0,
      count: 1,
      workspaceId: "workspace-1",
      changeHash: "change-1",
      fragmentHash: "fragment-1",
      bytes: fragmentBytes,
      matrixEventId: null,
    };

    await db.open();
    await db.transaction(
      "rw",
      [db.workspaceSnapshots, db.workspaceChanges, db.payloadFragments],
      async () => {
        await db.workspaceSnapshots.add(snapshot);
        await db.workspaceChanges.add(change);
        await db.payloadFragments.add(fragment);
      }
    );

    snapshotBytes[0] = 99;
    changeBytes[0] = 99;
    fragmentBytes[0] = 99;
    db.close();

    db = createDatabase(name);
    await db.open();
    const storedSnapshot = await db.workspaceSnapshots.get("workspace-1");
    const storedChange = await db.workspaceChanges.get([
      "workspace-1",
      "change-1",
    ]);
    const storedFragment = await db.payloadFragments.get([
      "outbound",
      "transfer-1",
      0,
    ]);

    expect(Array.from(storedSnapshot?.bytes ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(storedChange?.bytes ?? [])).toEqual([4, 5, 6]);
    expect(Array.from(storedFragment?.bytes ?? [])).toEqual([7, 8, 9]);

    storedSnapshot?.bytes.fill(42);
    expect(
      Array.from((await db.workspaceSnapshots.get("workspace-1"))?.bytes ?? [])
    ).toEqual([1, 2, 3]);
  });

  it("persists a non-extractable wrapping CryptoKey and encrypted secret bytes", async () => {
    const db = createDatabase();
    const wrappingKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
    );
    const keyRecord: LocalSecretRecord = {
      id: "wrapping-key-1",
      serverProfileId: "server-1",
      schemaVersion: 1,
      kind: "wrapping-key",
      key: wrappingKey,
      createdAt: 1,
      updatedAt: 1,
    };
    const encryptedRecord: LocalSecretRecord = {
      id: "access-token-1",
      serverProfileId: "server-1",
      schemaVersion: 1,
      kind: "aes-gcm-ciphertext",
      wrappingKeyId: "wrapping-key-1",
      ciphertext: new Uint8Array([10, 20, 30]),
      iv: new Uint8Array([40, 50, 60]),
      createdAt: 2,
      updatedAt: 2,
    };

    await db.open();
    await db.localSecrets.bulkAdd([keyRecord, encryptedRecord]);
    db.close();

    const reopened = createDatabase(db.name);
    await reopened.open();
    const storedKey = await reopened.localSecrets.get("wrapping-key-1");
    const storedCiphertext = await reopened.localSecrets.get("access-token-1");

    expect(storedKey?.kind).toBe("wrapping-key");
    if (storedKey?.kind === "wrapping-key") {
      expect(storedKey.key.extractable).toBe(false);
      expect(storedKey.key.type).toBe("secret");
      expect(storedKey.key.algorithm.name).toBe("AES-GCM");
      expect(storedKey.key.usages).toEqual(["wrapKey", "unwrapKey"]);
    }
    expect(storedCiphertext?.kind).toBe("aes-gcm-ciphertext");
    if (storedCiphertext?.kind === "aes-gcm-ciphertext") {
      expect(Array.from(storedCiphertext.ciphertext)).toEqual([10, 20, 30]);
      expect(Array.from(storedCiphertext.iv)).toEqual([40, 50, 60]);
    }
  });

  it("enforces compound primary keys and unique indexes", async () => {
    const db = createDatabase();
    const checkpoint = (workspaceId: string): AclCheckpointRecord => ({
      workspaceId,
      authEpoch: 1,
      hash: "acl-hash-1",
      previousHash: null,
      bytes: new Uint8Array([1]),
      createdAt: 1,
    });

    await db.open();
    await db.aclCheckpoints.add(checkpoint("workspace-1"));

    const storedCheckpoint = await db.aclCheckpoints.get(["workspace-1", 1]);
    expect(storedCheckpoint).toMatchObject({
      workspaceId: "workspace-1",
      authEpoch: 1,
      hash: "acl-hash-1",
      previousHash: null,
      createdAt: 1,
    });
    expect(Array.from(storedCheckpoint?.bytes ?? [])).toEqual([1]);
    await expect(
      db.aclCheckpoints.add(checkpoint("workspace-2"))
    ).rejects.toMatchObject({ name: "ConstraintError" });

    await db.taskProjections.add({
      workspaceId: "workspace-1",
      taskId: "task-1",
      title: "Local projection title",
      note: "Local projection note",
      tags: ["local-tag"],
      category: "FOCUS",
      completion: "active",
      positionKey: "a0",
      deferredUntil: null,
      inboxEnteredOn: null,
      deleted: false,
      updatedAt: 1,
    });
    await expect(
      db.taskProjections.add({
        workspaceId: "workspace-1",
        taskId: "task-1",
        title: "Duplicate",
        note: "",
        tags: [],
        category: "INBOX",
        completion: "completed",
        positionKey: "a1",
        deferredUntil: null,
        inboxEnteredOn: "2026-07-22",
        deleted: false,
        updatedAt: 2,
      })
    ).rejects.toMatchObject({ name: "ConstraintError" });

    await db.dailySelectionProjections.add({
      workspaceId: "workspace-1",
      date: "2026-07-22",
      taskId: "task-1",
      selected: true,
      updatedAt: 1,
    });
    expect(
      await db.dailySelectionProjections.get([
        "workspace-1",
        "2026-07-22",
        "task-1",
      ])
    ).toMatchObject({ selected: true });
  });

  it("supports locked deferred, pre-login profile, and sync-target contracts", async () => {
    const db = createDatabase();
    const preLoginProfile: ServerProfileRecord = {
      id: "server-1",
      name: "Personal Matrix",
      baseUrl: "https://matrix.example.test",
    };
    const candidateTarget: SyncTargetRecord = {
      id: "target-1",
      workspaceId: "workspace-1",
      serverProfileId: "server-1",
      roomId: "!room:example.test",
      mode: "candidate",
      state: "paused",
      createdAt: 1,
      updatedAt: 1,
    };
    const deferredProjection: TaskProjectionRecord = {
      workspaceId: "workspace-1",
      taskId: "task-1",
      title: "Local deferred task",
      note: "",
      tags: [],
      category: "DEFERRED",
      completion: "active",
      positionKey: "a0",
      deferredUntil: "2026-07-23",
      inboxEnteredOn: null,
      deleted: false,
      updatedAt: 1,
    };

    expectTypeOf<SyncTargetRecord["mode"]>().toEqualTypeOf<
      "candidate" | "active" | "read-only"
    >();
    expectTypeOf<TaskProjectionRecord["category"]>().toEqualTypeOf<
      "INBOX" | "SIMPLE" | "FOCUS" | "DEFERRED"
    >();

    await db.open();
    await db.transaction(
      "rw",
      [db.serverProfiles, db.syncTargets, db.taskProjections],
      async () => {
        await db.serverProfiles.add(preLoginProfile);
        await db.syncTargets.add(candidateTarget);
        await db.taskProjections.add(deferredProjection);
      }
    );

    expect(await db.serverProfiles.get("server-1")).toEqual(preLoginProfile);
    expect((await db.syncTargets.get("target-1"))?.mode).toBe("candidate");
    expect(
      (await db.taskProjections.get(["workspace-1", "task-1"]))?.category
    ).toBe("DEFERRED");
  });

  it("isolates independent database names", async () => {
    const first = createDatabase();
    const second = createDatabase();
    const snapshot: WorkspaceSnapshotRecord = {
      workspaceId: "workspace-1",
      schemaVersion: 1,
      bytes: new Uint8Array([1]),
      heads: [],
      savedAt: 1,
    };

    await Promise.all([first.open(), second.open()]);
    await first.workspaceSnapshots.add(snapshot);

    const storedSnapshot = await first.workspaceSnapshots.get("workspace-1");
    expect(storedSnapshot).toMatchObject({
      workspaceId: "workspace-1",
      schemaVersion: 1,
      heads: [],
      savedAt: 1,
    });
    expect(Array.from(storedSnapshot?.bytes ?? [])).toEqual([1]);
    expect(await second.workspaceSnapshots.get("workspace-1")).toBeUndefined();
  });

  it("rolls back all writes when a multi-table transaction fails", async () => {
    const db = createDatabase();
    const failure = new Error("force rollback");

    await db.open();
    await expect(
      db.transaction(
        "rw",
        [db.workspaceSnapshots, db.workspaceChanges],
        async () => {
          await db.workspaceSnapshots.add({
            workspaceId: "workspace-1",
            schemaVersion: 1,
            bytes: new Uint8Array([1]),
            heads: [],
            savedAt: 1,
          });
          await db.workspaceChanges.add({
            workspaceId: "workspace-1",
            changeHash: "change-1",
            bytes: new Uint8Array([2]),
            dependencies: [],
            origin: "local",
            createdAt: 1,
          });
          throw failure;
        }
      )
    ).rejects.toBe(failure);

    expect(await db.workspaceSnapshots.count()).toBe(0);
    expect(await db.workspaceChanges.count()).toBe(0);
  });

  it("keeps transport record contracts free of domain plaintext fields", () => {
    expectTypeOf<ForbiddenTransportField>().toEqualTypeOf<never>();
  });
});
