# Offline Workspace Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely reconcile truly unbound offline-only workspaces after Matrix login through explicit Import, Delete, or Later actions without exposing or synchronizing another account's data.

**Architecture:** Add one semantic `ImportOfflineWorkspace` command to the existing Automerge mutation boundary, orchestrated by application use cases over a narrow offline-workspace store port. A Dexie adapter classifies and deletes exact unbound workspaces, while the existing authorized unit of work atomically persists the target CRDT change, projections, audit record, and outbox. A shared Zustand ViewModel drives a modal and Settings reminder; dismissal remains memory-only presentation state.

**Tech Stack:** TypeScript, React, Zustand, Automerge, Dexie/IndexedDB, Matrix JS SDK, Vitest, Testing Library, Playwright, Docker Compose Synapse/PostgreSQL.

## Global Constraints

- Keep Clean Architecture dependency direction: Domain → Application → Infrastructure → Presentation.
- Keep feature-first organization under `features/workspaces`; React must not query or mutate Dexie.
- Local IndexedDB remains the primary UX source; Matrix sees only E2EE events.
- A Matrix-bound workspace is never an offline candidate, even if its target is paused, retired, preparing, or read-only.
- Import never matches or overwrites tasks by title.
- Import includes active, deferred, and completed tasks; title, note, canonical category, tags, defer state; and dated Today selections.
- Import excludes deleted tasks, source audit records, completion records, domain-delivery history, conflicts, and statistics.
- Imported task IDs are the lowercase hexadecimal SHA-256 digest of `lift-offline-import-v1 + NUL + sourceWorkspaceId + NUL + sourceTaskId + NUL + targetWorkspaceId`.
- Target import is one semantic Automerge change and one Dexie transaction including snapshot, projections, import audit, and Matrix outbox.
- Source deletion runs only after the target transaction commits; a retry after a crash must not duplicate tasks.
- Delete removes only the exact selected offline workspace and its workspace-scoped artifacts; it never removes Matrix crypto stores, server profiles, or unrelated workspaces.
- `Позже` imports nothing, deletes nothing, binds nothing, emits no Matrix event, has no timeout, and is reset only by a new application session.
- All operations fail closed if source binding, active account, target workspace, ACL, role, or device authorization changes.
- Preserve all existing application behavior and visual language.

---

### Task 1: Deterministic Batch Import Domain Boundary

**Files:**

- Create: `src/features/workspaces/application/ports/OfflineImportIdFactory.ts`
- Modify: `src/features/workspaces/application/commands/WorkspaceCommand.ts`
- Modify: `src/features/workspaces/domain/WorkspaceState.ts`
- Modify: `src/features/workspaces/infrastructure/crdt/AutomergeCommandHandler.ts`
- Create: `src/features/workspaces/infrastructure/crypto/Sha256OfflineImportIdFactory.ts`
- Create: `src/features/workspaces/infrastructure/crypto/__tests__/Sha256OfflineImportIdFactory.test.ts`
- Modify: `src/features/workspaces/infrastructure/crdt/__tests__/AutomergeCommandHandler.test.ts`

**Interfaces:**

- Produces:

```ts
export interface OfflineImportIdFactory {
  taskId(
    sourceWorkspaceId: string,
    sourceTaskId: string,
    targetWorkspaceId: string
  ): Promise<string>;
  operationId(
    sourceWorkspaceId: string,
    targetWorkspaceId: string
  ): Promise<string>;
}

export interface ImportedTaskState {
  readonly sourceTaskId: string;
  readonly targetTaskId: string;
  readonly title: string;
  readonly note: string;
  readonly category: WorkspaceTaskCategory;
  readonly deferredUntil: string | null;
  readonly originalCategory: WorkspaceTaskCategory | null;
  readonly completion: "active" | "completed";
  readonly inboxEnteredOn: string | null;
  readonly tags: readonly string[];
  readonly selectedDates: readonly string[];
}

export interface ImportOfflineWorkspaceCommand extends WorkspaceCommandBase {
  readonly type: "ImportOfflineWorkspace";
  readonly sourceWorkspaceId: string;
  readonly deviceId: string;
  readonly auditTime: string;
  readonly tasks: readonly ImportedTaskState[];
}
```

- Extends `TaskCrdtState` with optional durable provenance:

```ts
readonly importedFrom?: {
  version: "lift-offline-import-v1";
  sourceWorkspaceId: string;
  sourceTaskId: string;
  targetWorkspaceId: string;
};
```

- `AutomergeCommandHandler.handle()` returns either one change for the whole import or zero changes for an exact retry.

