# Matrix E2EE + Offline CRDT Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plaintext Supabase/LWW stack with a clean-slate, locally runnable Matrix E2EE + Automerge 3 system in which two independent browser devices edit offline, reconnect, and converge in realtime without exposing Lift content to Synapse or PostgreSQL.

**Architecture:** One Automerge document is the authoritative local-first state of one workspace; `LiftSecureDatabase` atomically persists snapshots, changes, projections, inbox, outbox, ACL and checkpoints; one Matrix E2EE room transports encrypted changes for that workspace. Domain and Application know only pure models and ports. Matrix, Automerge, Dexie, hashing/compression and retry logic stay in Infrastructure. React views call Zustand ViewModels, which call use cases. The Matrix server is a durable, untrusted relay and never resolves Lift conflicts.

**Tech Stack:** TypeScript, React 18, Zustand, TSyringe, Dexie 4.4.4, `@automerge/automerge` 3.3.2, `matrix-js-sdk` 42.0.0 with Rust/WASM crypto, Zod 4.4.3, `fractional-indexing` 4.0.0, fflate 0.8.3, Vitest, fast-check 4.9.0, Playwright, Synapse 1.157.0, PostgreSQL 18.4.

## Global Constraints

- The approved design at `docs/superpowers/specs/2026-07-22-matrix-e2ee-offline-sync-design.md` is normative. If implementation pressure conflicts with it, stop and amend the design explicitly; do not silently weaken encryption, offline behavior, authorization or durability.
- This is a clean start. The new runtime opens only IndexedDB `LiftSecureDatabase`. It never opens, migrates, imports, deletes or falls back to `TodoDatabase` or Supabase data.
- Domain has no imports from Automerge, Matrix, Dexie, Web Crypto, React, Zustand or TSyringe tokens. Application depends on ports. Infrastructure implements the ports. Presentation calls use cases only.
- Every local mutation commits Automerge changes, change hashes, projections, durable domain events and outbox records in one Dexie transaction. No network request is part of that transaction.
- Conflict winners never use wall-clock time, server order, receive order or `updatedAt`. Physical time is audit/display data only.
- Every received event is durably recorded before decryption/application. Apply and deduplication by Automerge change hash are atomic.
- Matrix uses `OnlySignedDevicesIsolationMode`, cross-signing, secret storage and encrypted key backup. Each server profile has a distinct `cryptoDatabasePrefix`; only one active Matrix client may own a prefix.
- Payloads larger than 32,768 raw bytes are split into independently hashed, deterministic fragments under the same versioned inner type. Receiver application waits for all fragments and validates each fragment plus the reconstructed Automerge/checkpoint hash; Matrix event-size limits may never cause data loss.
- Room version is `12`; room encryption is `m.megolm.v1.aes-sha2`; rotation is at most 24 hours or 100 application events and is forced after membership/device revocation.
- ACL mutations are an online, serialized security-control operation. An encrypted ACL checkpoint is authoritative; an unencrypted `dev.lift.acl.head.v1` Matrix state event contains only `{ hash, authEpoch }` and arbitrates concurrent writers. It never contains membership, roles, heads or Lift content. A client accepts a new head only after decrypting and validating the referenced checkpoint and refuses rollback below its locally accepted epoch.
- `http:` server profiles are accepted only for `localhost`, `127.0.0.0/8` and `[::1]`; every non-loopback profile requires `https:`.
- Do not add skipped/quarantined tests as a way to get green. Replace obsolete Supabase/TodoDatabase tests with tests for the new behavior, and finish with zero failures in typecheck, lint, unit, integration, E2E and security probes.
- Run the focused command after every red/green step. Run `npm run verify` at every review gate. Commit only files belonging to the task; never stage the unrelated newline change in `supabase/.temp/cli-latest`.

## Locked Contracts and Ownership

| Layer                            | Contract                                                                                                                                                                                   | Owner/implementation                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Domain                           | `WorkspaceState`, `WorkspaceRole`, ACL transition rules, OR-set and conflict policies, effective-date/recurrence rules                                                                     | `src/features/workspaces/domain/**`                |
| Application                      | `WorkspaceRepository`, `WorkspaceUnitOfWork`, `SyncOutbox`, `SyncInbox`, `EncryptedTransport`, `DeviceTrustService`, `ServerProfileRepository`, `EffectiveDateProvider`, `CheckpointStore` | `src/features/workspaces/application/ports/**`     |
| Infrastructure                   | Automerge adapter, `LiftSecureDatabase`, Matrix session/crypto/room transport, ACL/checkpoints, retry/quarantine                                                                           | `src/features/workspaces/infrastructure/**`        |
| Presentation                     | setup, recovery, device/access/server management, sync/conflict status ViewModels and views                                                                                                | `src/features/workspaces/presentation/**`          |
| Existing task/today/stats/log UI | consumes read ports/use cases; never imports database/Matrix/Automerge                                                                                                                     | existing feature folders, refactored in Tasks 8–10 |

The stable application mutation boundary is:

```ts
export interface WorkspaceUnitOfWork {
  commit(
    command: WorkspaceCommand,
    events?: DomainEvent[]
  ): Promise<CommitResult>;
  applyRemote(input: AcceptedRemoteChange): Promise<ApplyRemoteResult>;
}

export interface CommitResult {
  readonly workspaceId: WorkspaceId;
  readonly changeHashes: readonly ChangeHash[];
  readonly heads: readonly ChangeHash[];
}
```

The stable transport boundary is:

```ts
export interface EncryptedTransport {
  start(
    target: ActiveSyncTarget,
    onEvent: (event: EncryptedWireEvent) => Promise<void>
  ): Promise<void>;
  send(
    target: ActiveSyncTarget,
    envelope: OutboundEnvelope,
    transactionId: string
  ): Promise<string>;
  readBack(
    target: ActiveSyncTarget,
    eventId: string
  ): Promise<EncryptedWireEvent>;
  stop(targetId: SyncTargetId): Promise<void>;
}
```

---

## Review Gate A — deterministic offline core

### Task 1: Lock the supported toolchain and verification commands

**Files:**

- Create: `src/test/architecture/dependencyPolicy.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Create: `vitest.integration.config.ts`

**Produces:** reproducible CRDT/Matrix versions and separate unit/integration entry points.
**Consumes:** current npm/Vite project.

- [ ] Write the failing dependency-policy test:

```ts
import packageJson from "../../../package.json";

describe("secure sync dependency policy", () => {
  it("pins audited protocol dependencies instead of floating ranges", () => {
    expect(packageJson.dependencies).toMatchObject({
      "@automerge/automerge": "3.3.2",
      "matrix-js-sdk": "42.0.0",
      dexie: "4.4.4",
      "fractional-indexing": "4.0.0",
      fflate: "0.8.3",
      zod: "4.4.3",
    });
    expect(packageJson.devDependencies).toMatchObject({
      "fast-check": "4.9.0",
    });
    expect(packageJson.scripts).toHaveProperty("typecheck", "tsc --noEmit");
    expect(packageJson.scripts).toHaveProperty("verify");
  });
});
```

- [ ] Run `npx vitest --run src/test/architecture/dependencyPolicy.test.ts`; expect failure because the protocol dependencies and scripts are absent.
- [ ] Pin the dependencies and add these scripts (retain `@supabase/supabase-js` temporarily until Task 10, because the old runtime still imports it):

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest --run",
    "test:integration": "vitest --run --config vitest.integration.config.ts",
    "verify": "npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build"
  },
  "dependencies": {
    "@automerge/automerge": "3.3.2",
    "dexie": "4.4.4",
    "fflate": "0.8.3",
    "fractional-indexing": "4.0.0",
    "matrix-js-sdk": "42.0.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "fast-check": "4.9.0"
  }
}
```

- [ ] Run `npm install`, then remove `"noCheck": true` from `tsconfig.json`. Fix actual type errors; do not suppress them. Keep obsolete sync-test failures documented until their replacement tasks.
- [ ] Make `vitest.integration.config.ts` include only `src/**/*.integration.test.{ts,tsx}` and load `fake-indexeddb/auto`; exclude those files from the unit config.
- [ ] Run the focused test again; expect pass. Run `npm run typecheck`; expect pass.
- [ ] Commit: `build: pin secure sync protocol toolchain`

### Task 2: Define the pure workspace document and role model

**Files:**

- Create: `src/features/workspaces/domain/WorkspaceIdentity.ts`
- Create: `src/features/workspaces/domain/WorkspaceRole.ts`
- Create: `src/features/workspaces/domain/WorkspaceState.ts`
- Create: `src/features/workspaces/domain/__tests__/WorkspaceRole.test.ts`
- Create: `src/features/workspaces/domain/__tests__/WorkspaceState.test.ts`

**Produces:** infrastructure-free CRDT document schema and authorization vocabulary.
**Consumes:** existing `TaskCategory` and `DateOnly` semantics, represented on the wire as versioned strings.

- [ ] Write failing tests for role capabilities, last-owner protection and a valid empty workspace:

```ts
import { can, validateRoleTransition, WorkspaceRole } from "../WorkspaceRole";
import { createEmptyWorkspace } from "../WorkspaceState";

describe("workspace domain", () => {
  it("does not let an admin grant Owner or demote the last Owner", () => {
    expect(can(WorkspaceRole.Admin, "assign-owner")).toBe(false);
    expect(() =>
      validateRoleTransition({
        actorRole: WorkspaceRole.Owner,
        previousRoles: { "@owner:test": WorkspaceRole.Owner },
        nextRoles: { "@owner:test": WorkspaceRole.Admin },
      })
    ).toThrow("last Owner");
  });

  it("creates an empty, versioned document without physical-time winners", () => {
    const state = createEmptyWorkspace("ws_01", "Europe/Moscow", "09:00");
    expect(state.schemaVersion).toBe(1);
    expect(state.tasks).toEqual({});
    expect(state.dailySelections).toEqual({});
    expect(JSON.stringify(state)).not.toContain("updatedAt");
  });
});
```

- [ ] Run `npx vitest --run src/features/workspaces/domain/__tests__/WorkspaceRole.test.ts src/features/workspaces/domain/__tests__/WorkspaceState.test.ts`; expect module-not-found failures.
- [ ] Implement branded wire identities in `WorkspaceIdentity.ts` with strict non-empty constructors for `WorkspaceId`, `ChangeHash`, `DeviceId`, `ServerProfileId`, `SyncTargetId` and `AclHash`. Do not accept implicit casts at I/O boundaries.
- [ ] Implement the exact role policy in `WorkspaceRole.ts`:

```ts
export enum WorkspaceRole {
  Owner = "OWNER",
  Admin = "ADMIN",
  Editor = "EDITOR",
  Viewer = "VIEWER",
}

export type WorkspaceCapability =
  | "read"
  | "edit"
  | "invite"
  | "remove-member"
  | "assign-editor"
  | "assign-admin"
  | "assign-owner"
  | "revoke-device"
  | "migrate-server";

const capabilities: Record<WorkspaceRole, ReadonlySet<WorkspaceCapability>> = {
  [WorkspaceRole.Owner]: new Set([
    "read",
    "edit",
    "invite",
    "remove-member",
    "assign-editor",
    "assign-admin",
    "assign-owner",
    "revoke-device",
    "migrate-server",
  ]),
  [WorkspaceRole.Admin]: new Set([
    "read",
    "edit",
    "invite",
    "remove-member",
    "assign-editor",
    "revoke-device",
  ]),
  [WorkspaceRole.Editor]: new Set(["read", "edit"]),
  [WorkspaceRole.Viewer]: new Set(["read"]),
};

export const matrixPowerLevel: Record<WorkspaceRole, number> = {
  [WorkspaceRole.Owner]: 100,
  [WorkspaceRole.Admin]: 75,
  [WorkspaceRole.Editor]: 50,
  [WorkspaceRole.Viewer]: 0,
};

export const can = (
  role: WorkspaceRole,
  capability: WorkspaceCapability
): boolean => capabilities[role].has(capability);
```

- [ ] Implement `WorkspaceState.ts` as the complete Automerge-neutral schema:

```ts
export type DateOnlyString = string;
export type Dot = string;

export interface ObservedRemoveSet {
  adds: Record<string, Record<Dot, true>>;
  removedDots: Record<Dot, true>;
}

export interface TaskCrdtState {
  id: string;
  title: string;
  note: string;
  category: "INBOX" | "SIMPLE" | "FOCUS";
  position: { key: string; actorId: string };
  created: { deviceId: string; auditTime: string };
  deferredUntil: DateOnlyString | null;
  originalCategory: "INBOX" | "SIMPLE" | "FOCUS" | null;
  completion: "active" | "completed";
  tags: ObservedRemoveSet;
  deletionDots: Record<Dot, true>;
}

export interface RecurrenceTemplateState {
  id: string;
  title: string;
  note: string;
  category: TaskCrdtState["category"];
  rule: {
    frequency: "daily" | "weekly";
    interval: number;
    weekdays: number[];
    startsOn: DateOnlyString;
    endsOn: DateOnlyString | null;
  };
  deletionDots: Record<Dot, true>;
}

export interface CompletionRecordState {
  id: string;
  taskId: string;
  effectiveDate: DateOnlyString;
  kind: "completed" | "reopened";
  actorId: string;
  auditTime: string;
}

export interface WorkspaceState {
  schemaVersion: 1;
  workspaceId: string;
  settings: { timezone: string; startOfDay: string };
  tasks: Record<string, TaskCrdtState>;
  dailySelections: Record<DateOnlyString, ObservedRemoveSet>;
  recurrenceTemplates: Record<string, RecurrenceTemplateState>;
  materializedOccurrences: Record<
    string,
    { templateId: string; occurrenceDate: DateOnlyString; taskId: string }
  >;
  completionRecords: Record<string, CompletionRecordState>;
  auditRecords: Record<
    string,
    {
      id: string;
      kind: string;
      actorId: string;
      auditTime: string;
      data: Record<string, string>;
    }
  >;
}
```

- [ ] Validate timezone through `Intl.DateTimeFormat` and `startOfDay` against `^(?:[01]\\d|2[0-3]):[0-5]\\d$` in `createEmptyWorkspace`; return fresh maps for every call.
- [ ] Run the focused tests; expect pass. Run `npm run typecheck`.
- [ ] Commit: `feat(workspaces): define pure workspace and role domain`

### Task 3: Implement deterministic set, lifecycle, scalar and ordering policies

**Files:**

- Create: `src/features/workspaces/domain/ObservedRemoveSet.ts`
- Create: `src/features/workspaces/domain/ConflictPolicy.ts`
- Create: `src/features/workspaces/domain/__tests__/ObservedRemoveSet.test.ts`
- Create: `src/features/workspaces/domain/__tests__/ConflictPolicy.test.ts`
- Create: `src/features/workspaces/domain/__tests__/ConflictPolicy.property.test.ts`

