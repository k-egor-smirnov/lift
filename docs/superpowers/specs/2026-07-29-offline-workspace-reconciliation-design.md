# Offline-only Workspace Reconciliation Design

**Status:** approved in design review  
**Date:** 2026-07-29  
**Scope:** reconcile workspaces created locally without a Matrix identity after a user signs into an existing Matrix account

## 1. Objective

Lift must never display or synchronize one Matrix account's workspace while
another account is authenticated. A workspace created in offline-only mode is
not owned by the next account that signs in merely because both sessions used
the same browser profile.

After a verified Matrix workspace has been selected, Lift detects any truly
unbound local workspace and offers three explicit actions:

- import its user-visible tasks into the current account;
- permanently delete its local data;
- decide later without changing or synchronizing it.

There is no automatic merge, implicit ownership transfer, or deletion.

## 2. Identity and isolation rules

A Matrix-bound workspace is selectable only when the current
`profileId + userId + deviceId` is authorized by its accepted ACL and active
sync target. A local snapshot alone is never an account binding.

An offline-only workspace is a workspace snapshot with no Matrix sync target
and no accepted Matrix ACL binding. A workspace belonging to another Matrix
account is not an offline candidate and must never appear in this flow.

While a Matrix account is authenticated:

- only its authorized workspace is exposed through `CurrentWorkspace`;
- outbox claims are scoped to that workspace;
- offline candidates remain invisible to ordinary task queries;
- no offline candidate can generate Matrix traffic until the user imports it.

## 3. User experience

Once the current account workspace is ready, Lift shows a dialog:

> На этом устройстве найдены локальные задачи без аккаунта.

The dialog identifies the local workspace by creation information and task
count without exposing it to the current task screens.

### 3.1 Import

`Импортировать в текущий аккаунт` copies the supported user-visible task state
into the current account workspace. It never matches or overwrites tasks by
title.

The import includes:

- active, deferred, and completed tasks;
- title, note, category, tags, and defer state;
- dated Today selections required for history and current presentation.

Deleted tasks and internal audit/domain-delivery history are not imported.

The source offline workspace is removed only after the target import has been
committed durably. Until that point the dialog remains recoverable and retrying
the operation is safe.

### 3.2 Delete

`Удалить локальные данные` opens a separate destructive confirmation that
states that the workspace has never been synchronized and cannot be restored
from Matrix.

Only the exact selected offline workspace and all of its workspace-scoped
local artifacts are deleted. Account-bound workspaces, Matrix crypto stores,
server profiles, and unrelated offline workspaces are untouched.

### 3.3 Later

`Позже` closes the dialog without importing, deleting, modifying, binding, or
synchronizing the offline workspace.

The data stays encrypted in local IndexedDB on this device. It remains
unavailable to the authenticated account and produces no Matrix events. Lift
keeps a visible reminder in Settings and offers the choice again on the next
successful account login or application session. Choosing `Позже` is not a
hidden acceptance of data loss and has no timeout.

If no Matrix workspace is ready yet, Import is disabled with an explanation;
Delete and Later remain available.

## 4. Application boundary

Presentation uses a dedicated ViewModel and application use case. React does
not query or mutate Dexie directly.

Application-facing operations:

- `listOfflineWorkspaceCandidates()`;
- `importOfflineWorkspace(sourceWorkspaceId, targetWorkspaceId)`;
- `deleteOfflineWorkspace(sourceWorkspaceId)`;
- `dismissOfflineWorkspaceForSession(sourceWorkspaceId)`.

Every operation revalidates that:

- the source still has no Matrix target or ACL binding;
- the target is the currently selected authorized Matrix workspace;
- source and target IDs differ;
- the authenticated identity has permission to edit the target.

The dismissal is presentation-session state only. It does not alter domain or
persistence records.

## 5. Atomic and idempotent import

Import is one semantic CRDT command on the target workspace. Each imported task
receives a deterministic target ID derived from:

`SHA-256("lift-offline-import-v1" + NUL + sourceWorkspaceId + NUL + sourceTaskId + NUL + targetWorkspaceId)`

This makes a retry after a crash idempotent. If the deterministic ID already
exists with the expected imported provenance, it is skipped. If it exists with
different provenance or incompatible content, the whole import fails closed.

The target transaction atomically persists:

- the Automerge change;
- updated target snapshot and projections;
- durable Matrix outbox rows;
- an import audit record containing source workspace ID and imported task
  count.

The source cleanup is a second transaction after the target commit. Therefore:

- a crash before the target commit leaves the source untouched;
- a crash after the target commit but before cleanup leaves both copies, and a
  retry detects the already imported deterministic IDs and completes cleanup;
- source deletion can never precede durable target persistence.

## 6. Deletion scope

Cleanup removes records for the exact source workspace from:

- workspace snapshots and changes;
- task, Today, statistics, conflict, and audit projections;
- inbox, outbox, event-index, checkpoint, ACL, migration, payload-fragment,
  quarantine, and domain-event artifacts that are scoped to that workspace;
- sync targets only after revalidation proves that none bind the workspace to
  Matrix.

The deletion service performs a preflight count, executes one Dexie
transaction, and returns the deleted workspace ID and artifact counts for UI
confirmation.

## 7. Error handling

- A changed account or target workspace aborts Import before mutation.
- A newly discovered Matrix binding aborts both Import and Delete.
- Projection, CRDT, validation, or IndexedDB failures roll back the target
  import transaction and leave the source intact.
- Cleanup failure after a successful import is reported as
  `Импорт завершён, локальную копию пока не удалось удалить`; retry remains
  available and cannot duplicate tasks.
- The destructive confirmation stays open on deletion failure.
- Later never reports synchronization success because it performs no sync.

## 8. Tests and acceptance evidence

### Unit

- candidate classification excludes every Matrix-bound workspace;
- deterministic imported IDs are stable and target-specific;
- deleted tasks and internal audit history are excluded;
- Later performs no application mutation.

### Integration

- batch import persists one coherent target CRDT change and outbox transaction;
- failure rolls back every target artifact and preserves the source;
- retry after simulated post-commit/pre-cleanup crash creates no duplicates;
- Delete removes only the exact offline workspace;
- account/ACL changes during reconciliation fail closed.

### E2E

1. Create tasks in offline-only mode.
2. Sign into an existing account that already has different tasks.
3. Verify offline tasks are not displayed or uploaded.
4. Choose Later; verify the account remains usable, Settings retains a
   reminder, and the offer returns in a later session.
5. Choose Import; verify both independent Matrix devices receive the imported
   tasks exactly once.
6. Repeat with Delete; verify the local tasks disappear and never reach
   Matrix.
7. Switch between two Matrix accounts and verify neither can see or enqueue the
   other's tasks.

The feature is complete only when these tests pass together with the full
Matrix offline/realtime/restart suite.