- [ ] **Step 1: Write failing deterministic-ID tests**

In `Sha256OfflineImportIdFactory.test.ts`, assert literal digests computed independently from the required byte strings:

```ts
it("derives stable target-specific task IDs from the specified v1 preimage", async () => {
  const factory = new Sha256OfflineImportIdFactory();

  await expect(
    factory.taskId("ws_source", "task_1", "ws_target")
  ).resolves.toBe(
    "8ae84f6c20027b93e1252b1bcc53d0f1722e6f3ed096c1de74dcf54978347fa9"
  );
  await expect(
    factory.taskId("ws_source", "task_1", "ws_other")
  ).resolves.not.toBe(
    "8ae84f6c20027b93e1252b1bcc53d0f1722e6f3ed096c1de74dcf54978347fa9"
  );
});
```

Generate the literal once with a standalone Node `crypto.createHash("sha256")` command and paste it into the test; do not call production code to calculate the expected value.

- [ ] **Step 2: Run the ID test and verify RED**

Run:

```bash
npx vitest --run src/features/workspaces/infrastructure/crypto/__tests__/Sha256OfflineImportIdFactory.test.ts
```

Expected: FAIL because `Sha256OfflineImportIdFactory` does not exist.

- [ ] **Step 3: Implement the ID factory**

Use `crypto.subtle.digest` over `TextEncoder` bytes. `taskId()` must hash exactly:

```ts
`lift-offline-import-v1\0${sourceWorkspaceId}\0${sourceTaskId}\0${targetWorkspaceId}`;
```

`operationId()` must return `offline-import-v1:` followed by the digest of:

```ts
`lift-offline-import-operation-v1\0${sourceWorkspaceId}\0${targetWorkspaceId}`;
```

Reject empty identifiers before hashing.

- [ ] **Step 4: Run the ID test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing semantic-command tests**

Add focused tests to `AutomergeCommandHandler.test.ts`:

```ts
const importCommand: Extract<
  WorkspaceCommand,
  { type: "ImportOfflineWorkspace" }
> = {
  type: "ImportOfflineWorkspace",
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_A,
  operationId: "offline-import-v1:fixture",
  sourceWorkspaceId: "ws_source",
  deviceId: "DEVICE",
  auditTime: AUDIT_TIME,
  tasks: [
    {
      sourceTaskId: "source-active",
      targetTaskId: "target-active",
      title: "Active",
      note: "note",
      category: "INBOX",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      inboxEnteredOn: "2026-07-20",
      tags: ["local", "urgent"],
      selectedDates: ["2026-07-21", "2026-07-22"],
    },
    {
      sourceTaskId: "source-deferred",
      targetTaskId: "target-deferred",
      title: "Deferred",
      note: "",
      category: "FOCUS",
      deferredUntil: "2026-08-01",
      originalCategory: "FOCUS",
      completion: "active",
      inboxEnteredOn: null,
      tags: [],
      selectedDates: [],
    },
    {
      sourceTaskId: "source-completed",
      targetTaskId: "target-completed",
      title: "Completed",
      note: "",
      category: "SIMPLE",
      deferredUntil: null,
      originalCategory: null,
      completion: "completed",
      inboxEnteredOn: null,
      tags: ["done"],
      selectedDates: ["2026-07-19"],
    },
  ],
};

it("imports all supported task state and dated selections in one change", async () => {
  const document = documentWith((state) => {
    state.tasks.existing = task("existing", { key: "a0", actorId: ACTOR_A });
  });

  const changes = await handler().handle(document, importCommand);
  const state = document.value();

  expect(changes).toHaveLength(1);
  expect(Object.keys(state.tasks).sort()).toEqual([
    "existing",
    "target-active",
    "target-completed",
    "target-deferred",
  ]);
  expect(state.tasks["target-active"]).toMatchObject({
    title: "Active",
    note: "note",
    completion: "active",
    importedFrom: {
      version: "lift-offline-import-v1",
      sourceWorkspaceId: "ws_source",
      sourceTaskId: "source-active",
      targetWorkspaceId: WORKSPACE_ID,
    },
  });
  expect(state.tasks["target-deferred"]).toMatchObject({
    category: "FOCUS",
    deferredUntil: "2026-08-01",
    originalCategory: "FOCUS",
  });
  expect(state.tasks["target-completed"]).toMatchObject({
    completion: "completed",
    completionEpoch: 1,
  });
  expect(has(state.tasks["target-active"].tags, "urgent")).toBe(true);
  expect(has(state.dailySelections["2026-07-22"], "target-active")).toBe(true);
  expect(state.auditRecords[importCommand.operationId]).toMatchObject({
    kind: "offline.workspace-imported.v1",
    taskId: null,
    data: { sourceWorkspaceId: "ws_source", importedTaskCount: "3" },
  });
  expect(state.completionRecords).toEqual({});
});

it("treats the exact imported provenance as an idempotent retry", async () => {
  const document = documentWith(() => undefined);
  await handler().handle(document, importCommand);
  const heads = document.heads();

  await expect(handler().handle(document, importCommand)).resolves.toEqual([]);
  expect(document.heads()).toEqual(heads);
});

it("fails closed when a deterministic target ID has incompatible provenance", async () => {
  const document = documentWith((state) => {
    state.tasks["target-active"] = task("target-active", {
      key: "a0",
      actorId: ACTOR_A,
    });
  });
  const heads = document.heads();

  await expect(handler().handle(document, importCommand)).rejects.toThrow(
    "Imported task ID collides with incompatible target data"
  );
  expect(document.heads()).toEqual(heads);
});
```