**Produces:** deterministic conflict projections independent of arrival order.
**Consumes:** `ObservedRemoveSet`, Automerge op IDs supplied later as strings.

- [ ] Write failing examples for add-wins selection, delete-wins, completed-wins only under concurrency, canonical scalar winners and stable order:

```ts
it("keeps a concurrent add that remove did not observe", () => {
  const left = add(emptySet(), "task-1", "1@aa");
  const right = add(emptySet(), "task-1", "1@bb");
  const removedLeft = removeObserved(left, "task-1");
  expect(has(mergeSet(removedLeft, right), "task-1")).toBe(true);
});

it("uses completed for a true Automerge conflict and canonical op IDs for scalars", () => {
  expect(resolveCompletion({ "2@aa": "active", "1@bb": "completed" })).toBe(
    "completed"
  );
  expect(resolveScalar({ "9@aa": "FOCUS", "2@ff": "SIMPLE" }).value).toBe(
    "SIMPLE"
  );
});
```

- [ ] Run the three focused files; expect missing-module failures.
- [ ] Implement OR-set functions. `removeObserved` records only dots currently visible for that element; `mergeSet` unions adds and removed dots; membership means at least one add dot is not removed. Never delete an add dot physically.
- [ ] Implement the canonical op-ID comparator and conflict result:

```ts
export interface ConflictResolution<T> {
  value: T;
  winnerOpId: string;
  alternatives: ReadonlyArray<{ opId: string; value: T }>;
}

const parseOpId = (opId: string): { counter: bigint; actor: string } => {
  const separator = opId.indexOf("@");
  if (separator < 1) throw new Error(`Invalid Automerge op id: ${opId}`);
  return {
    counter: BigInt(opId.slice(0, separator)),
    actor: opId.slice(separator + 1),
  };
};

export const compareOpIds = (left: string, right: string): number => {
  const a = parseOpId(left);
  const b = parseOpId(right);
  const actorOrder = a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0;
  return actorOrder !== 0
    ? actorOrder
    : a.counter < b.counter
      ? -1
      : a.counter > b.counter
        ? 1
        : 0;
};

export function resolveScalar<T>(
  values: Readonly<Record<string, T>>
): ConflictResolution<T> {
  const alternatives = Object.entries(values)
    .map(([opId, value]) => ({ opId, value }))
    .sort((a, b) => compareOpIds(a.opId, b.opId));
  if (alternatives.length === 0)
    throw new Error("Scalar conflict set is empty");
  const winner = alternatives[alternatives.length - 1];
  return { value: winner.value, winnerOpId: winner.opId, alternatives };
}
```

- [ ] Implement `resolveCompletion`: Automerge removes causally overwritten assignments, so one remaining value is returned as-is; among two or more concurrent values, any `completed` wins. Implement deletion as `Object.keys(deletionDots).length > 0`. Implement position comparison as `key`, then `actorId`, then `taskId` using code-unit lexical comparison, never locale-dependent UI collation.
- [ ] Add a fast-check property that shuffles the same conflict map and OR-set operations 100 times and always obtains byte-identical canonical JSON.
- [ ] Run all focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(workspaces): add deterministic conflict policies`

### Task 4: Make day boundaries, defer projections and recurrence pure

**Files:**

- Create: `src/features/workspaces/domain/EffectiveDate.ts`
- Create: `src/features/workspaces/domain/Recurrence.ts`
- Create: `src/features/workspaces/application/ports/OccurrenceIdFactory.ts`
- Create: `src/features/workspaces/infrastructure/crypto/Sha256OccurrenceIdFactory.ts`
- Create: `src/features/workspaces/domain/__tests__/EffectiveDate.test.ts`
- Create: `src/features/workspaces/domain/__tests__/Recurrence.test.ts`
- Create: `src/features/workspaces/infrastructure/crypto/__tests__/Sha256OccurrenceIdFactory.test.ts`

**Produces:** leaderless start-of-day/defer/recurrence behavior and deterministic occurrence IDs.
**Consumes:** workspace timezone/start-of-day and local clock as explicit input.

- [ ] Write failing tests covering the minute before/at boundary, a DST transition, defer projection, a long offline recurrence gap, and equal occurrence IDs from two callers:

```ts
expect(
  effectiveDate(new Date("2026-07-22T05:59:00Z"), "Europe/Moscow", "09:00")
).toBe("2026-07-21");
expect(
  effectiveDate(new Date("2026-07-22T06:00:00Z"), "Europe/Moscow", "09:00")
).toBe("2026-07-22");
expect(
  projectDeferred(
    {
      category: "FOCUS",
      deferredUntil: "2026-07-22",
      originalCategory: "FOCUS",
    },
    "2026-07-21"
  )
).toBe("DEFERRED");
expect(
  projectDeferred(
    {
      category: "FOCUS",
      deferredUntil: "2026-07-22",
      originalCategory: "FOCUS",
    },
    "2026-07-22"
  )
).toBe("FOCUS");
```

- [ ] Run the focused tests; expect module-not-found failures.
- [ ] Implement `effectiveDate(now, timeZone, startOfDay)` by constructing `Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })`. Compare local wall-clock minutes to the boundary; if earlier, subtract one day using UTC date-only arithmetic. Never mutate state when the date changes.
- [ ] Implement `enumerateOccurrenceDates(rule, fromInclusive, toInclusive)` for daily/weekly interval rules. Validate `interval >= 1`, weekday integers `0..6`, start/end bounds, deduplicate and sort date strings. Implement `projectDeferred` as a pure category projection.
- [ ] Implement the port and SHA-256 adapter exactly:

```ts
export interface OccurrenceIdFactory {
  create(templateId: string, occurrenceDate: string): Promise<string>;
}