The first test must assert audit data exactly:

```ts
{
  sourceWorkspaceId: "ws_source",
  importedTaskCount: "3"
}
```

- [ ] **Step 6: Run command tests and verify RED**

Run:

```bash
npx vitest --run src/features/workspaces/infrastructure/crdt/__tests__/AutomergeCommandHandler.test.ts
```

Expected: FAIL because `ImportOfflineWorkspace` is not in `WorkspaceCommand`.

- [ ] **Step 7: Implement the batch command**

Add `ImportOfflineWorkspaceCommand` to the exhaustive union and implement one `document.change(command.type, ...)` branch that:

1. validates non-empty source ID, device ID, audit time, unique source/target task IDs, valid dates/categories, sorted unique tags, and source ≠ target;
2. derives import audit identity from `command.operationId`;
3. returns `[]` only when the audit record and every imported task's provenance and supported content exactly match;
4. rejects any pre-existing target task without exact matching provenance;
5. orders imported tasks after current live target tasks with `generateNKeysBetween(lastKey, null, tasks.length)`;
6. creates deterministic tag and day-selection dots from `command.operationId`, target task ID, tag/date;
7. stores `importedFrom`, copied supported fields, and no source completion/audit history;
8. adds one `offline.workspace-imported.v1` audit record with source ID and count.

Completed tasks use `completion: "completed"` and `completionEpoch: 1`; active tasks use epoch `0`. Imported tasks do not create completion records.

- [ ] **Step 8: Run command tests and full focused CRDT tests**

Run:

```bash
npx vitest --run src/features/workspaces/infrastructure/crdt/__tests__/AutomergeCommandHandler.test.ts src/features/workspaces/infrastructure/crdt/__tests__/AutomergeWorkspaceDocument.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/features/workspaces/application/ports/OfflineImportIdFactory.ts src/features/workspaces/application/commands/WorkspaceCommand.ts src/features/workspaces/domain/WorkspaceState.ts src/features/workspaces/infrastructure/crdt/AutomergeCommandHandler.ts src/features/workspaces/infrastructure/crypto/Sha256OfflineImportIdFactory.ts src/features/workspaces/infrastructure/crypto/__tests__/Sha256OfflineImportIdFactory.test.ts src/features/workspaces/infrastructure/crdt/__tests__/AutomergeCommandHandler.test.ts
git commit -m "feat(workspaces): add deterministic offline import command"
```

---

### Task 2: Exact Offline Candidate and Deletion Store

**Files:**

- Create: `src/features/workspaces/application/ports/OfflineWorkspaceStore.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieOfflineWorkspaceStore.ts`
- Create: `src/features/workspaces/infrastructure/database/__tests__/DexieOfflineWorkspaceStore.integration.test.ts`
- Modify: `src/features/workspaces/infrastructure/database/records.ts`
- Modify: `src/features/workspaces/infrastructure/database/LiftSecureDatabase.ts`
- Modify: `src/features/workspaces/infrastructure/matrix/MatrixWorkspaceIdentityResolver.ts`
- Modify: `src/features/workspaces/infrastructure/matrix/__tests__/MatrixWorkspaceIdentityResolver.integration.test.ts`
- Modify: `src/features/workspaces/infrastructure/composition/createSecureRuntime.ts`

**Interfaces:**

- Produces:

```ts
export interface OfflineWorkspaceCandidate {
  readonly workspaceId: string;
  readonly createdAt: number;
  readonly createdAtSource: "metadata" | "estimated";
  readonly taskCount: number;
}

export interface OfflineWorkspaceTask {
  readonly sourceTaskId: string;
  readonly title: string;
  readonly note: string;
  readonly category: "INBOX" | "SIMPLE" | "FOCUS";
  readonly deferredUntil: string | null;
  readonly originalCategory: "INBOX" | "SIMPLE" | "FOCUS" | null;
  readonly completion: "active" | "completed";
  readonly inboxEnteredOn: string | null;
  readonly tags: readonly string[];
  readonly selectedDates: readonly string[];
}

export interface OfflineWorkspaceContent {
  readonly workspaceId: string;
  readonly tasks: readonly OfflineWorkspaceTask[];
}

export interface OfflineWorkspaceDeletion {
  readonly workspaceId: string;
  readonly artifacts: Readonly<Record<string, number>>;
}

export interface OfflineWorkspaceStore {
  listCandidates(): Promise<readonly OfflineWorkspaceCandidate[]>;
  readCandidate(workspaceId: string): Promise<OfflineWorkspaceContent>;
  deleteCandidate(workspaceId: string): Promise<OfflineWorkspaceDeletion>;
}
```

- Consumes `DexieWorkspaceRepository.loadDocument()` and the exact tables declared by `LiftSecureDatabase`.
- Adds `workspaceMetadata: "&workspaceId, createdAt"` with:

```ts
export interface WorkspaceMetadataRecord {
  readonly workspaceId: string;
  readonly createdAt: number;
}
```

Declare it in `this.version(2).stores({ workspaceMetadata:
"&workspaceId, createdAt" })` without an upgrade callback. This is schema
availability, not a data migration; pre-existing workspaces use the explicit
estimated-date fallback below.

- [ ] **Step 1: Write failing candidate-classification integration tests**

Seed five snapshots:

1. no target and no ACL → candidate;
2. active target → excluded;
3. paused/read-only target → excluded;
4. no target but accepted ACL checkpoint → excluded;
5. migration certificate referencing the workspace → excluded as bound evidence.

Assert only fixture 1 is returned, with `taskCount` excluding tasks whose `deletionDots` are non-empty.

- [ ] **Step 2: Run candidate tests and verify RED**

Run:

```bash
npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/database/__tests__/DexieOfflineWorkspaceStore.integration.test.ts
```

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement candidate preflight and source projection**

`listCandidates()` must classify from authoritative tables, not `CurrentWorkspace`:

```ts
bound =
  any syncTargets row ||
  any aclCheckpoints row ||
  any migrationCertificates row
```

When offline creation writes the initial snapshot, it must write immutable
`workspaceMetadata.createdAt` in the same transaction. Existing local
workspaces deliberately receive no data migration: their display timestamp is
estimated as the minimum of current snapshot `savedAt` and retained
`workspaceChanges.createdAt`, and the DTO reports `createdAtSource:
"estimated"`.

`readCandidate()` repeats that preflight, loads authoritative Automerge state, filters `isDeleted(task.deletionDots)`, reads active tags with `ObservedRemoveSet.has`, and scans all `dailySelections` for active membership. Sort tasks by canonical position and dates/tags lexicographically.

Update `MatrixWorkspaceIdentityResolver.listOfflineWorkspaceIds()` to use the same binding rule or delegate to the store's candidate IDs, so startup cannot select an ACL-bound orphan as offline.

- [ ] **Step 4: Run classification tests and verify GREEN**

Run the Task 2 test command plus:

```bash
npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/matrix/__tests__/MatrixWorkspaceIdentityResolver.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing exact-deletion integration tests**

Populate every workspace-scoped table for `ws_source` and `ws_other`. Link `handledDomainEvents` to source and other domain event IDs. Assert:

- a newly inserted target or ACL between list and delete rejects deletion;
- successful delete removes source rows from all scoped tables;
- every `ws_other` row remains byte-for-byte present;
- `serverProfiles` and `localSecrets` remain present;
- returned artifact counts match actual deleted rows.

- [ ] **Step 6: Run deletion tests and verify RED**

Run the Task 2 integration test. Expected: FAIL because `deleteCandidate()` is not implemented.

- [ ] **Step 7: Implement one-transaction exact deletion**

Within one Dexie `"rw"` transaction, repeat the unbound preflight and delete source rows from:

```ts
workspaceSnapshots;
workspaceMetadata;
workspaceChanges;
taskProjections;
dailySelectionProjections;
conflictProjections;
auditProjections;
dailyStatisticsProjections;
syncOutbox;
syncInbox;
matrixEventIndex;
verifiedCheckpoints;
checkpointPublications;
quarantine;
payloadFragments;
domainEvents;
handledDomainEvents; // only IDs collected from deleted source domainEvents
```

`syncTargets`, `aclCheckpoints`, and `migrationCertificates` are guard tables: any matching row aborts instead of being deleted. Never include `serverProfiles` or `localSecrets` in the transaction.

- [ ] **Step 8: Run all Task 2 tests and verify GREEN**

Run both commands from Steps 4 and 6. Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/features/workspaces/application/ports/OfflineWorkspaceStore.ts src/features/workspaces/infrastructure/database/DexieOfflineWorkspaceStore.ts src/features/workspaces/infrastructure/database/__tests__/DexieOfflineWorkspaceStore.integration.test.ts src/features/workspaces/infrastructure/database/records.ts src/features/workspaces/infrastructure/database/LiftSecureDatabase.ts src/features/workspaces/infrastructure/matrix/MatrixWorkspaceIdentityResolver.ts src/features/workspaces/infrastructure/matrix/__tests__/MatrixWorkspaceIdentityResolver.integration.test.ts src/features/workspaces/infrastructure/composition/createSecureRuntime.ts
git commit -m "feat(workspaces): classify and delete exact offline workspaces"
```

---

### Task 3: Authorized Import and Cleanup Use Cases

**Files:**

- Create: `src/features/workspaces/application/use-cases/ListOfflineWorkspaceCandidatesUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/ImportOfflineWorkspaceUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/DeleteOfflineWorkspaceUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/__tests__/OfflineWorkspaceReconciliationUseCases.test.ts`
- Modify: `src/features/workspaces/application/ports/WorkspaceUnitOfWork.ts`
- Modify: `src/features/workspaces/application/services/AuthorizedWorkspaceUnitOfWork.ts`
- Modify: `src/features/workspaces/infrastructure/database/DexieWorkspaceUnitOfWork.ts`
- Modify: `src/features/workspaces/infrastructure/database/__tests__/DexieWorkspaceUnitOfWork.integration.test.ts`

**Interfaces:**

- Consumes:
  - `CurrentWorkspace`;
  - `CurrentActor`;
  - `WorkspaceUnitOfWork`;
  - `WorkspaceWriteAuthorization`;
  - `MatrixSession`;
  - `OfflineImportIdFactory`;
  - `OfflineWorkspaceStore`.
- Produces:

```ts
export interface ImportOfflineWorkspaceResult {
  readonly sourceWorkspaceId: string;
  readonly targetWorkspaceId: string;
  readonly importedTaskCount: number;
  readonly cleanup: "completed" | "pending";
}

export class ListOfflineWorkspaceCandidatesUseCase {
  execute(): Promise<readonly OfflineWorkspaceCandidate[]>;
}

export class ImportOfflineWorkspaceUseCase {
  execute(input: {
    readonly sourceWorkspaceId: string;
    readonly targetWorkspaceId: string;
  }): Promise<ImportOfflineWorkspaceResult>;
}

export class DeleteOfflineWorkspaceUseCase {
  execute(input: {
    readonly sourceWorkspaceId: string;
  }): Promise<OfflineWorkspaceDeletion>;
}

export interface WorkspaceCommitGuard {
  assertCurrent(): void;
}

export interface GuardedWorkspaceUnitOfWork extends WorkspaceUnitOfWork {
  commitGuarded(
    command: WorkspaceCommand,
    guard: WorkspaceCommitGuard,
    events?: readonly PersistableDomainEvent[]
  ): Promise<CommitResult>;
}
```

- [ ] **Step 1: Write failing application use-case tests**

Use strict fakes that preserve real side effects at the application boundary. Cover:

- list delegates and returns immutable candidate copies;
- import rejects source = target;
- import rejects target ≠ `CurrentWorkspace.requireId()`;
- import calls `requireEdit(target)` before commit;
- a Matrix profile/user/device or `CurrentWorkspace` change while the Dexie
  transaction is open rejects and rolls back the target;
- import maps only `OfflineWorkspaceContent.tasks` into one command;
- cleanup runs only after successful commit;
- commit failure leaves cleanup uncalled;
- cleanup failure returns `cleanup: "pending"` without changing success to failure;
- retry uses the same deterministic operation/task IDs;
- delete delegates only after exact source validation in the store.

- [ ] **Step 2: Run use-case tests and verify RED**

Run:

```bash
npx vitest --run src/features/workspaces/application/use-cases/__tests__/OfflineWorkspaceReconciliationUseCases.test.ts
```

Expected: FAIL because the use cases do not exist.

- [ ] **Step 3: Implement orchestration**