export class Sha256OccurrenceIdFactory implements OccurrenceIdFactory {
  async create(templateId: string, occurrenceDate: string): Promise<string> {
    const bytes = new TextEncoder().encode(`${templateId}\0${occurrenceDate}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }
}
```

- [ ] Run the focused tests; expect pass. Add a test proving Today entries for `2026-07-21` remain stored and simply disappear from the `2026-07-22` projection.
- [ ] Commit: `feat(workspaces): make date and recurrence behavior leaderless`

### Task 5: Wrap Automerge behind an infrastructure-owned document engine

**Files:**

- Create: `src/features/workspaces/infrastructure/crdt/AutomergeWorkspaceDocument.ts`
- Create: `src/features/workspaces/infrastructure/crdt/AutomergeConflictReader.ts`
- Create: `src/features/workspaces/infrastructure/crdt/ActorIdFactory.ts`
- Create: `src/features/workspaces/infrastructure/crdt/__tests__/AutomergeWorkspaceDocument.test.ts`
- Create: `src/features/workspaces/infrastructure/crdt/__tests__/AutomergeConvergence.property.test.ts`

**Produces:** binary snapshots/changes, Automerge hashes/heads, collaborative text and conflict metadata without leaking Automerge into Application.
**Consumes:** `WorkspaceState` and pure conflict policies.

- [ ] Write a failing test which loads one snapshot under two actor IDs, makes concurrent title/category/completion changes, applies the binary changes in both orders and compares canonical projections and heads:

```ts
const base = AutomergeWorkspaceDocument.create(emptyState, "aa".repeat(16));
const snapshot = base.save();
const left = AutomergeWorkspaceDocument.load(snapshot, "bb".repeat(16));
const right = AutomergeWorkspaceDocument.load(snapshot, "cc".repeat(16));

const leftChanges = left.change("left", (draft) => {
  draft.tasks.task.category = "FOCUS";
  draft.tasks.task.completion = "active";
});
const rightChanges = right.change("right", (draft) => {
  draft.tasks.task.category = "SIMPLE";
  draft.tasks.task.completion = "completed";
});

const mergedLR = AutomergeWorkspaceDocument.load(snapshot, "dd".repeat(16));
mergedLR.apply([...leftChanges, ...rightChanges]);
const mergedRL = AutomergeWorkspaceDocument.load(snapshot, "ee".repeat(16));
mergedRL.apply([...rightChanges, ...leftChanges]);
expect(mergedLR.canonical()).toEqual(mergedRL.canonical());
expect([...mergedLR.heads()].sort()).toEqual([...mergedRL.heads()].sort());
```

- [ ] Run `npx vitest --run src/features/workspaces/infrastructure/crdt/__tests__`; expect module-not-found failures.
- [ ] Implement `ActorIdFactory` as SHA-256 of `serverProfileId + "\0" + matrixUserId + "\0" + matrixDeviceId`, encoded as lowercase hex. Never pass a Matrix device ID directly because Automerge actor IDs must be valid stable hex.
- [ ] Implement `AutomergeWorkspaceDocument` with the audited 3.3.2 APIs and no `any` escape hatch:

```ts
import * as Automerge from "@automerge/automerge";

export interface BinaryWorkspaceChange {
  readonly bytes: Uint8Array;
  readonly hash: string;
  readonly dependencies: readonly string[];
}

export class AutomergeWorkspaceDocument {
  private constructor(private document: Automerge.Doc<WorkspaceState>) {}

  static create(
    state: WorkspaceState,
    actor: string
  ): AutomergeWorkspaceDocument {
    return new AutomergeWorkspaceDocument(
      Automerge.from({ ...state }, { actor }) as Automerge.Doc<WorkspaceState>
    );
  }

  static load(snapshot: Uint8Array, actor: string): AutomergeWorkspaceDocument {
    return new AutomergeWorkspaceDocument(
      Automerge.load<WorkspaceState>(snapshot, { actor })
    );
  }

  change(
    message: string,
    mutate: Automerge.ChangeFn<WorkspaceState>
  ): BinaryWorkspaceChange[] {
    const before = this.document;
    this.document = Automerge.change(
      this.document,
      { message, time: 0 },
      mutate
    );
    return Automerge.getChanges(before, this.document).map((bytes) => {
      const decoded = Automerge.decodeChange(bytes);
      return { bytes, hash: decoded.hash, dependencies: decoded.deps };
    });
  }

  apply(changes: readonly BinaryWorkspaceChange[]): void {
    [this.document] = Automerge.applyChanges(
      this.document,
      changes.map((change) => change.bytes)
    );
  }

  save(): Uint8Array {
    return Automerge.save(this.document);
  }
  heads(): readonly string[] {
    return Automerge.getHeads(this.document);
  }
  value(): Readonly<WorkspaceState> {
    return this.document;
  }
}
```

- [ ] Keep `Automerge.ChangeFn<WorkspaceState>` private to `infrastructure/crdt`; no Automerge draft/document type may cross the adapter boundary.
- [ ] Add `updateText(path, nextText)` using `Automerge.updateText` or `Automerge.splice` inside the change callback. Add `AutomergeConflictReader` that calls `Automerge.getConflicts(object, property)` and passes the returned op-ID map into Domain `resolveScalar`/`resolveCompletion`.
- [ ] Add a fast-check property over 2–5 actors and shuffled/duplicated changes; assert identical sorted heads/canonical projection, save each merged document, reload each saved byte array under a fresh actor, and assert the reloaded results remain identical.
- [ ] Run the focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(workspaces): add Automerge document engine`

### Task 6: Create the clean-slate secure IndexedDB schema

**Files:**

- Create: `src/features/workspaces/infrastructure/database/records.ts`
- Create: `src/features/workspaces/infrastructure/database/LiftSecureDatabase.ts`
- Create: `src/features/workspaces/infrastructure/database/__tests__/LiftSecureDatabase.integration.test.ts`
- Modify: `vitest.integration.config.ts`

**Produces:** version-1-only `LiftSecureDatabase` with durable protocol and projection tables.
**Consumes:** branded identity strings and binary Automerge data.

- [ ] Write a failing integration test that opens the new DB, asserts the exact table names, writes binary data, closes/reopens and proves persistence:

```ts
const db = new LiftSecureDatabase(
  `LiftSecureDatabase-test-${crypto.randomUUID()}`
);
await db.open();
expect(db.name.startsWith("LiftSecureDatabase")).toBe(true);
expect(db.tables.map((table) => table.name).sort()).toEqual(
  [
    "aclCheckpoints",
    "conflictProjections",
    "dailySelectionProjections",
    "domainEvents",
    "handledDomainEvents",
    "localSecrets",
    "matrixEventIndex",
    "quarantine",
    "serverProfiles",
    "payloadFragments",
    "syncInbox",
    "syncOutbox",
    "syncTargets",
    "taskProjections",
    "workspaceChanges",
    "workspaceSnapshots",
  ].sort()
);
```

- [ ] Run `npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/database/__tests__/LiftSecureDatabase.integration.test.ts`; expect failure.
- [ ] Define records with `Uint8Array` payloads, versioned status unions and no domain plaintext in transport metadata. In particular:

```ts
export interface WorkspaceSnapshotRecord {
  workspaceId: string;
  schemaVersion: 1;
  bytes: Uint8Array;
  heads: string[];
  savedAt: number;
}
export interface WorkspaceChangeRecord {
  workspaceId: string;
  changeHash: string;
  bytes: Uint8Array;
  dependencies: string[];
  origin: "local" | "remote";
  createdAt: number;
}
export interface SyncOutboxRecord {
  id: string;
  workspaceId: string;
  targetId: string;
  changeHash: string;
  innerType:
    | "dev.lift.crdt.change.v1"
    | "dev.lift.checkpoint.v1"
    | "dev.lift.acl.v1";
  authEpoch: number;
  state:
    | "pending"
    | "sending"
    | "paused-auth"
    | "paused-permanent-error"
    | "acknowledged";
  attemptCount: number;
  nextAttemptAt: number;
  lastError: string | null;
  matrixTxnId: string;
  matrixEventIds: string[];
  nextFragmentIndex: number;
}
export interface SyncInboxRecord {
  eventId: string;
  workspaceId: string | null;
  roomId: string;
  wireEvent: string;
  state:
    | "received"
    | "waiting-keys"
    | "waiting-dependencies"
    | "ready"
    | "handled"
    | "quarantined";
  receivedAt: number;
  lastError: string | null;
}
export interface QuarantineRecord {
  id: string;
  eventId: string;
  workspaceId: string | null;
  reason:
    | "wrong-room"
    | "unverified-device"
    | "unauthorized"
    | "invalid-schema"
    | "hash-mismatch"
    | "impossible-dependencies"
    | "acl-fork"
    | "rollback";
  detail: string;
  createdAt: number;
}
export interface PayloadFragmentRecord {
  direction: "outbound" | "inbound";
  transferId: string;
  index: number;
  count: number;
  workspaceId: string;
  changeHash: string;
  fragmentHash: string;
  bytes: Uint8Array;
  matrixEventId: string | null;
}
```

- [ ] Implement one Dexie version only:

```ts
export class LiftSecureDatabase extends Dexie {
  workspaceSnapshots!: Table<WorkspaceSnapshotRecord, string>;
  workspaceChanges!: Table<WorkspaceChangeRecord, [string, string]>;
  syncOutbox!: Table<SyncOutboxRecord, string>;
  syncInbox!: Table<SyncInboxRecord, string>;
  matrixEventIndex!: Table<MatrixEventIndexRecord, string>;
  syncTargets!: Table<SyncTargetRecord, string>;
  aclCheckpoints!: Table<AclCheckpointRecord, [string, number]>;
  quarantine!: Table<QuarantineRecord, string>;
  taskProjections!: Table<TaskProjectionRecord, [string, string]>;
  dailySelectionProjections!: Table<
    DailySelectionProjectionRecord,
    [string, string, string]
  >;
  conflictProjections!: Table<ConflictProjectionRecord, string>;
  payloadFragments!: Table<PayloadFragmentRecord, [string, string, number]>;
  serverProfiles!: Table<ServerProfileRecord, string>;
  localSecrets!: Table<LocalSecretRecord, string>;
  domainEvents!: Table<DomainEventRecord, string>;
  handledDomainEvents!: Table<HandledDomainEventRecord, [string, string]>;

  constructor(name = "LiftSecureDatabase") {
    super(name);
    this.version(1).stores({
      workspaceSnapshots: "&workspaceId",
      workspaceChanges:
        "&[workspaceId+changeHash], workspaceId, changeHash, origin",
      syncOutbox:
        "&id, [workspaceId+state], [state+nextAttemptAt], targetId, changeHash",
      syncInbox: "&eventId, [workspaceId+state], [state+receivedAt], roomId",
      matrixEventIndex: "&eventId, [workspaceId+changeHash], roomId",
      syncTargets: "&id, workspaceId, serverProfileId, mode",
      aclCheckpoints: "&[workspaceId+authEpoch], &hash, previousHash",
      quarantine: "&id, eventId, workspaceId, reason, createdAt",
      taskProjections:
        "&[workspaceId+taskId], [workspaceId+category], [workspaceId+completion], [workspaceId+positionKey]",
      dailySelectionProjections:
        "&[workspaceId+date+taskId], [workspaceId+date]",
      conflictProjections: "&id, [workspaceId+taskId], path",
      payloadFragments:
        "&[direction+transferId+index], [direction+transferId], workspaceId, changeHash",
      serverProfiles: "&id, baseUrl",
      localSecrets: "&id, serverProfileId",
      domainEvents:
        "&id, [workspaceId+status], [status+nextAttemptAt], aggregateId",
      handledDomainEvents: "&[eventId+handlerId], eventId, handlerId",
    });
  }
}
```

- [ ] Add an explicit test that constructing/opening this class never creates a database named `TodoDatabase`; do not delete any pre-existing legacy DB in the test or production code.
- [ ] Run the integration test twice to exercise close/reopen; expect pass.
- [ ] Commit: `feat(workspaces): add clean secure IndexedDB schema`

### Task 7: Make local command, projection, outbox and event persistence atomic

**Files:**

- Create: `src/features/workspaces/application/commands/WorkspaceCommand.ts`
- Create: `src/features/workspaces/application/ports/WorkspaceUnitOfWork.ts`
- Create: `src/features/workspaces/application/ports/WorkspaceRepository.ts`
- Create: `src/features/workspaces/application/ports/CurrentWorkspace.ts`
- Create: `src/features/workspaces/infrastructure/crdt/AutomergeCommandHandler.ts`
- Create: `src/features/workspaces/infrastructure/crdt/WorkspaceProjector.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieWorkspaceUnitOfWork.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieWorkspaceRepository.ts`
- Create: `src/features/workspaces/infrastructure/database/__tests__/DexieWorkspaceUnitOfWork.integration.test.ts`

**Produces:** the single local write path and disposable read models.
**Consumes:** Automerge engine, secure DB, pure command/domain rules.

- [ ] Define a closed `WorkspaceCommand` union covering `CreateTask`, `SpliceTaskText` (title/note path plus UTF-16 index/delete/insert), `ChangeTaskCategory`, `MoveTask`, `CompleteTask`, `ReopenTask`, `DeferTask`, `DeleteTask`, `AddTag`, `RemoveTag`, `AddToDay`, `RemoveFromDay`, `UpdateWorkspaceSettings`, `MaterializeOccurrence`, and `AppendAuditRecord`. Every command carries `workspaceId`, `actorId`, `operationId`; only audit fields may carry physical time.
- [ ] Write a failing atomicity test. Inject a projector that throws after Automerge has produced a change, then assert snapshot, changes, outbox, projections and domain events are all absent. Repeat with a normal projector and assert all are present with the same change hash:

```ts
await expect(unitOfWork.commit(createTaskCommand)).rejects.toThrow(
  "projection failed"
);
expect(await db.workspaceChanges.count()).toBe(0);
expect(await db.syncOutbox.count()).toBe(0);
expect(await db.taskProjections.count()).toBe(0);

const result = await healthyUnitOfWork.commit(createTaskCommand, [
  taskCreatedEvent,
]);
expect(
  await db.workspaceChanges.get([workspaceId, result.changeHashes[0]])
).toBeDefined();
expect((await db.syncOutbox.toArray())[0].changeHash).toBe(
  result.changeHashes[0]
);
```

- [ ] Run the focused integration test; expect missing implementation.
- [ ] Implement `AutomergeCommandHandler`. Use `Automerge.updateText` for title/note, `generateKeyBetween` for positions, OR-set dots for tags/selections, scalar assignment for category/defer/completion, and grow-only `deletionDots`. Reject edits to a deleted task. Materialization uses the deterministic task/occurrence ID and is an idempotent no-op if already present.
- [ ] Implement `WorkspaceProjector` to:
  1. hide deleted tasks;
  2. resolve completion and scalars through `AutomergeConflictReader`;
  3. store every non-winning scalar alternative in `conflictProjections`;
  4. calculate tags/daily selections from OR-sets;
  5. derive display category from `projectDeferred` for the requested effective date;
  6. sort by position key, actor ID and task ID.
- [ ] Implement `DexieWorkspaceUnitOfWork.commit` in one read-write Dexie transaction over snapshots, changes, task/daily/conflict projections, outbox, domain events and targets: load snapshot, apply command, persist each new binary change keyed by decoded Automerge hash, replace snapshot, replace affected projections, append one outbox row per active target, append durable domain events, then return heads. Signal the outbox processor only after the transaction promise resolves.
- [ ] Implement `applyRemote` in the same class: if `[workspaceId, changeHash]` exists, only mark inbox/event index handled; otherwise validate dependencies, apply, persist change/snapshot/projections and mark the inbox handled in the same transaction. Duplicate delivery must never create an outbox row.
- [ ] Add integration cases for transaction rollback, duplicate remote apply, missing dependency pending state, app restart/reopen, and projection rebuild from snapshot + changes.
- [ ] Run the focused integration suite and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(workspaces): atomically persist CRDT mutations and outbox`

### Task 8: Refactor task and Today use cases onto Application ports

**Files:**

- Modify: `src/shared/application/use-cases/BaseTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/CreateTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/UpdateTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/ChangeTaskNoteUseCase.ts`
- Modify: `src/shared/application/use-cases/DeleteTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/ReorderTasksUseCase.ts`
- Modify: `src/shared/application/use-cases/CompleteTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/RevertTaskCompletionUseCase.ts`
- Modify: `src/shared/application/use-cases/DeferTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/UndeferTaskUseCase.ts`
- Modify: `src/shared/application/use-cases/AddTaskToTodayUseCase.ts`
- Modify: `src/shared/application/use-cases/RemoveTaskFromTodayUseCase.ts`
- Modify: `src/shared/application/use-cases/GetTodayTasksUseCase.ts`
- Create: `src/features/tasks/presentation/view-models/CollaborativeTextViewModel.ts`
- Create: `src/features/tasks/presentation/components/CollaborativeTextEditor.tsx`
- Modify: `src/features/tasks/presentation/components/task-card/TaskTitleEditor.tsx`
- Modify: `src/features/tasks/presentation/components/task-card/TaskEditModal.tsx`
- Modify: `src/shared/ui/components/NoteModal.tsx`
- Delete: `src/shared/ui/components/TiptapEditor.tsx`
- Modify: matching tests under `src/shared/application/use-cases/__tests__/**`
- Create: `src/features/workspaces/application/ports/EffectiveDateProvider.ts`
- Create: `src/features/workspaces/infrastructure/time/SystemEffectiveDateProvider.ts`

**Produces:** user scenarios that commit locally through `WorkspaceUnitOfWork`; no Application import of Dexie/sync tokens.
**Consumes:** `CurrentWorkspace`, query repository, unit of work, effective date provider.

- [ ] First add an architecture test in `src/test/architecture/layerBoundaries.test.ts` that scans `src/shared/application` and `src/features/*/application` and fails on imports containing `/infrastructure/`, `dexie`, `matrix-js-sdk` or `@automerge`.
- [ ] Run it; expect failures from `TodoDatabase`, `hashUtils`, DI-token and debounced-sync imports in existing use cases.
- [ ] Replace `BaseTaskUseCase` dependencies with ports:

```ts
export abstract class BaseTaskUseCase {
  constructor(
    protected readonly workspace: CurrentWorkspace,
    protected readonly repository: WorkspaceRepository,
    protected readonly unitOfWork: WorkspaceUnitOfWork,
    protected readonly actor: CurrentActor
  ) {}

  protected async commit(
    command: WorkspaceCommand,
    events: DomainEvent[] = []
  ): Promise<CommitResult> {
    return this.unitOfWork.commit(command, events);
  }
}
```

- [ ] Refactor every mutation use case to validate through Domain, build exactly one semantic command and await local commit. Remove direct transaction, sync queue, hash and `DebouncedSyncService` behavior. `UndeferTaskUseCase` becomes an explicit user action only; time crossing itself never invokes it.
- [ ] Replace HTML/Tiptap note persistence with plain collaborative text for the clean-slate model; remove Tiptap dependencies in Task 27. `CollaborativeTextViewModel` converts each input edit into the smallest common-prefix/common-suffix splice and commits `SpliceTaskText` immediately (delivery remains asynchronous). Apply remote text patches without replacing a focused editor's unsent local buffer, and test two devices editing different ranges converge to valid text. This deliberate UI simplification avoids attempting to CRDT-merge HTML markup.
- [ ] Refactor Today use cases to use a dated OR-set command and `EffectiveDateProvider.current(workspaceSettings)` when no date is supplied. Remove `clearDay` from the repository contract and all production callers.
- [ ] Update use-case tests with in-memory port fakes. Add one integration test that invokes the real `CreateTaskUseCase` while `navigator.onLine` is false and observes the task immediately plus one durable pending outbox record.
- [ ] Run all use-case tests, the boundary test and `npm run typecheck`; expect pass.
- [ ] Commit: `refactor(tasks): route local mutations through workspace unit of work`

### Task 9: Convert settings, onboarding, logs and statistics to deterministic projections

**Files:**

- Modify: `src/features/onboarding/application/services/OnboardingService.ts`
- Modify: `src/features/onboarding/application/services/UserSettingsService.ts`
- Modify: `src/features/onboarding/presentation/view-models/OnboardingViewModel.ts`
- Modify: `src/features/onboarding/presentation/view-models/UserSettingsViewModel.ts`
- Modify: `src/shared/application/services/DeferredTaskService.ts`
- Modify: `src/features/logs/application/services/LogRetentionService.ts`
- Modify: `src/features/stats/application/services/StatisticsService.ts`
- Modify: `src/features/stats/application/services/EventMonitor.ts`
- Modify: `src/features/stats/application/services/EventCleanupService.ts`
- Modify: `src/features/stats/application/event-handlers/NotificationHandler.ts`
- Modify: `src/features/stats/application/event-handlers/StatsUpdateHandler.ts`
- Modify: `src/features/stats/application/event-handlers/TaskLogEventHandler.ts`
- Modify: `src/features/stats/presentation/view-models/StatsViewModel.ts`
- Modify: `src/features/today/presentation/view-models/TodayViewModel.ts`
- Modify: `src/features/today/presentation/view-models/TodayViewModelStore.ts`
- Modify: `src/shared/application/use-cases/CreateSystemLogUseCase.ts`
- Modify: `src/shared/application/use-cases/CreateUserLogUseCase.ts`
- Modify: `src/shared/application/use-cases/GetTaskLogsUseCase.ts`
- Modify: `src/shared/application/services/TaskLogService.ts`
- Modify: `src/shared/domain/events/EventBus.ts`
- Modify: related tests under those feature folders
- Modify: `src/mvp/components/DevDayTransition.tsx`

**Produces:** date-based views and immutable audit/statistics derived from the CRDT, with no timer leader.
**Consumes:** query/use-case ports and effective-date projection.

- [ ] Extend the layer-boundary test to all `src/features/*/application`; run it and capture the current direct `TodoDatabase` failures.
- [ ] Run `npx vitest --run src/test/architecture/layerBoundaries.test.ts src/features/onboarding src/features/logs src/features/stats`; expect failures from direct database imports and day-clearing behavior.
- [ ] Use this integration assertion as the red/green date criterion:

```ts
const before = await db.workspaceChanges.count();
clock.set(new Date("2026-07-22T06:00:00Z"));
await todayViewModel.refresh();
expect(await db.workspaceChanges.count()).toBe(before);
expect(todayViewModel.effectiveDate).toBe("2026-07-22");
expect(await repository.getTaskIdsForDay(workspaceId, "2026-07-21")).toContain(
  taskId
);
```

- [ ] Replace settings persistence: workspace timezone/start-of-day goes through `UpdateWorkspaceSettings`; language/debug UI preferences remain local presentation preferences in a narrow `LocalPreferenceRepository` port.
- [ ] Replace mutable task logs and all three log use cases with `AppendAuditRecord` commands/queries. Convert `EventBus` into a pure Application port and let Task 18 provide the persistent adapter/dispatcher. Derive statistics from immutable completion/audit records in `WorkspaceProjector`; make cleanup compact only disposable projections, never CRDT audit history that is not covered by a verified checkpoint.
- [ ] Delete `DeferredTaskService.processDueTasks` and any interval/wakeup caller. Make `getDeferredTasks(effectiveDate)` a pure query projection.
- [ ] The replacement service delegates only to the read model:

```ts
export class DeferredTaskService {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly repository: WorkspaceRepository
  ) {}

  async getDeferredTasks(effectiveDate: string): Promise<readonly Task[]> {
    return this.repository.findTasks({
      workspaceId: this.workspace.requireId(),
      projectedCategory: "DEFERRED",
      effectiveDate,
    });
  }
}
```

- [ ] Change `DevDayTransition` to adjust only an injected test clock. Delete its `clearDay` call. Add tests proving a day transition writes zero Automerge changes/outbox rows while the visible Today set changes to the new date.
- [ ] Update onboarding so the daily modal key is the effective date and querying another day never clears prior selections.
- [ ] Run all onboarding/log/stats/date tests and the layer-boundary test; expect pass.
- [ ] Commit: `refactor: derive day, logs and statistics from workspace state`

### Task 10: Switch the app to the clean runtime and remove legacy production paths

**Files:**

- Create: `src/features/workspaces/application/SecureRuntime.ts`
- Create: `src/features/workspaces/presentation/view-models/WorkspaceSetupViewModel.ts`
- Create: `src/features/workspaces/presentation/components/WorkspaceSetupScreen.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mvp/MVPApp.tsx`
- Modify: `src/shared/infrastructure/di/tokens.ts`
- Modify: `src/shared/infrastructure/di/container.ts`
- Modify: `src/shared/infrastructure/di/index.ts`
- Delete: `src/shared/infrastructure/di/syncContainer.ts`
- Delete: `src/shared/infrastructure/sync/SyncInitializer.ts`
- Delete: `src/shared/infrastructure/sync/index.ts`
- Delete: `src/shared/infrastructure/database/TodoDatabase.ts`
- Delete: `src/shared/infrastructure/database/SupabaseClient.ts`
- Delete: `src/shared/infrastructure/database/supabase-types.ts`
- Delete: `src/shared/infrastructure/config/supabase.config.ts`
- Delete: `src/shared/infrastructure/repositories/SupabaseSyncRepository.ts`
- Delete: `src/shared/infrastructure/repositories/TaskRepositoryImpl.ts`
- Delete: `src/shared/infrastructure/repositories/DailySelectionRepositoryImpl.ts`
- Delete: `src/shared/infrastructure/repositories/UserSettingsRepositoryImpl.ts`
- Delete: `src/shared/infrastructure/services/SupabaseRealtimeService.ts`
- Delete: `src/shared/application/services/SyncService.ts`
- Delete: `src/shared/application/services/DebouncedSyncService.ts`
- Delete: `src/shared/domain/repositories/SyncRepository.ts`
- Delete: tests dedicated to the deleted repositories/services
- Delete: obsolete Supabase/TodoDatabase tests for those exact deleted implementations
- Modify: `package.json`
- Modify: `package-lock.json`

**Produces:** an empty secure first launch and an offline-capable local runtime; old DB is not opened.
**Consumes:** new database, ports, DI registrations and ViewModel shell.

- [ ] Write a failing Playwright smoke test `tests/secure-clean-start.spec.ts`: pre-seed a task into legacy `TodoDatabase`, reload, assert it is invisible, assert setup is shown, and assert IndexedDB contains both untouched `TodoDatabase` and new `LiftSecureDatabase` names.
- [ ] Add a Vitest architecture test that fails if production `src/**` contains `Supabase`, `supabase`, `TodoDatabase`, `VITE_SUPABASE`, `SyncInitializer` or imports old `useAuth`/`useSync`.
- [ ] Run both guards and `npx playwright test tests/secure-clean-start.spec.ts`; expect the current Supabase startup/legacy task visibility assertions to fail.
- [ ] Make the clean-start E2E seed the legacy DB without importing old production code:

```ts
await page.evaluate(async () => {
  const request = indexedDB.open("TodoDatabase", 1);
  await new Promise<void>((resolve, reject) => {
    request.onupgradeneeded = () =>
      request.result.createObjectStore("tasks", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction("tasks", "readwrite");
      transaction
        .objectStore("tasks")
        .put({ id: "legacy", title: "must stay invisible" });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  });
});
await page.reload();
await expect(page.getByText("must stay invisible")).toHaveCount(0);
await expect(page.getByTestId("matrix-setup-wizard")).toBeVisible();
```

- [ ] Replace startup with one awaited composition root:

```ts
const runtime = await createSecureRuntime();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App runtime={runtime} /></React.StrictMode>,
);
window.addEventListener("pagehide", () => void runtime.stop());
```

- [ ] Register `LiftSecureDatabase`, unit of work, repositories, effective-date provider, event dispatcher and local runtime in TSyringe. Keep tokens declared in Application-facing terms; tokens must not be imported by Domain/Application classes.
- [ ] Show `WorkspaceSetupScreen` when there is no local workspace. At this gate it can create an offline-only workspace only under `import.meta.env.MODE === "test"`; normal users proceed to Matrix server setup implemented at Gate B. Once a workspace exists, the entire task UI works with no network target.
- [ ] Delete the listed legacy files, remove `@supabase/supabase-js`, remove Supabase strings from i18n and settings, and rewrite—not skip—the tests that represented useful task behavior.
- [ ] Run `npm run verify` and `npm run test:e2e -- tests/secure-clean-start.spec.ts`; expect pass. Record any unrelated pre-existing failing test as a bug and fix it before continuing.
- [ ] Commit: `refactor: boot exclusively from LiftSecureDatabase`

#### Gate A evidence

- [ ] Run a property suite with shuffled concurrent changes and confirm identical heads/projection.
- [ ] Run an offline browser test and confirm immediate local CRUD with durable outbox after reload.
- [ ] Advance the effective date and confirm zero day-transition changes and preserved history.
- [ ] Run `npm run verify` with zero failures before starting Matrix work.

---

## Review Gate B — real Synapse, Matrix E2EE and realtime delivery

### Task 11: Supply two durable local Synapse/PostgreSQL stacks

**Files:**

- Create: `infra/matrix/docker-compose.yml`
- Create: `infra/matrix/primary/homeserver.yaml`
- Create: `infra/matrix/primary/log.config`
- Create: `infra/matrix/primary/signing.key`
- Create: `infra/matrix/secondary/homeserver.yaml`
- Create: `infra/matrix/secondary/log.config`
- Create: `infra/matrix/secondary/signing.key`
- Create: `infra/matrix/README.md`
- Create: `scripts/matrix/provision.mjs`
- Create: `scripts/matrix/health.mjs`
- Create: `src/test/architecture/matrixCompose.test.ts`
- Modify: `package.json`

**Produces:** primary `http://127.0.0.1:8008` and migration `http://127.0.0.1:8009`, both with persistent PostgreSQL.
**Consumes:** Docker Desktop/Compose.

- [ ] Write a failing architecture test that runs `docker compose -f infra/matrix/docker-compose.yml config`, parses the rendered text, and asserts pinned `matrixdotorg/synapse:v1.157.0`, `postgres:18.4-alpine3.24`, loopback-only published ports, named volumes, health checks and restart policies.
- [ ] Use an actual process assertion, so malformed Compose is a test failure rather than a string-only check:

```ts
import { execFileSync } from "node:child_process";

it("renders a pinned loopback-only durable Matrix stack", () => {
  const rendered = execFileSync(
    "docker",
    ["compose", "-f", "infra/matrix/docker-compose.yml", "config"],
    { encoding: "utf8" }
  );
  expect(rendered).toContain("matrixdotorg/synapse:v1.157.0");
  expect(rendered).toContain("postgres:18.4-alpine3.24");
  expect(rendered).toContain("127.0.0.1:8008");
  expect(rendered).not.toMatch(/0\.0\.0\.0:800[89]/);
  expect(rendered).toMatch(/restart: unless-stopped/g);
  expect(rendered).toContain("primary-postgres:");
});
```

- [ ] Run the focused test; expect failure because Compose does not exist.
- [ ] Add Compose with primary services enabled normally and secondary services behind profile `migration`. Use this service shape for both stacks:

```yaml
services:
  primary-db:
    image: postgres:18.4-alpine3.24
    environment:
      POSTGRES_DB: synapse
      POSTGRES_USER: synapse
      POSTGRES_PASSWORD: lift-primary-postgres-dev
    volumes:
      - primary-postgres:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U synapse -d synapse"]
      interval: 2s
      timeout: 2s
      retries: 30
    restart: unless-stopped

  primary-synapse:
    image: matrixdotorg/synapse:v1.157.0
    environment:
      SYNAPSE_CONFIG_PATH: /config/homeserver.yaml
    ports:
      - "127.0.0.1:8008:8008"
    volumes:
      - ./primary:/config:ro
      - primary-synapse:/data
    depends_on:
      primary-db:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "python",
          "-c",
          "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8008/_matrix/client/versions')",
        ]
      interval: 3s
      timeout: 3s
      retries: 40
    restart: unless-stopped
```

- [ ] Configure primary server name `primary.localhost`, secondary `secondary.localhost`, PostgreSQL `psycopg2`, client-only HTTP listener, `report_stats: false`, no public rooms/federation, `enable_registration: false`, fixed local-test registration shared secrets and `signing_key_path: /config/signing.key`. Generate two distinct keys once with the pinned Synapse image and commit them under the exact paths above as explicitly disposable development-only keys. Never reuse them outside local development.
- [ ] Implement shared-secret registration in `provision.mjs` with Synapse's nonce/HMAC flow:

```js
async function register(
  baseUrl,
  sharedSecret,
  username,
  password,
  admin = false
) {
  const { nonce } = await fetch(`${baseUrl}/_synapse/admin/v1/register`).then(
    (r) => r.json()
  );
  const mac = createHmac("sha1", sharedSecret)
    .update(
      [nonce, username, password, admin ? "admin" : "notadmin"].join("\0")
    )
    .digest("hex");
  const response = await fetch(`${baseUrl}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce,
      username,
      password,
      admin,
      mac,
      displayname: username,
    }),
  });
  if (!response.ok && response.status !== 400)
    throw new Error(await response.text());
}
```

- [ ] Provision `alice`, `bob`, `viewer` on both servers with deterministic local-test passwords. Treat `M_USER_IN_USE` as success so the command is idempotent.
- [ ] Add scripts `matrix:up`, `matrix:up:all`, `matrix:down`, `matrix:health`, `matrix:provision`. `matrix:down` must not add `--volumes`; durability tests depend on retained data. Add a separately named `matrix:destroy-test-data` command only if it validates the exact Compose project before deleting volumes.
- [ ] Run `npm run matrix:up`, `npm run matrix:health`, `npm run matrix:provision`; expect healthy primary. Run with profile `migration`; expect both healthy. Restart both Synapse and DB containers and verify accounts still log in.
- [ ] Run the focused architecture test; expect pass.
- [ ] Commit: `infra(matrix): add durable local Synapse stacks`

### Task 12: Persist and validate arbitrary Matrix server profiles safely

**Files:**

- Create: `src/features/workspaces/domain/ServerProfile.ts`
- Create: `src/features/workspaces/application/ports/ServerProfileRepository.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieServerProfileRepository.ts`
- Create: `src/features/workspaces/infrastructure/crypto/LocalKeyVault.ts`
- Create: `src/features/workspaces/infrastructure/matrix/BrowserMatrixClientLease.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixEventStoreFactory.ts`
- Create: `src/features/workspaces/domain/__tests__/ServerProfile.test.ts`
- Create: `src/features/workspaces/infrastructure/crypto/__tests__/LocalKeyVault.integration.test.ts`
- Create: `src/features/workspaces/infrastructure/matrix/__tests__/BrowserMatrixClientLease.test.ts`

**Produces:** any number of safe server profiles, encrypted local crypto-store keys and single-owner SDK namespaces.
**Consumes:** secure DB `serverProfiles`/`localSecrets`, Web Crypto, Web Locks.

- [ ] Write failing URL-policy tests: accept `http://localhost:8008`, `http://127.0.0.1:8008`, `http://127.42.0.1`, `http://[::1]:8008`, and HTTPS; reject credentials, fragments, non-loopback HTTP, `file:`, ambiguous decimal/octal IP forms and URLs whose normalized hostname is not loopback.
- [ ] Run `npx vitest --run src/features/workspaces/domain/__tests__/ServerProfile.test.ts src/features/workspaces/infrastructure/crypto/__tests__/LocalKeyVault.integration.test.ts src/features/workspaces/infrastructure/matrix/__tests__/BrowserMatrixClientLease.test.ts`; expect missing-module failures.
- [ ] Implement `ServerProfile.create({ id, name, baseUrl })` with `URL`, normalized origin, no path/query/fragment, and exact loopback checks. Never trust string prefix matching such as `startsWith("http://localhost")`. The HTTP predicate is:

```ts
function isCanonicalLoopbackHttp(input: string, url: URL): boolean {
  if (url.protocol !== "http:") return false;
  const authority = input.match(/^http:\/\/([^/?#]+)/i)?.[1] ?? "";
  if (authority.includes("@")) return false;
  const rawHost = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1).toLowerCase()
    : authority.split(":", 1)[0].toLowerCase();
  if (rawHost === "localhost" || rawHost === "[::1]") return true;
  const octets = rawHost.split(".");
  if (
    octets.length !== 4 ||
    octets.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))
  )
    return false;
  const numbers = octets.map(Number);
  return (
    numbers[0] === 127 &&
    numbers.every((value) => value >= 0 && value <= 255) &&
    url.hostname === rawHost
  );
}
```

- [ ] Implement `DexieServerProfileRepository` CRUD and active target selection per workspace; deleting a profile referenced by an active/read-only target must fail until the target is detached explicitly.
- [ ] Implement `LocalKeyVault`: store a non-extractable AES-GCM wrapping `CryptoKey` by structured clone in `localSecrets`; generate a random 32-byte Matrix Rust crypto storage key; persist only its AES-GCM ciphertext/IV. Wrap Matrix access tokens with the same vault and store only ciphertext/IV in profile sessions. Return the same decrypted values after reload and distinct crypto keys for distinct profile/user/device tuples.
- [ ] Implement `BrowserMatrixClientLease` by calling `navigator.locks.request` with name `"lift:matrix:" + cryptoDatabasePrefix`, options `{ ifAvailable: true, mode: "exclusive" }`, and a callback that awaits an internal release promise. A second tab receives `null` and must show read-only/close-other-tab state; it must never initialize Rust crypto on the same prefix.
- [ ] Define namespaces exactly as `lift-matrix-crypto:${profileId}:${encodeURIComponent(userId)}:${deviceId}` and `lift-matrix-events:${profileId}:${encodeURIComponent(userId)}:${deviceId}`. `MatrixEventStoreFactory` returns an SDK `IndexedDBStore` with the latter DB name. Test that two server profiles and two device IDs never collide.
- [ ] Run focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(workspaces): add safe Matrix server profiles`

### Task 13: Implement Matrix login, Rust crypto bootstrap and recovery

**Files:**

- Create: `src/features/workspaces/application/ports/MatrixSession.ts`
- Create: `src/features/workspaces/application/ports/DeviceTrustService.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixSessionManager.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixDeviceTrustService.ts`
- Create: `src/features/workspaces/infrastructure/matrix/SecretStorageKeyCache.ts`
- Create: `src/features/workspaces/infrastructure/matrix/__tests__/MatrixSessionManager.test.ts`
- Create: `src/features/workspaces/presentation/view-models/MatrixSetupViewModel.ts`
- Create: `src/features/workspaces/presentation/components/MatrixSetupWizard.tsx`
- Modify: `src/features/workspaces/presentation/components/WorkspaceSetupScreen.tsx`

**Produces:** distinct Matrix devices, cross-signing, signed-device isolation, high-entropy recovery and encrypted key backup.
**Consumes:** server profile, local key vault/lease, `matrix-js-sdk` 42.0.0.

- [ ] Write an SDK-mocked test that asserts exact ordering: password login → acquire lease → `initRustCrypto` with unique prefix/storage key → `OnlySignedDevicesIsolationMode` → `startClient`/PREPARED → cross-signing → secret storage with new backup → recovery acknowledgement. Assert no workspace can be created before acknowledgement.
- [ ] Record the order in the fake and assert the security-critical suffix exactly:

```ts
expect(calls).toEqual([
  "login",
  "lease",
  "event-store-startup",
  "rust-crypto",
  "signed-device-isolation",
  "start-client",
  "prepared",
  "cross-signing",
  "secret-storage-and-backup",
  "recovery-confirmed",
]);
expect(session.canCreateWorkspace()).toBe(true);
```

- [ ] Run `npx vitest --run src/features/workspaces/infrastructure/matrix/__tests__/MatrixSessionManager.test.ts`; expect missing implementation.
- [ ] Implement password login with `loginRequest({ type: "m.login.password", identifier: { type: "m.id.user", user }, password, initial_device_display_name, refresh_token: true })`. Persist `user_id`, `device_id` and only `LocalKeyVault`-wrapped access/refresh-token ciphertext/IV; never persist clear tokens or log either form. Pass the recovered refresh token and a `tokenRefreshFunction` to `createClient`; atomically re-wrap/store both tokens after every refresh. Registration may call Matrix registration when the selected server advertises it, but local tests use pre-provisioned accounts.
- [ ] Build the authenticated client and crypto exactly around the audited API:

```ts
const eventStore = matrixEventStoreFactory.create(eventStoreDatabaseName);
const client = createClient({
  baseUrl: profile.baseUrl,
  accessToken: session.accessToken,
  userId: session.userId,
  deviceId: session.deviceId,
  store: eventStore,
  timelineSupport: true,
  verificationMethods: [
    VerificationMethod.Sas,
    VerificationMethod.ShowQrCode,
    VerificationMethod.ScanQrCode,
  ],
  cryptoCallbacks: secretStorageKeyCache.callbacks,
});
await eventStore.startup();
await client.initRustCrypto({
  useIndexedDB: true,
  cryptoDatabasePrefix,
  storageKey: await localKeyVault.getOrCreateCryptoStorageKey(sessionKey),
});
const matrixCrypto = client.getCrypto();
if (!matrixCrypto) throw new Error("Matrix Rust crypto did not initialize");
matrixCrypto.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
matrixCrypto.globalBlacklistUnverifiedDevices = true;
await client.startClient({ initialSyncLimit: 20 });
await waitForMatrixPrepared(client);
```

- [ ] For the first device, call `bootstrapCrossSigning` with UIA callback, then `createRecoveryKeyFromPassphrase()` with no passphrase, then `bootstrapSecretStorage({ setupNewSecretStorage: true, setupNewKeyBackup: true, createSecretStorageKey: async () => generated })`. Display only `encodedPrivateKey`, keep the raw key only in an in-memory cache, and require the user to re-enter a random requested group before marking recovery acknowledged.
- [ ] For recovery on a new device, decode the entered key with `decodeRecoveryKey`, return `[defaultKeyId, key]` from `getSecretStorageKey`, call `bootstrapCrossSigning({})`, `loadSessionBackupPrivateKeyFromSecretStorage()`, `checkKeyBackupAndEnable()`, then `restoreKeyBackup()`. Wrong keys must fail without replacing existing secret storage.
- [ ] Expose explicit states: `signed-out`, `initializing-crypto`, `recovery-key-required`, `recovery-confirmation`, `waiting-verification`, `recovering-keys`, `ready`, `error`. Password reset alone must never claim recovery.
- [ ] Add component tests that no secret/access token appears in rendered errors, logs or Zustand dev state after setup.
- [ ] Run focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(matrix): bootstrap verified devices and recovery`

### Task 14: Create encrypted workspace rooms and the initial ACL chain

**Files:**

- Create: `src/features/workspaces/domain/WorkspaceAcl.ts`
- Create: `src/features/workspaces/domain/AclTransitionPolicy.ts`
- Create: `src/features/workspaces/application/use-cases/CreateWorkspaceUseCase.ts`
- Create: `src/features/workspaces/infrastructure/acl/CanonicalAclCodec.ts`
- Create: `src/features/workspaces/infrastructure/acl/AclChainValidator.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixWorkspaceRoom.ts`
- Create: `src/features/workspaces/domain/__tests__/AclTransitionPolicy.test.ts`
- Create: `src/features/workspaces/infrastructure/acl/__tests__/AclChainValidator.test.ts`
- Create: `src/features/workspaces/infrastructure/matrix/__tests__/MatrixWorkspaceRoom.test.ts`

**Produces:** one private encrypted room per workspace and a validated Owner epoch 1.
**Consumes:** ready Matrix session, role policy, current Automerge heads.

- [ ] Define `WorkspaceAclCheckpoint` with `workspaceId`, `authEpoch`, `previousHash`, `members`, `revokedUsers`, `revokedDevices`, `acceptedHeads`, and sender `{ userId, deviceId, ed25519Key, curve25519Key }`. Canonical encoding recursively sorts object keys and arrays whose order is semantic-set order; hash exact UTF-8 canonical bytes with SHA-256.
- [ ] Write failing tests for: epoch must increment by one; previous hash must match; Owner-only ownership transfer; Admin cannot assign Admin/Owner; last Owner protection; revocations only grow; accepted heads cannot omit previously accepted causal heads; hash changes on any field.
- [ ] Include this tamper criterion:

```ts
const encoded = codec.encode(checkpoint);
const altered = codec.encode({
  ...checkpoint,
  authEpoch: checkpoint.authEpoch + 1,
});
expect(await codec.hash(encoded)).not.toBe(await codec.hash(altered));
await expect(
  validator.accept({ ...checkpoint, previousHash: "00".repeat(32) })
).rejects.toThrow("previous ACL hash");
```

- [ ] Run `npx vitest --run src/features/workspaces/domain/__tests__/AclTransitionPolicy.test.ts src/features/workspaces/infrastructure/acl/__tests__/AclChainValidator.test.ts src/features/workspaces/infrastructure/matrix/__tests__/MatrixWorkspaceRoom.test.ts`; expect missing implementations.
- [ ] Implement room creation with opaque/random name and no Lift title in room state:

```ts
const { room_id: roomId } = await client.createRoom({
  visibility: Visibility.Private,
  preset: Preset.PrivateChat,
  room_version: "12",
  power_level_content_override: {
    users: { [ownerUserId]: 100 },
    users_default: 0,
    events_default: 50,
    state_default: 75,
    invite: 75,
    kick: 75,
    ban: 75,
    redact: 75,
    events: { "m.room.power_levels": 75, "m.room.encryption": 100 },
  },
  initial_state: [
    {
      type: EventType.RoomEncryption,
      state_key: "",
      content: {
        algorithm: "m.megolm.v1.aes-sha2",
        rotation_period_ms: 86_400_000,
        rotation_period_msgs: 100,
      },
    },
  ],
});
```

- [ ] Publish epoch-1 ACL as encrypted inner type `dev.lift.acl.v1`, read it back, decrypt and validate it, then publish `dev.lift.acl.head.v1` state containing only its hash/epoch. Persist target/ACL as active only after read-back validation. If any step fails, leave the room detached and retryable.
- [ ] Assert the room timeline wire event is `m.room.encrypted`; raw room state/timeline must not contain workspace settings or the chosen E2EE probe title.
- [ ] Run focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(matrix): create encrypted workspace room and ACL root`

### Task 15: Deliver the durable outbox with deterministic Matrix transaction IDs

**Files:**

- Create: `src/features/workspaces/application/ports/SyncOutbox.ts`
- Create: `src/features/workspaces/application/ports/EncryptedTransport.ts`
- Create: `src/features/workspaces/application/use-cases/ProcessOutboxUseCase.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieSyncOutbox.ts`
- Create: `src/features/workspaces/infrastructure/matrix/LiftEnvelope.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixEncryptedTransport.ts`
- Create: `src/features/workspaces/infrastructure/sync/PayloadFragmenter.ts`
- Create: `src/features/workspaces/infrastructure/sync/RetryPolicy.ts`
- Create: `src/features/workspaces/infrastructure/sync/OutboxWorker.ts`
- Create: `src/features/workspaces/infrastructure/sync/__tests__/OutboxWorker.integration.test.ts`

**Produces:** restart-safe, at-least-once encrypted delivery and stable event IDs after lost ACKs.
**Consumes:** active target, current ACL/device trust, binary local change rows.

- [ ] Define Zod schemas for versioned inner envelopes. Binary values use unpadded base64url; the plaintext envelope exists only in verified endpoints and is handed to Matrix for room encryption:

```ts
const changeEnvelopeV1 = z.object({
  type: z.literal("dev.lift.crdt.change.v1"),
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  authEpoch: z.number().int().positive(),
  changeHash: z.string().regex(/^[0-9a-f]{64}$/),
  dependencies: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
  payload: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("inline"),
      bytes: z.string().regex(/^[A-Za-z0-9_-]+$/),
    }),
    z.object({
      mode: z.literal("fragment"),
      transferId: z.string().regex(/^[0-9a-f]{64}$/),
      index: z.number().int().nonnegative(),
      count: z.number().int().positive().max(4096),
      fragmentHash: z.string().regex(/^[0-9a-f]{64}$/),
      bytes: z.string().regex(/^[A-Za-z0-9_-]+$/),
    }),
  ]),
});
```

- [ ] Write a failing worker integration test where `send` accepts once but throws a simulated connection reset before returning; restart the worker, assert the same transaction ID is reused and the outbox ends acknowledged with one logical change.
- [ ] Assert deterministic retry at the transport boundary:

```ts
await worker.runOnce();
await worker.runOnce();
expect(transport.transactionIds).toEqual([
  `lift.c1.${changeHash}.0`,
  `lift.c1.${changeHash}.0`,
]);
expect(transport.acceptedLogicalHashes).toEqual([changeHash]);
expect((await outbox.get(rowId))?.state).toBe("acknowledged");
```

- [ ] Run `npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/sync/__tests__/OutboxWorker.integration.test.ts`; expect missing implementation.
- [ ] Split binary changes at 32,768 raw bytes. Derive transfer ID from the full change hash, hash every fragment, persist fragments before sending, and use transaction ID `lift.c1.${changeHash}.${index}` (index zero for inline). Resume from `nextFragmentIndex` after restart; acknowledge the logical outbox row only after every deterministic fragment send returns an event ID. Before every batch, refresh membership/device/ACL head; do not send ordinary changes until control-plane events are current. Re-envelope an authorized pending change at current `authEpoch` without changing binary bytes/hash.
- [ ] Implement send through `client.sendEvent(roomId, "dev.lift.crdt.change.v1", content, transactionId)`. Keep the unavoidable custom-event typing cast inside `MatrixEncryptedTransport`; no caller sees Matrix types. Store returned `event_id` atomically on the outbox row.
- [ ] Implement exponential backoff as `min(300_000, 1_000 * 2 ** min(attempt, 8))` with injected full jitter. Network/5xx/rate-limit errors retry forever; authentication, schema, revoked-device and role errors change state to actionable pause and never discard data.
- [ ] Start worker after local commit, online event, Matrix sync PREPARED and app restart. `navigator.onLine` may wake it but never defines synced state.
- [ ] Run focused integration tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(sync): deliver durable encrypted outbox`

### Task 16: Persist, decrypt, authorize, validate and atomically apply the inbox

**Files:**

- Create: `src/features/workspaces/application/ports/SyncInbox.ts`
- Create: `src/features/workspaces/application/use-cases/ProcessInboxUseCase.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieSyncInbox.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixEventTrust.ts`
- Create: `src/features/workspaces/infrastructure/matrix/MatrixRoomCatchup.ts`
- Create: `src/features/workspaces/infrastructure/sync/InboxWorker.ts`
- Create: `src/features/workspaces/infrastructure/sync/__tests__/InboxWorker.integration.test.ts`
- Create: `src/features/workspaces/infrastructure/sync/__tests__/InboxQuarantine.test.ts`

**Produces:** durable realtime receive path, logical exactly-once apply, key/dependency waits and explicit quarantine.
**Consumes:** raw Matrix events, ACL validator, unit of work.

- [ ] Extend inbox state with `waiting-dependencies`. Change missing ordinary dependencies to this retryable state; reserve quarantine reason `impossible-dependencies` for invalid/self/cyclic or permanently contradicted dependency data.
- [ ] Write a failing crash test: persist raw event, throw after decrypt but before apply, reopen DB and restart worker, then assert one applied change and handled inbox. Add duplicate event ID and different-event/same-change-hash cases.
- [ ] Run `npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/sync/__tests__/InboxWorker.integration.test.ts src/features/workspaces/infrastructure/sync/__tests__/InboxQuarantine.test.ts`; expect missing implementation.
- [ ] Drive the red/green exactly-once assertion with two Matrix event IDs carrying the same change:

```ts
await inbox.persist(wireEvent("$first", encryptedEnvelope));
await inbox.persist(wireEvent("$duplicate", encryptedEnvelope));
await worker.drain();
expect(
  await db.workspaceChanges.where({ workspaceId, changeHash }).count()
).toBe(1);
expect(await db.matrixEventIndex.bulkGet(["$first", "$duplicate"])).toEqual([
  expect.objectContaining({ changeHash }),
  expect.objectContaining({ changeHash }),
]);
```