`ImportOfflineWorkspaceUseCase.execute()` must:

1. capture and validate `targetWorkspaceId === currentWorkspace.requireId()`;
2. capture a complete ready Matrix identity
   (`profileId + userId + deviceId`) from `MatrixSession.snapshot()`;
3. reject `sourceWorkspaceId === targetWorkspaceId`;
4. call `store.readCandidate(sourceWorkspaceId)`, which revalidates unbound state;
5. re-check current target and exact Matrix identity after the async source read;
6. derive operation and task IDs;
7. call `unitOfWork.commitGuarded()` exactly once with
   `ImportOfflineWorkspace` and a synchronous guard that verifies the captured
   workspace and Matrix identity;
8. re-check target and identity after commit, then call
   `store.deleteCandidate(sourceWorkspaceId)`;
9. return cleanup pending when post-commit identity revalidation or deletion
   fails.

Do not catch or downgrade validation, authorization, read, mapping, or commit failures.

`AuthorizedWorkspaceUnitOfWork.commitGuarded()` performs
`authorization.requireEdit()` before delegating. The Dexie implementation
calls `guard.assertCurrent()` after command evaluation and again as the last
statement of the transaction callback. A guard failure throws inside the Dexie
transaction and rolls back snapshot, projections, audit, changes, and outbox.

- [ ] **Step 4: Run use-case tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing real-UoW integration tests**

In `DexieWorkspaceUnitOfWork.integration.test.ts`, create a source content fixture and an active target with a sync target. Execute the real import command through `DexieWorkspaceUnitOfWork`, then assert:

- exactly one new `workspaceChanges` row;
- exactly one pending outbox row for that change and target;
- target snapshot, projections, import audit, and outbox appear together;
- a forced projection persistence error rolls back all four;
- applying the same command twice creates no second change or outbox row.

- [ ] **Step 6: Run focused UoW integration test and verify RED**

Run:

```bash
npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/database/__tests__/DexieWorkspaceUnitOfWork.integration.test.ts
```

Expected: FAIL until the batch command satisfies atomic projection and idempotency assertions.

- [ ] **Step 7: Make the real-UoW tests GREEN**

Fix only production behavior exposed by the failing tests. Keep persistence inside the existing `DexieWorkspaceUnitOfWork.commit()` transaction; do not add a second target transaction or write outbox from the use case.

- [ ] **Step 8: Run Task 1–3 tests**

Run:

```bash
npx vitest --run src/features/workspaces/infrastructure/crypto/__tests__/Sha256OfflineImportIdFactory.test.ts src/features/workspaces/infrastructure/crdt/__tests__/AutomergeCommandHandler.test.ts src/features/workspaces/application/use-cases/__tests__/OfflineWorkspaceReconciliationUseCases.test.ts
npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/database/__tests__/DexieOfflineWorkspaceStore.integration.test.ts src/features/workspaces/infrastructure/database/__tests__/DexieWorkspaceUnitOfWork.integration.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/features/workspaces/application/use-cases/ListOfflineWorkspaceCandidatesUseCase.ts src/features/workspaces/application/use-cases/ImportOfflineWorkspaceUseCase.ts src/features/workspaces/application/use-cases/DeleteOfflineWorkspaceUseCase.ts src/features/workspaces/application/use-cases/__tests__/OfflineWorkspaceReconciliationUseCases.test.ts src/features/workspaces/application/ports/WorkspaceUnitOfWork.ts src/features/workspaces/application/services/AuthorizedWorkspaceUnitOfWork.ts src/features/workspaces/infrastructure/database/DexieWorkspaceUnitOfWork.ts src/features/workspaces/infrastructure/database/__tests__/DexieWorkspaceUnitOfWork.integration.test.ts
git commit -m "feat(workspaces): reconcile offline data into authorized accounts"
```

---

### Task 4: Runtime Composition, Modal, Later, and Settings Reminder

**Files:**

- Modify: `src/features/workspaces/application/SecureRuntime.ts`
- Modify: `src/features/workspaces/infrastructure/composition/createSecureRuntime.ts`
- Create: `src/features/workspaces/presentation/view-models/OfflineWorkspaceReconciliationViewModel.ts`
- Create: `src/features/workspaces/presentation/view-models/__tests__/OfflineWorkspaceReconciliationViewModel.test.ts`
- Create: `src/features/workspaces/presentation/components/OfflineWorkspaceReconciliationDialog.tsx`
- Create: `src/features/workspaces/presentation/components/__tests__/OfflineWorkspaceReconciliationDialog.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mvp/SecureMVPApp.tsx`
- Modify: `src/features/settings/presentation/components/SecureSettings.tsx`
- Modify: `src/features/workspaces/presentation/components/WorkspaceSetupScreen.tsx`