- [ ] Listen at the earliest Matrix event callback. Before awaiting decryption, serialize the original `event.event` wire object and `getWireContent()` into `syncInbox`. Reconstruct with `new MatrixEvent(JSON.parse(wireEvent))` after restart and call `client.decryptEventIfNeeded(event)`.
- [ ] On startup and reconnect, run `MatrixRoomCatchup` before declaring live: page `/messages` backward from the current room token until a known indexed event or verified checkpoint boundary, persist every unseen encrypted application event, then attach realtime processing. This closes the crash window even if the SDK sync token advanced before an asynchronous listener completed.
- [ ] Require all of:
  1. expected room/target;
  2. wire event encrypted;
  3. successful Rust-crypto decryption;
  4. `OnlySignedDevicesIsolationMode` acceptance and `getEncryptionInfoForEvent(event).shieldColour === EventShieldColour.NONE`;
  5. sender curve/claimed Ed25519 key mapped to a currently cross-signed device;
  6. sender role authorized at the bound ACL epoch;
  7. schema/workspace/hash/dependency validation.
- [ ] For fragments, persist each trusted decoded fragment in `payloadFragments`, verify its fragment hash/count/index consistency, and remain pending until all indexes exist. Reassemble in numeric order, verify the full change hash, delete the assembly only after successful apply, then run `Automerge.decodeChange`, require decoded hash and dependencies to match the envelope, and call `WorkspaceUnitOfWork.applyRemote` in the same transaction that writes all `matrixEventIndex` rows and marks fragment inbox rows handled.
- [ ] Missing Megolm keys remain `waiting-keys` and trigger backup/key request; out-of-order valid changes remain `waiting-dependencies`; wrong room, unverified device, unauthorized role, malformed schema, mismatched hash and rollback/fork events go to `quarantine` with reason/detail and never mutate the document.
- [ ] Keep the worker orchestration explicit and side-effect ordered:

```ts
async process(record: SyncInboxRecord): Promise<void> {
  const event = new MatrixEvent(JSON.parse(record.wireEvent));
  await this.matrix.decryptEventIfNeeded(event);
  const trusted = await this.trust.requireVerifiedSender(event, record.roomId);
  const envelope = liftEnvelopeV1.parse(event.getClearContent());
  await this.acl.requireAuthorized(envelope.workspaceId, envelope.authEpoch, trusted, envelope.type);
  const assembled = await this.fragments.accept(envelope, record.eventId);
  if (!assembled) return;
  const decoded = Automerge.decodeChange(assembled.bytes);
  if (decoded.hash !== assembled.changeHash) throw new QuarantineError("hash-mismatch");
  await this.unitOfWork.applyRemote({ record, envelope: assembled, sender: trusted });
}
```

- [ ] Run focused tests with every validation failure and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(sync): validate and atomically apply encrypted inbox`

### Task 17: Prove realtime E2EE between two independent browser devices

**Files:**

- Create: `playwright.matrix.config.ts`
- Create: `tests/matrix/global-setup.ts`
- Create: `tests/matrix/fixtures/twoDevices.ts`
- Create: `tests/matrix/two-device-realtime.spec.ts`
- Create: `tests/matrix/wire-encryption.spec.ts`
- Modify: `package.json`

**Produces:** the first end-to-end evidence against real Synapse/PostgreSQL.
**Consumes:** Tasks 11–16 and the real app UI.

- [ ] Configure a separate Playwright project that requires healthy primary Synapse, idempotently provisions users, starts Vite, and uses two new browser contexts with distinct IndexedDB/storage and distinct Matrix `device_id` values. Never copy a storage state between contexts.
- [ ] Write the failing scenario: Device A logs in as Alice, creates workspace/recovery key; Device B logs into the same account as a new device; verify B via recovery key (and later via SAS); A creates a uniquely named task; B observes it without reload; B edits note; A observes it; assert sorted Automerge heads through a test-only read API are equal.
- [ ] Run `npm run test:e2e:matrix -- tests/matrix/two-device-realtime.spec.ts tests/matrix/wire-encryption.spec.ts`; expect failure before the realtime fixture/transport is complete.
- [ ] Use only visible UI for the mutation path; the test driver is read-only evidence:

```ts
await deviceA.getByRole("button", { name: "Новая задача" }).click();
await deviceA.getByLabel("Название").fill(marker);
await deviceA.getByRole("button", { name: "Создать" }).click();
await expect(deviceB.getByText(marker)).toBeVisible();
await deviceB.getByRole("button", { name: `Редактировать ${marker}` }).click();
await deviceB.getByLabel("Заметка").fill("edited on device B");
await expect(deviceA.getByText("edited on device B")).toBeVisible();
expect(await heads(deviceA)).toEqual(await heads(deviceB));
```

- [ ] Add a wire test that calls Matrix `/messages` with Alice's token and asserts application events have wire type `m.room.encrypted`, algorithm/ciphertext/session fields, and no unique title/note/workspace settings. The test-only API may expose heads/counts but must never bypass actual use cases or transport.
- [ ] Add `test:e2e:matrix` and `test:e2e:matrix:headed` scripts. Time out with a diagnostic dump of sync status, inbox/outbox rows and Matrix sync state, redacting tokens and clear payloads.
- [ ] Run `npm run test:e2e:matrix -- tests/matrix/two-device-realtime.spec.ts tests/matrix/wire-encryption.spec.ts`; expect pass repeatedly three times.
- [ ] Commit: `test(sync): prove realtime E2EE on two devices`

#### Gate B evidence

- [ ] Stop/start the primary Synapse container and its PostgreSQL container; rerun the realtime test without deleting volumes.
- [ ] Inspect one raw Matrix timeline response and confirm Lift content appears only after endpoint decryption.
- [ ] Confirm both contexts report distinct Matrix device IDs and crypto database prefixes.
- [ ] Run `npm run verify` and the Gate B E2E tests with zero failures.

---

## Review Gate C — durable events, roles, device trust, recovery and checkpoints

### Task 18: Restore durable post-commit domain-event guarantees

**Files:**

- Create: `src/features/workspaces/application/ports/DomainEventStore.ts`
- Create: `src/features/workspaces/application/services/DurableDomainEventDispatcher.ts`
- Create: `src/features/workspaces/infrastructure/database/DexieDomainEventStore.ts`
- Create: `src/features/workspaces/application/services/__tests__/DurableDomainEventDispatcher.test.ts`
- Modify: `src/features/workspaces/infrastructure/database/records.ts`
- Modify: `src/features/workspaces/infrastructure/database/LiftSecureDatabase.ts`
- Modify: `src/features/workspaces/infrastructure/database/DexieWorkspaceUnitOfWork.ts`

**Produces:** at-least-once, aggregate-ordered, post-commit, idempotent local event processing with retry/dead-letter.
**Consumes:** domain events written atomically in Task 7.

- [ ] Add `aggregateSequence`, `status: pending|processing|done|dead`, `attemptCount`, `nextAttemptAt`, `leaseUntil`, `lastError` to `DomainEventRecord` and index `[aggregateId+aggregateSequence]`. Because this implementation has not shipped and must stay clean-slate, edit schema version 1; do not add a migration from a development DB.
- [ ] Write failing tests for: no handler before source transaction commit; ordered events within one aggregate; different aggregates may progress independently; crash after handler side effect causes redelivery; handled-event marker makes handler idempotent; exponential retry; terminal dead-letter after the configured maximum for non-sync domain events.
- [ ] Run `npx vitest --run src/features/workspaces/application/services/__tests__/DurableDomainEventDispatcher.test.ts`; expect missing implementation.
- [ ] Include a crash/redelivery test with an idempotent handler ID:

```ts
await dispatcher
  .dispatchOnce({ crashAfterHandler: true })
  .catch(() => undefined);