**Interfaces:**

- Extend `SecureRuntimeUseCases` with the three Task 3 use cases.
- Set `allowOfflineWorkspaceCreation: true` in the production runtime.
- Produce a shared Zustand store:

```ts
export interface OfflineWorkspaceReconciliationState {
  readonly candidates: readonly OfflineWorkspaceCandidate[];
  readonly active: OfflineWorkspaceCandidate | null;
  readonly open: boolean;
  readonly busy: boolean;
  readonly destructiveConfirmation: boolean;
  readonly status: string | null;
  readonly refresh: () => Promise<void>;
  readonly reopen: () => void;
  readonly later: () => void;
  readonly requestDelete: () => void;
  readonly cancelDelete: () => void;
  readonly importActive: () => Promise<void>;
  readonly deleteActive: () => Promise<void>;
}
```

- [ ] **Step 1: Write failing ViewModel tests**

Assert:

- `refresh()` opens the first candidate only when a Matrix target workspace is ready;
- `later()` only sets `open: false` and does not call import/delete;
- `reopen()` exposes the still-present candidate;
- import success removes the candidate and advances to the next;
- cleanup-pending success keeps a retryable candidate and shows `Импорт завершён, локальную копию пока не удалось удалить`;
- deletion requires `requestDelete()` before `deleteActive()`;
- errors preserve the active candidate and destructive confirmation.

- [ ] **Step 2: Run ViewModel tests and verify RED**

Run:

```bash
npx vitest --run src/features/workspaces/presentation/view-models/__tests__/OfflineWorkspaceReconciliationViewModel.test.ts
```

Expected: FAIL because the ViewModel does not exist.

- [ ] **Step 3: Implement the Zustand ViewModel**

The ViewModel receives only:

```ts
{
  workspaceId(): string | null;
  list: Pick<ListOfflineWorkspaceCandidatesUseCase, "execute">;
  importWorkspace: Pick<ImportOfflineWorkspaceUseCase, "execute">;
  deleteWorkspace: Pick<DeleteOfflineWorkspaceUseCase, "execute">;
}
```

No IndexedDB, Matrix SDK, or React object enters the ViewModel.

- [ ] **Step 4: Run ViewModel tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing component tests**

Render the real dialog with a real Zustand store configured with application fakes. Assert accessible behavior:

- heading `На этом устройстве найдены локальные задачи без аккаунта`;
- task count and formatted creation date; estimated legacy dates are labelled
  `Примерно сохранено`, never presented as exact creation time;
- Import, Delete, and Later buttons;
- exact Later explanation:

```text
Позже ничего не импортирует и не удаляет. Локальные данные останутся
зашифрованными только на этом устройстве, не попадут в Matrix и будут
предложены снова при следующем входе. Вернуться к выбору можно в Настройках.
```

- import disabled with an explanation when `workspaceId()` is null;
- delete opens a separate confirmation mentioning no Matrix recovery;
- Settings reminder remains visible after Later and invokes `reopen()`.

- [ ] **Step 6: Run component tests and verify RED**

Run:

```bash
npx vitest --run src/features/workspaces/presentation/components/__tests__/OfflineWorkspaceReconciliationDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 7: Compose runtime and presentation**

In `createSecureRuntime.ts`:

- construct `DexieOfflineWorkspaceStore`, `Sha256OfflineImportIdFactory`, and Task 3 use cases;
- expose them through `SecureRuntimeUseCases`;
- enable offline workspace creation in all modes;
- keep `CurrentWorkspace` selection and outbox scoping unchanged.

In `App.tsx`:

- create one reconciliation store with `useMemo`;
- call `refresh()` after a non-null authorized workspace becomes ready;
- render `OfflineWorkspaceReconciliationDialog` as an overlay;
- pass the same store through `SecureMVPApp` to `SecureSettings`.

In Settings, render a compact warning card when `candidates.length > 0`:

```text
На устройстве остались локальные задачи без аккаунта. Они не синхронизируются
и не видны текущему аккаунту.
```

The card button is `Решить, что делать` and calls `reopen()`.

- [ ] **Step 8: Run component, App, and existing auth tests**

Run:

```bash
npx vitest --run src/features/workspaces/presentation/view-models/__tests__/OfflineWorkspaceReconciliationViewModel.test.ts src/features/workspaces/presentation/components/__tests__/OfflineWorkspaceReconciliationDialog.test.tsx src/features/workspaces/presentation/components/__tests__/MatrixSetupWizard.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add src/features/workspaces/application/SecureRuntime.ts src/features/workspaces/infrastructure/composition/createSecureRuntime.ts src/features/workspaces/presentation/view-models/OfflineWorkspaceReconciliationViewModel.ts src/features/workspaces/presentation/view-models/__tests__/OfflineWorkspaceReconciliationViewModel.test.ts src/features/workspaces/presentation/components/OfflineWorkspaceReconciliationDialog.tsx src/features/workspaces/presentation/components/__tests__/OfflineWorkspaceReconciliationDialog.test.tsx src/App.tsx src/mvp/SecureMVPApp.tsx src/features/settings/presentation/components/SecureSettings.tsx src/features/workspaces/presentation/components/WorkspaceSetupScreen.tsx
git commit -m "feat(workspaces): add explicit offline reconciliation UI"
```

---

### Task 5: Real Browser and Matrix Acceptance

**Files:**

- Create: `tests/matrix/offline-workspace-reconciliation.spec.ts`
- Modify: `playwright.matrix.config.ts` only if the new file is outside the existing match pattern.

**Interfaces:**

- Consumes the user-visible UI and two local Synapse homeservers.
- Produces repeatable evidence for Later, Import, Delete, account isolation, exact-once realtime delivery, and restart safety.

- [ ] **Step 1: Write the failing Playwright scenarios**

Use fresh browser contexts and randomized Matrix accounts. Add three serially isolated tests:

1. **Later**
   - start offline-only;
   - create two local tasks;
   - sign into an existing account with a distinct task;
   - assert local tasks never appear in the account and no raw Matrix event contains their markers;
   - choose Later;
   - assert the exact explanatory copy and Settings reminder;
   - reload the application and assert the offer returns.

2. **Import**
   - create active, deferred, completed, tagged, noted, and Today-selected local fixtures;
   - sign into an existing account on device A and recover device B;
   - import on A;
   - assert both devices receive each imported task exactly once and keep the account's pre-existing task;
   - restart Synapse/PostgreSQL during one client's offline period;
   - assert convergence remains exact after reconnect;
   - reload A and assert no import offer remains.

3. **Delete and account switching**
   - create offline-only markers;
   - sign into account A and choose Delete with confirmation;
   - assert markers never reach Matrix and do not return after reload;
   - switch A → B → A and assert neither account displays or enqueues the other's tasks.

Before each assertion, name the production break it catches in a short code comment only when the reason is not obvious from the test name.

- [ ] **Step 2: Run the new E2E file and verify RED**

Ensure both Compose stacks are healthy, then run:

```bash
npm run test:e2e:matrix -- tests/matrix/offline-workspace-reconciliation.spec.ts
```

Expected: FAIL on the absent reconciliation UI before Task 4, or PASS only after Tasks 1–4; if it passes immediately, mutate the production action temporarily to verify each test detects the intended break, then revert the mutation.

- [ ] **Step 3: Fix only acceptance gaps**

Address observable failures in application code without weakening selectors, waits, ciphertext checks, or exact-once assertions. Use role/name/test IDs for stable UI actions and `expect.poll` for eventual Matrix delivery.

- [ ] **Step 4: Run the new E2E file and verify GREEN**

Run the command from Step 2. Expected: all new scenarios PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
npm run test:e2e:matrix
```

Expected:

- typecheck and lint pass;
- all unit and integration tests pass;
- production build passes;
- the complete Matrix suite, including offline reconciliation, passes against real local Synapse/PostgreSQL.

- [ ] **Step 6: Inspect raw storage isolation**

Use the E2E helpers to assert:

- dismissed offline task markers occur in no Matrix event or PostgreSQL event JSON;
- deleted markers occur in no Matrix event or PostgreSQL event JSON;
- imported markers occur only as ciphertext at rest and decrypt only on authorized devices;
- no source workspace outbox row remains claimable after Import/Delete.

- [ ] **Step 7: Commit Task 5**

```bash
git add tests/matrix/offline-workspace-reconciliation.spec.ts playwright.matrix.config.ts
git commit -m "test(matrix): cover offline workspace reconciliation"
```

---

## Completion Gate

The feature is complete only when:

- all five task commits have passed task-scoped spec and quality review;
- a final whole-branch review finds no load-bearing issue;
- `npm run verify` is green;
- the full real Matrix E2E suite is green;
- manual browser inspection confirms the modal, destructive confirmation, mobile layout, and Settings reminder match the existing Lift visual language;
- the branch remains free of unrelated user changes.