await dispatcher.dispatchOnce();
expect(handler.callsFor(event.id)).toBe(2);
expect(await store.hasHandled(event.id, handler.id)).toBe(true);
expect(await sideEffects.countByIdempotencyKey(event.id)).toBe(1);
```

- [ ] Implement dispatcher claiming with a short renewable lease. It may process an aggregate's lowest unfinished sequence only. A stale `processing` lease returns to pending. Record `[eventId+handlerId]` in the same DB transaction as a handler's local side effect wherever possible; otherwise require the handler's external idempotency key to be the event ID.
- [ ] Start dispatch only after `WorkspaceUnitOfWork.commit` resolves. Event dispatch failure must never roll back the already committed user mutation.
- [ ] Surface dead-letter count in sync diagnostics; never silently delete dead records.
- [ ] The claim loop must always release state through the store:

```ts
const event = await store.claimNext(clock.now());
if (!event) return;
try {
  for (const handler of handlers.for(event.type)) {
    if (!(await store.hasHandled(event.id, handler.id)))
      await handler.handle(event);
    await store.markHandled(event.id, handler.id);
  }
  await store.markDone(event.id);
} catch (error) {
  await store.retryOrDeadLetter(event.id, redactError(error), clock.now());
  throw error;
}
```

- [ ] Run focused tests and `npm run typecheck`; expect pass.
- [ ] Commit: `feat(events): dispatch durable domain events post-commit`

### Task 19: Implement role changes, membership and strict revocation

**Files:**

- Create: `src/features/workspaces/application/use-cases/InviteWorkspaceMemberUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/ChangeWorkspaceRoleUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/TransferWorkspaceOwnershipUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/RemoveWorkspaceMemberUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/RevokeWorkspaceDeviceUseCase.ts`
- Create: `src/features/workspaces/infrastructure/acl/AclControlPlane.ts`
- Create: `src/features/workspaces/infrastructure/acl/__tests__/AclControlPlane.integration.test.ts`
- Create: `tests/matrix/roles-and-revocation.spec.ts`

**Produces:** Owner/Admin/Editor/Viewer enforcement and post-revocation forward security.
**Consumes:** encrypted ACL chain, Matrix power levels/membership, current Automerge heads.

- [ ] Write failing application tests for every capability in the approved role table and real E2E cases: Viewer cannot send, Editor cannot alter ACL, Admin can assign Editor/Viewer but not Admin/Owner, Owner can transfer, last Owner cannot demote/remove itself.
- [ ] Run the new application tests and `npm run test:e2e:matrix -- tests/matrix/roles-and-revocation.spec.ts`; expect failures before ACL control-plane mutations exist.
- [ ] Make the post-revocation assertion observable on both sides:

```ts
await bob.context.setOffline(true);
await bob.createTask("offline and revoked");
await alice.revokeDevice(bob.deviceId);
await bob.context.setOffline(false);
await expect.poll(() => bob.syncState()).toBe("authorization-paused");
await expect(alice.page.getByText("offline and revoked")).toHaveCount(0);
expect(await bob.pendingOutbox()).toBeGreaterThan(0);
```

- [ ] Serialize each ACL mutation through the current `dev.lift.acl.head.v1`. Build candidate epoch `current + 1`, send encrypted checkpoint, read/decrypt/validate it, send the head state event, then read current state back. If another valid writer won, do not accept the local candidate; reload winner and retry the user's still-authorized intent.
- [ ] Keep Matrix power levels aligned: Owner 100, Admin 75, Editor 50, Viewer 0; `events_default: 50`, membership and state administration 75, power-level state 75. Treat disagreement between Matrix state and encrypted ACL as `authorization-paused`, with encrypted ACL controlling data acceptance and the UI offering Owner repair.
- [ ] For removal/revocation: capture accepted Automerge heads; publish/accept revocation ACL epoch; update Matrix membership/power levels; call `await client.getCrypto()!.forceDiscardSession(roomId)`; only then resume ordinary outbox sends. Revoked users/devices never leave the revoked grow-only sets.
- [ ] Keep the security ordering visible in `AclControlPlane`:

```ts
const accepted = await this.acl.publishAndAcceptRevocation(
  input,
  await this.workspace.heads(input.workspaceId)
);
await this.room.applyPowerLevelsAndMembership(accepted);
await this.matrix.getCryptoOrThrow().forceDiscardSession(input.roomId);
await this.outbox.resumeAuthorized(input.workspaceId, accepted.authEpoch);
```

- [ ] On every reconnect, process room membership, cross-signed device list and ACL head before outbox. If still Editor+, update only the envelope epoch/session. If Viewer/revoked, set local rows `paused-auth`, preserve them, and expose explicit JSON/Automerge-change export/review; never upload them.
- [ ] In E2E, let Bob edit while offline, revoke Bob from Alice, reconnect Bob, assert his unsent change stays local/paused and never reaches Alice. Then verify Bob cannot decrypt an event sent after forced session rotation. Also prove a pre-revocation change in the recorded causal closure remains accepted.
- [ ] Run focused tests and `npm run test:e2e:matrix -- tests/matrix/roles-and-revocation.spec.ts`; expect pass.
- [ ] Commit: `feat(acl): enforce roles and strict revocation`

### Task 20: Add interactive SAS/QR verification and robust key recovery UX

**Files:**

- Create: `src/features/workspaces/application/use-cases/VerifyOwnDeviceUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/RecoverMatrixKeysUseCase.ts`
- Create: `src/features/workspaces/presentation/view-models/DeviceVerificationViewModel.ts`
- Create: `src/features/workspaces/presentation/components/DeviceVerificationDialog.tsx`
- Create: `src/features/workspaces/presentation/components/RecoveryKeyDialog.tsx`
- Create: `src/features/workspaces/presentation/components/__tests__/DeviceVerificationDialog.test.tsx`
- Create: `tests/matrix/device-verification-and-recovery.spec.ts`

**Produces:** user-driven SAS/QR trust and recovery-key restoration without password-only bypass.
**Consumes:** `DeviceTrustService`, Matrix verification/recovery APIs.

- [ ] Write the component/E2E cases above first, then run `npx vitest --run src/features/workspaces/presentation/components/__tests__/DeviceVerificationDialog.test.tsx` and `npm run test:e2e:matrix -- tests/matrix/device-verification-and-recovery.spec.ts`; expect missing-flow failures.
- [ ] Test that user confirmation, not merely SAS display, gates completion:

```ts
await viewModel.startSas();
expect(viewModel.state.kind).toBe("show-sas");
expect(deviceTrust.isVerified).toBe(false);
await viewModel.confirmSas();
await expect.poll(() => viewModel.state.kind).toBe("verified");
expect(deviceTrust.isVerified).toBe(true);
```

- [ ] Model verification as a state machine from `requestOwnUserVerification()`: requested → accepted/ready → SAS or QR → user confirmation → done/cancelled/timeout. Persist no emoji/QR/recovery secret.
- [ ] For SAS, call `request.accept()`, `request.startVerification(VerificationMethod.Sas)`, `verifier.verify()`, display `getShowSasCallbacks().sas.emoji`/decimal, and only invoke the SDK confirmation callback after the user confirms both devices. Cancellation/timeout never marks trust.
- [ ] For QR, use `request.generateQRCode()` only in Ready state, or pass scanned bytes to `request.scanQRCode(bytes)` and await `verifier.verify()`. Encode QR bytes in the view layer only; clear them on close.
- [ ] Implement the SAS branch without auto-confirmation:

```ts
const request = await crypto.requestOwnUserVerification();
await request.accept();
const verifier = await request.startVerification(VerificationMethod.Sas);
const verification = verifier.verify();
const sas = await waitForSas(verifier);
this.setState({
  kind: "show-sas",
  emoji: sas.sas.emoji ?? [],
  decimal: sas.sas.decimal ?? null,
});
await this.userConfirmation.wait();
await sas.confirm();
await verification;
```

- [ ] After verification, require `getDeviceVerificationStatus(userId, deviceId)?.isVerified() === true` before sharing workspace history. Recovery flow must revalidate `isCrossSigningReady`, `isSecretStorageReady`, trusted backup and a successful checkpoint decrypt.
- [ ] E2E cases: unverified device cannot decrypt/apply; SAS-verified device receives history; correct recovery key restores a fresh device; one-character-wrong key fails and leaves server/device state unchanged; losing all devices and key displays irrecoverable warning rather than offering password reset.
- [ ] Run component tests and real E2E; expect pass.
- [ ] Commit: `feat(matrix): add device verification and recovery UX`

### Task 21: Publish, verify and compact encrypted checkpoints

**Files:**

- Create: `src/features/workspaces/application/ports/CheckpointStore.ts`
- Create: `src/features/workspaces/application/use-cases/CreateCheckpointUseCase.ts`
- Create: `src/features/workspaces/application/use-cases/RestoreCheckpointUseCase.ts`
- Create: `src/features/workspaces/infrastructure/checkpoint/CheckpointCodec.ts`
- Create: `src/features/workspaces/infrastructure/checkpoint/CheckpointCompactor.ts`
- Create: `src/features/workspaces/infrastructure/checkpoint/__tests__/CheckpointCodec.test.ts`
- Create: `src/features/workspaces/infrastructure/checkpoint/__tests__/CheckpointCompactor.integration.test.ts`
- Create: `tests/matrix/checkpoint-restore.spec.ts`

**Produces:** leaderless encrypted snapshot publication, safe restore and causal compaction.
**Consumes:** Automerge save/load/heads, fflate, Matrix read-back, current ACL.

- [ ] Define checkpoint V1 with `workspaceId`, schema 1, `authEpoch`, sorted heads, sorted covered change hashes and `gzipSync(snapshot)`. Hash canonical header plus compressed bytes with SHA-256. Reuse `PayloadFragmenter`; inline at 32,768 bytes or send deterministic fragments with transaction IDs `lift.cp1.${snapshotHash}.${index}` and the existing inner type `dev.lift.checkpoint.v1`.
- [ ] Write failing tests that reject corrupted compression/hash, wrong workspace/schema/epoch, missing covered head, a snapshot whose loaded heads differ from declared heads, an unauthorized author and a truncated snapshot attempting rollback.
- [ ] Run `npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/checkpoint/__tests__/CheckpointCodec.test.ts src/features/workspaces/infrastructure/checkpoint/__tests__/CheckpointCompactor.integration.test.ts`; expect missing implementations.
- [ ] Use exact-head rejection in the codec test:

```ts
const decoded = await codec.decodeAndVerify(eventFragments);
const restored = AutomergeWorkspaceDocument.load(decoded.snapshot, actorId);
expect([...restored.heads()].sort()).toEqual([...decoded.heads].sort());
await expect(codec.decodeAndVerify(tamper(eventFragments, 0))).rejects.toThrow(
  "checkpoint hash"
);
```

- [ ] Implement creation from a consistent DB read transaction. Any authorized verified client may create the same logical checkpoint; no lease/leader election is used. Send every encrypted `dev.lift.checkpoint.v1` fragment, fetch all events back, decrypt/reassemble/validate, load into a fresh Automerge instance and require exact sorted-head equality before recording it verified.
- [ ] Implement restore: choose the highest accepted ACL epoch and newest causally complete verified checkpoint (never server timestamp alone), load it, apply later accepted changes, and compare expected heads. A new device must not expose workspace UI until this completes or explicitly reports missing keys/data.
- [ ] Compact local `workspaceChanges` only if every removed hash is in the verified checkpoint coverage and no current head/dependency/outbox/inbox row references it. Projections may always rebuild. Keep at least the latest two verified checkpoint records for diagnostics.
- [ ] Make compaction fail closed:

```ts
const removable = candidates.filter((hash) =>
  checkpoint.coveredChangeHashes.includes(hash)
);
for (const hash of removable) {
  if (
    currentHeads.includes(hash) ||
    (await references.exists(workspaceId, hash))
  ) {
    throw new Error(`Checkpoint cannot compact referenced change ${hash}`);
  }
}
await changeStore.deleteCovered(workspaceId, removable);
```

- [ ] E2E: generate concurrent checkpoints from two devices, restore a third fresh profile, compare exact heads/state, inject a valid-but-truncated older checkpoint and prove no rollback.
- [ ] Run focused tests and E2E; expect pass.
- [ ] Commit: `feat(sync): add verified encrypted checkpoints`

### Task 22: Expose honest sync, trust, quarantine and conflict state

**Files:**

- Create: `src/features/workspaces/application/queries/GetSyncHealthQuery.ts`
- Create: `src/features/workspaces/application/use-cases/ResolveScalarConflictUseCase.ts`
- Create: `src/features/workspaces/presentation/view-models/SyncStatusViewModel.ts`
- Create: `src/features/workspaces/presentation/components/SyncStatusIndicator.tsx`
- Create: `src/features/workspaces/presentation/components/SyncDiagnostics.tsx`
- Create: `src/features/workspaces/presentation/components/ConflictReviewDialog.tsx`
- Create: `src/features/workspaces/presentation/components/__tests__/SyncStatusIndicator.test.tsx`
- Modify: `src/features/settings/presentation/components/Settings.tsx`
- Modify: `src/mvp/components/Header.tsx`
- Delete: `src/shared/presentation/components/SyncStatusIndicator.tsx`
- Delete: `src/shared/presentation/hooks/useSync.ts`
- Delete: `src/shared/presentation/hooks/useAuth.ts`
- Delete: obsolete tests for those old hooks/components

**Produces:** MVVM UI for offline/pending/verification/recovery/auth/quarantine/conflicts/server/device/access state.
**Consumes:** query/use-case ports only.

- [ ] Define `SyncHealth` as a discriminated union: `offline-usable`, `sending`, `receiving`, `synced`, `waiting-verification`, `waiting-keys`, `authorization-paused`, `quarantined`, `error`. Include outbox/inbox/quarantine/dead-letter counts and last acknowledged/applied event, but no clear task content.
- [ ] Compute `synced` only when all local outbox rows are acknowledged or explicitly paused, all received inbox rows are handled/quarantined, current ACL/device state is processed, and Matrix sync is live. `navigator.onLine` alone never yields synced.
- [ ] Centralize the predicate in the query:

```ts
if (snapshot.authorizationPaused)
  return { kind: "authorization-paused", ...snapshot.counts };
if (snapshot.waitingVerification)
  return { kind: "waiting-verification", ...snapshot.counts };
if (snapshot.waitingKeys > 0)
  return { kind: "waiting-keys", ...snapshot.counts };
if (snapshot.quarantine > 0) return { kind: "quarantined", ...snapshot.counts };
if (!snapshot.matrixLive) return { kind: "offline-usable", ...snapshot.counts };
if (snapshot.outboxPending > 0) return { kind: "sending", ...snapshot.counts };
if (snapshot.inboxPending > 0) return { kind: "receiving", ...snapshot.counts };
return { kind: "synced", ...snapshot.counts };
```

- [ ] Write component tests for every state and accessible text. Offline must say edits remain local and usable; authorization pause must explain unsent changes are preserved; quarantine must link diagnostics.
- [ ] Run `npx vitest --run src/features/workspaces/presentation/components/__tests__/SyncStatusIndicator.test.tsx`; expect missing component/ViewModel failures.
- [ ] Include the false-online guard:

```ts
render(<SyncStatusIndicator viewModel={viewModel({ matrixLive: true, outboxPending: 1, inboxPending: 0 })} />);
expect(screen.queryByText("Синхронизировано")).not.toBeInTheDocument();
expect(screen.getByText(/1 изменение ожидает отправки/)).toBeVisible();
```

- [ ] Implement conflict review from `conflictProjections`. Display canonical winner plus alternatives/op origins. User resolution emits a new ordinary command causally after observed alternatives; it never deletes Automerge history or edits the database directly.
- [ ] Replace Settings tabs with Servers, Devices & Recovery, Access, Sync diagnostics and local Appearance. Wire actions to ViewModel/use cases, not Matrix/Dexie.
- [ ] Run focused component/architecture tests; expect pass.
- [ ] Commit: `feat(workspaces): expose honest sync and trust status`

#### Gate C evidence

- [ ] Run three-user role tests and prove Matrix power levels plus encrypted ACL agree.
- [ ] Verify a second device through SAS, then restore a third with only the recovery key and checkpoint.
- [ ] Revoke a device, force rotation and prove it cannot decrypt future events or upload offline edits.
- [ ] Create/verify/restore checkpoints and prove a truncated checkpoint cannot roll back heads.
- [ ] Run `npm run verify` plus all Gate C Matrix E2E with zero failures.

---

## Review Gate D — server migration, fault injection and release evidence

### Task 23: Migrate a workspace between independently encrypted servers

**Files:**

- Create: `src/features/workspaces/domain/ServerMigration.ts`
- Create: `src/features/workspaces/application/use-cases/MigrateWorkspaceServerUseCase.ts`
- Create: `src/features/workspaces/infrastructure/migration/MatrixServerMigrationCoordinator.ts`
- Create: `src/features/workspaces/infrastructure/migration/__tests__/MatrixServerMigrationCoordinator.integration.test.ts`
- Create: `src/features/workspaces/presentation/view-models/ServerMigrationViewModel.ts`
- Create: `src/features/workspaces/presentation/components/ServerMigrationDialog.tsx`
- Create: `tests/matrix/server-migration.spec.ts`

**Produces:** verified two-phase migration with one active target and retained read-only source.
**Consumes:** both local stacks, target crypto session, ACL/checkpoint/outbox/inbox.

- [ ] Define `MigrationMemberMapping` from source Matrix user IDs to target Matrix user IDs. Require an explicit target mapping for every retained member because homeserver migration changes Matrix identities; never infer equality from username alone.
- [ ] Write a failing coordinator test for each phase and injected failure. Until exact fresh-document head equality succeeds, `syncTargets` must still show source `active` and target `preparing`.
- [ ] Run `npx vitest --run --config vitest.integration.config.ts src/features/workspaces/infrastructure/migration/__tests__/MatrixServerMigrationCoordinator.integration.test.ts`; expect missing implementation.
- [ ] Assert the fail-closed target switch:

```ts
await expect(
  coordinator.migrate(input, { failAfterTargetReadBack: true })
).rejects.toThrow();
expect((await targets.active(workspaceId)).serverProfileId).toBe(
  primaryProfileId
);
expect((await targets.byProfile(secondaryProfileId))?.mode).toBe("preparing");
```

- [ ] Implement the phases exactly:
  1. authenticate target profile and initialize its distinct verified crypto namespace;
  2. create target room v12/E2EE and mapped power levels/membership;
  3. publish a target ACL root that contains the source ACL hash/epoch and explicit member mapping, then publish/read-back a verified checkpoint plus all pending accepted changes;
  4. construct a fresh Automerge document only from target events, validate ACL/checkpoint/change hashes and compare sorted heads to the local source document;
  5. atomically mark target `active` and source `read-only` only on exact equality;
  6. keep source configured until explicit user removal.
- [ ] Publish a migration certificate hash into both rooms from the respective verified Owner sessions, binding workspace ID, source/target room IDs, source ACL hash, target ACL hash and heads. This gives devices with source history a cross-room audit trail without exposing roles or task data to either server.
- [ ] If source is unavailable, allow an Owner device with a complete verified local document and recovery material to seed target; label it `source-unreachable` and require the same target read-back/head check. If local heads are incomplete, block rather than pretending success.
- [ ] Switch targets only inside the final local transaction:

```ts
const targetHeads = [...freshTargetDocument.heads()].sort();
const sourceHeads = [...localSourceDocument.heads()].sort();
if (!equalStringArrays(targetHeads, sourceHeads))
  throw new Error("Target heads do not match source heads");
await database.transaction("rw", database.syncTargets, async () => {
  await database.syncTargets.update(sourceTargetId, { mode: "read-only" });
  await database.syncTargets.update(targetTargetId, { mode: "active" });
});
```

- [ ] E2E against ports 8008/8009: edit on source, migrate with Alice mappings, verify target heads, stop source, edit/realtime sync on target, restart source and prove it remains read-only. Inject target failure before read-back and prove source remains active.
- [ ] Run focused tests and `npm run test:e2e:matrix -- tests/matrix/server-migration.spec.ts`; expect pass.
- [ ] Commit: `feat(sync): add verified Matrix server migration`

### Task 24: Prove offline convergence and asynchronous-date behavior under partitions

**Files:**

- Create: `tests/matrix/offline-convergence.spec.ts`
- Create: `tests/matrix/offline-app-shell.spec.ts`
- Create: `tests/matrix/start-of-day-offline.spec.ts`
- Create: `src/features/workspaces/infrastructure/crdt/__tests__/WorkspaceConvergence.property.test.ts`
- Create: `src/test/TestClock.ts`
- Modify: `playwright.matrix.config.ts`

**Produces:** evidence that offline operation is complete and merge results are deterministic.
**Consumes:** two independent contexts and CRDT conflict rules.

- [ ] In two fully synced contexts, call `context.setOffline(true)` for both. Perform overlapping changes: distinct task creation, concurrent title/note text edits, tags add/remove, Today add/remove, category/defer/move conflicts, complete vs reopen and delete vs edit. Assert every local action renders immediately and survives a page reload from IndexedDB.
- [ ] Write the three E2E files/property test first and run them; expect failures on current offline merge/day behavior before fault coverage is implemented.
- [ ] The core partition test must use independent browser-network state:

```ts
await Promise.all([
  deviceA.context.setOffline(true),
  deviceB.context.setOffline(true),
]);
await Promise.all([deviceA.editTitle("A-left"), deviceB.editNote("B-right")]);
await Promise.all([deviceA.page.reload(), deviceB.page.reload()]);
await expect(deviceA.page.getByDisplayValue("A-left")).toBeVisible();
await expect(deviceB.page.getByDisplayValue("B-right")).toBeVisible();
await deviceA.context.setOffline(false);
await deviceB.context.setOffline(false);
await expect
  .poll(() => canonicalState(deviceA.page))
  .toEqual(await canonicalState(deviceB.page));
```

- [ ] Reconnect in A→B order, then repeat from a fresh workspace in B→A order. Assert exact sorted heads, canonical projected JSON and conflict alternatives match. Assert delete wins, concurrent complete wins, concurrent unobserved add survives remove, and ordering is stable.
- [ ] Add service-worker/offline app-shell coverage against a production `vite preview`: load once online, close network, reload, and use the existing local workspace. Do not count a merely open page as complete offline support.
- [ ] With all devices offline, advance injected clocks across workspace start-of-day. Assert no Matrix client is elected, no clear-day/undefer change is written, prior dated selections remain, the new Today view is empty/correct, deferred projection changes at boundary, and deterministic recurrence materialization creates one occurrence after reconnect even when both devices materialized it.
- [ ] Add fast-check command histories for 2–5 replicas, partitions, duplicate/reordered delivery and random merges. Run at least 500 histories in CI seed logging; on failure print the reproducible seed/path.
- [ ] Run the three E2E files and property suite repeatedly; expect pass.
- [ ] Commit: `test(sync): prove offline deterministic convergence`

### Task 25: Prove crash, lost-ACK and relay-restart durability

**Files:**

- Create: `tests/matrix/fault-client-crash.spec.ts`
- Create: `tests/matrix/fault-lost-ack.spec.ts`
- Create: `tests/matrix/fault-server-restart.spec.ts`
- Create: `tests/matrix/fault-key-and-projection.spec.ts`
- Create: `src/test/LiftTestDriver.ts`
- Modify: `src/features/workspaces/application/SecureRuntime.ts`

**Produces:** evidence for every documented failure guarantee.
**Consumes:** durable inbox/outbox, deterministic transaction IDs, Docker stack.

- [ ] Write all four fault files first and run them; expect failures at the named crash/lost-ACK/restart boundaries before the test driver and recovery paths exist.
- [ ] Simulate accepted-but-unacknowledged delivery with an actual completed upstream fetch:

```ts
let accepted = false;
await sender.page.route(
  /\/_matrix\/client\/.*\/rooms\/.*\/send\//,
  async (route) => {
    if (accepted) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    accepted = true;
    await route.abort("connectionreset");
  }
);
await sender.createTask(marker);
await expect(receiver.page.getByText(marker)).toBeVisible();
expect(await matrixEventCountForChange(changeHash)).toBe(1);
```

- [ ] Expose a production-inert test driver only when `import.meta.env.MODE === "test"`; it may pause workers, inject a throw at named transaction boundaries, report redacted row counts/heads and corrupt only disposable projections. It must not inject clear remote events or bypass trust validation.
- [ ] Client crash test: pause sender, commit a task, close context, open a fresh context using the same persistent profile, resume and assert delivery. Repeat with crash after durable inbox write and before apply.
- [ ] Lost ACK test: intercept the Matrix `/send/` request, call `route.fetch()` so Synapse accepts it, then abort the browser response with `connectionreset`. Assert retry uses the same Matrix transaction ID, Synapse stores one event and receiver applies one change.
- [ ] Server durability test: commit while Synapse is stopped; restart Synapse and assert delivery. Then stop PostgreSQL/Synapse after accepted send, restart with the same named volumes and assert timeline/event/outbox convergence. Never use `down --volumes` in this test.
- [ ] Key/projection test: withhold room key so inbox remains `waiting-keys`, restore through backup and apply; corrupt task projection and rebuild from verified snapshot/change log; inject malformed event and confirm quarantine survives restart.
- [ ] Add bounded polling with explicit state diagnostics; no arbitrary sleeps longer than the worker's smallest retry interval.
- [ ] Run all four fault files twice; expect pass.
- [ ] Commit: `test(sync): prove crash and relay durability`

### Task 26: Prove ciphertext-only server storage and hostile-input handling

**Files:**

- Create: `tests/matrix/security-plaintext-probe.spec.ts`
- Create: `tests/matrix/security-hostile-events.spec.ts`
- Create: `scripts/matrix/dump-primary-db.mjs`
- Create: `scripts/matrix/redact-diagnostics.mjs`
- Create: `docs/security/matrix-e2ee-threat-model.md`
- Modify: `package.json`

**Produces:** automated security evidence plus documented limits/metadata leakage.
**Consumes:** real Synapse timeline/API, PostgreSQL dump, role/device fixtures.

- [ ] Write both security specs first and run `npm run test:security`; expect the script/hostile-event assertions to fail before the probes and diagnostic redaction are implemented.
- [ ] Make the plaintext assertion byte-oriented and cover common accidental encodings:

```ts
const probes = [
  marker,
  JSON.stringify(marker).slice(1, -1),
  Buffer.from(marker, "utf8").toString("base64"),
  Buffer.from(marker, "utf8").toString("base64url"),
];
for (const artifact of [rawMessages, rawSync, postgresDump, synapseLogs]) {
  for (const probe of probes) expect(artifact).not.toContain(probe);
}
expect(await localProjectionContains(marker)).toBe(true);
```

- [ ] Create a cryptographically random marker and place it independently in title, note, tag, audit text and workspace settings. Sync it, checkpoint it and restart all containers.
- [ ] Fetch raw `/messages`, `/event`, `/sync` responses; dump PostgreSQL with `docker compose exec -T primary-db pg_dump -U synapse synapse`; collect Synapse logs. Assert UTF-8 marker and its JSON-escaped/base64 forms are absent from every server artifact. Assert wire application type is `m.room.encrypted`; local decrypted projection must contain the marker to prove the probe is meaningful.
- [ ] Send, from real signed test devices, malformed schema, wrong workspace, wrong hash, stale/revoked epoch, Viewer-authored change, ACL fork/rollback and truncated checkpoint. Assert each precise quarantine/pause reason and zero document mutation. An unverified device's otherwise-valid event must not decrypt/apply under signed-device isolation.
- [ ] Scan rendered diagnostics, console output and error telemetry hooks for access token, recovery key, raw crypto storage key, Matrix ciphertext clear content and marker. Centralize redaction before logging any Matrix error object.
- [ ] Document trusted/untrusted components, visible metadata, endpoint compromise, availability denial, pre-removal plaintext retention and total recovery loss. State clearly that Matrix power levels reveal coarse roles/membership even though encrypted ACL details and Lift content remain secret.
- [ ] Add `test:security` and run `npm audit --omit=dev --audit-level=high`. Upgrade or replace dependencies with high/critical advisories; do not ignore a crypto/protocol advisory via blanket audit config.
- [ ] Run `npm run test:security`; expect pass.
- [ ] Commit: `test(security): verify ciphertext-only relay storage`

### Task 27: Remove all obsolete artifacts and deliver a reproducible local system

**Files:**

- Delete: `supabase/**`
- Delete: remaining obsolete sync services/repositories/tests and legacy schema helpers found by the guard
- Delete: `src/shared/domain/repositories/TaskRepository.ts`
- Delete: `src/shared/domain/repositories/DailySelectionRepository.ts`
- Delete: `src/shared/domain/repositories/UserSettingsRepository.ts`
- Delete: `src/shared/infrastructure/utils/hashUtils.ts`
- Modify: `src/test/utils/mockFactories.ts`
- Modify: `src/test/setup.ts`
- Modify: all remaining failing unit/integration/E2E tests
- Modify: `vite.config.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `docs/sync/local-matrix-runbook.md`
- Create: `docs/sync/protocol-v1.md`
- Create: `docs/sync/recovery-and-revocation.md`
- Create: `scripts/verify-secure-sync.mjs`

**Produces:** no legacy fallback, a zero-failure test matrix, operating documentation and a running local demo.
**Consumes:** every earlier task.

- [ ] Create `scripts/verify-secure-sync.mjs` with the ordered checks and run `node scripts/verify-secure-sync.mjs`; expect failure while legacy artifacts, skipped/failing tests or missing documentation remain.
- [ ] Use `spawnSync` with argument arrays and fail on either exit code or skipped-test output:

```js
const checks = [
  ["npm", ["run", "matrix:health"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "test:unit"]],
  ["npm", ["run", "test:integration"]],
  ["npm", ["run", "test:e2e"]],
  ["npm", ["run", "test:e2e:matrix"]],
  ["npm", ["run", "test:security"]],
  ["npm", ["run", "build"]],
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = redact(`${result.stdout}\n${result.stderr}`);
  process.stdout.write(output);
  if (result.status !== 0 || /\b(skipped|pending)\b/i.test(output))
    process.exit(1);
}
```

- [ ] Run the legacy guard and `rg -n "Supabase|supabase|TodoDatabase|VITE_SUPABASE|updatedAt.*winner|last-write-wins" src tests package.json README.md`; delete all runtime/test references. Delete the top-level Supabase schema/migration directory because this clean start has no Supabase deployment or migration path. Preserve Git history; do not touch unrelated remote branches.
- [ ] Remove `@tiptap/*` dependencies and obsolete HTML checklist helpers after the collaborative plain-text editor tests pass; verify no persisted note path contains editor HTML.
- [ ] Remove global mocks of `TaskId`, `NonEmptyTitle` and `DateOnly` from `src/test/setup.ts`; tests should use real value objects or local explicit fakes. Fix the existing missing static-date mock issue by deleting the global mock, not adding compatibility behavior.
- [ ] Configure Vite to bundle Matrix Rust WASM reliably, split Matrix/Automerge into stable chunks and preserve PWA offline app shell. Run a production build and browser smoke test; no Node polyfill may silently replace Web Crypto.
- [ ] Add exact runbook commands, test accounts, recovery flow, volume retention/reset warning, server-profile URL policy, second-stack migration workflow and irrecoverable-loss warning. `protocol-v1.md` records all schemas, canonicalization, conflict rules, ACL epoch/re-envelope behavior and checkpoint verification.
- [ ] Implement `scripts/verify-secure-sync.mjs` to run, in order, Compose config/health/provision, typecheck, lint, unit, integration, standard E2E, Matrix E2E, fault/security tests and build. It exits nonzero on skipped tests, leaked marker, unhealthy container or any failure and prints redacted artifact paths.
- [ ] Add scripts:

```json
{
  "scripts": {
    "verify:secure-sync": "node scripts/verify-secure-sync.mjs",
    "demo:up": "npm run matrix:up && npm run matrix:provision",
    "demo:up:all": "npm run matrix:up:all && npm run matrix:provision"
  }
}
```

- [ ] Run `npm run verify:secure-sync` from a clean checkout with retained Docker volumes once, then from freshly created Lift/Matrix test volumes once. Require zero failed/skipped tests.
- [ ] Start `npm run demo:up`, start Vite bound to `127.0.0.1`, open two independent persistent browser profiles, complete actual login/recovery verification, edit from both sides and capture final redacted evidence: distinct device IDs, equal heads, empty pending inbox/outbox, no quarantine and healthy Synapse/PostgreSQL.
- [ ] Leave the primary local server running for handoff. Report the local app/server URLs and local test users; never report passwords, tokens or recovery keys in Git or logs beyond the explicitly documented disposable development credentials.
- [ ] Commit: `feat(sync): deliver local Matrix E2EE offline synchronization`

## Final Verification Checklist

- [ ] `npm run typecheck` — zero errors.
- [ ] `npm run lint` — zero warnings/errors.
- [ ] `npm run test:unit` — zero failures/skips.
- [ ] `npm run test:integration` — zero failures/skips.
- [ ] `npm run test:e2e` — existing Lift workflows plus clean-start/offline shell pass.
- [ ] `npm run test:e2e:matrix` — realtime, offline, ACL, recovery, checkpoints, migration and faults pass against real Synapse.
- [ ] `npm run test:security` — plaintext/hostile-event probes pass.
- [ ] `npm run build` — production PWA and Matrix Rust WASM load successfully.
- [ ] Raw Matrix responses, Synapse logs and PostgreSQL dump contain no Lift plaintext marker.
- [ ] Two independent devices end with byte-equivalent canonical state and identical sorted Automerge heads.
- [ ] Primary Synapse/PostgreSQL remain healthy and running after final proof.

## Plan Self-Review Checklist

| Approved design area             | Implementation tasks | Executable evidence                                                |
| -------------------------------- | -------------------- | ------------------------------------------------------------------ |
| Architecture and clean start     | 1, 6–10, 27          | layer guards, clean-start E2E, full typecheck                      |
| CRDT model/conflicts/order       | 2, 3, 5, 7, 8        | unit + 500-history property suite + offline E2E                    |
| Effective date/defer/recurrence  | 4, 9, 24             | DST/boundary unit tests + all-offline day E2E                      |
| Atomic local write/outbox/events | 6, 7, 15, 18         | rollback, restart, lost-ACK and dispatcher tests                   |
| Durable inbox/dedup/quarantine   | 16, 25, 26           | crash replay, duplicate, missing-key and hostile-event tests       |
| Matrix E2EE/device lifecycle     | 11–14, 17, 20        | real Synapse realtime, SAS/QR and recovery E2E                     |
| Roles/ACL/revocation             | 14, 19, 22           | three-user capability and post-rotation revocation E2E             |
| Checkpoints/compaction           | 21                   | multi-writer checkpoint, fresh-device restore, rollback rejection  |
| Failure guarantees               | 18, 24, 25           | partition, client crash, accepted/lost response, server/DB restart |
| Multiple servers/migration       | 12, 23               | exact-head two-stack migration and rollback-on-failure E2E         |
| User-visible sync state          | 13, 20, 22           | ViewModel/component state matrix and accessibility tests           |
| Threat model/ciphertext server   | 26, 27               | raw API/log/pg_dump marker probes and documented limits            |

- [ ] Confirm every row above has both a producing task and a red/green executable test.
- [ ] Scan for unresolved planning markers, abbreviated pseudo-code and paths lacking an owning task; replace each with an exact decision before execution.
- [ ] Verify every produced port has exactly one production adapter (or an explicitly named composite) and every adapter is wired in `SecureRuntime`/DI.
- [ ] Verify all wire/schema status unions agree across Domain, records, Zod codecs, workers, ViewModels and tests.
- [ ] Verify destructive reset commands are separately named, target only the exact Compose project and are never used by durability tests.
- [ ] Verify source code and docs never claim recovery after loss of all verified devices plus the recovery key.
