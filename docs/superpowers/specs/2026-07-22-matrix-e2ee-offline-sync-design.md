# Matrix E2EE + Offline CRDT Sync Design

**Status:** approved in design review  
**Date:** 2026-07-22  
**Scope:** clean-slate replacement of the current Supabase synchronization stack

## 1. Objective

Lift must run against a real locally hosted synchronization server and provide:

- end-to-end encryption with Matrix-grade device identity, verification, cross-signing, key rotation, revocation, and encrypted recovery;
- realtime synchronization between two genuinely independent devices;
- full offline operation with deterministic, conflict-free convergence after reconnect;
- durable behavior across client crashes, lost acknowledgements, server restarts, and prolonged partitions;
- configurable Matrix server profiles and verified migration of a workspace between servers;
- no server-side knowledge of task titles, notes, categories, tags, CRDT changes, or other domain content;
- deterministic start-of-day, deferred, and recurring behavior without an elected master client.

The implementation starts with an empty secure database. It does not migrate or import existing Dexie or Supabase data.

## 2. Chosen approach

The system combines two independent layers:

1. **Matrix transport and E2EE**
   - Synapse with PostgreSQL is the durable relay.
   - `matrix-js-sdk` with the Rust/WASM crypto implementation supplies Olm/Megolm, per-device identity, cross-signing, verification, secret storage, and encrypted key backup.
   - One encrypted Matrix room is used for each Lift workspace.

2. **Automerge 3 local-first state**
   - One Automerge document is the authoritative domain state for one workspace.
   - IndexedDB is the primary persistence layer used by the UI.
   - Automerge changes are transported as encrypted Matrix room events.
   - The server is not the source of truth and never resolves domain conflicts.

Matrix alone does not provide domain convergence. Automerge alone does not provide authentication, authorization, E2EE, device verification, or a durable hosted relay. Both layers are required.

The previously existing `origin/codex/implement-client-sync-integration-with-yjs-and-mls` branch is not a basis for this implementation. Its `MlsGroupSessionManager` models epochs but does not implement MLS key packages, tree operations, ratchets, commits, or authenticated membership changes.

## 3. Trust and threat model

### 3.1 Trusted

- A verified, uncompromised client device.
- The maintained production protocol implementation and standard primitives used by Matrix Rust crypto.
- The local browser origin and its IndexedDB while the endpoint itself is uncompromised.

### 3.2 Untrusted or potentially malicious

- Synapse, PostgreSQL, reverse proxies, and server operators.
- The network between client and homeserver.
- Unverified Matrix devices.
- Revoked users and devices after the revocation checkpoint.

The relay may inspect metadata, delay, drop, duplicate, reorder, replay, or selectively hide ciphertext. It must not be able to decrypt or forge an accepted change from a verified authorized device.

### 3.3 Explicit limits

E2EE cannot prevent:

- an authorized endpoint from exporting plaintext;
- a compromised endpoint from reading data available to that endpoint;
- a removed member from retaining plaintext or keys obtained before removal;
- a server from denying availability;
- metadata leakage without an anonymity network and cover traffic.

The server can observe Matrix account IDs, room membership and power levels, device/IP activity, event timing, event size, and traffic volume. It cannot observe Lift domain payloads.

## 4. Architecture and boundaries

Dependencies continue to point inward:

### 4.1 Domain

Pure TypeScript domain types and rules:

- `Workspace`
- `Task`
- `DailySelection`
- `RecurrenceTemplate`
- `WorkspaceSettings`
- `WorkspaceAcl`
- `Role`
- deterministic projection and conflict-resolution policies

The Domain layer has no imports from Automerge, Matrix, Dexie, Web Crypto, React, Zustand, or TSyringe infrastructure tokens.

### 4.2 Application

Use cases are the only entry points for user scenarios. Application ports include:

- `WorkspaceRepository`
- `WorkspaceUnitOfWork`
- `SyncOutbox`
- `SyncInbox`
- `EncryptedTransport`
- `DeviceTrustService`
- `ServerProfileRepository`
- `EffectiveDateProvider`

Representative use cases:

- create, update, reorder, complete, reopen, defer, and delete a task;
- add or remove a task from a dated selection;
- create or materialize a recurring occurrence;
- create or join a workspace;
- verify or revoke a device;
- change a role;
- process inbox/outbox;
- create and verify a checkpoint;
- migrate a workspace to another Matrix server.

### 4.3 Infrastructure

- Automerge document adapter and conflict-aware projections.
- `LiftSecureDatabase` implemented with Dexie/IndexedDB.
- Matrix client, Rust crypto store, room lifecycle, and encrypted event transport.
- Docker Compose for Synapse and PostgreSQL.
- checkpoint compression, hashing, retry scheduling, and quarantine storage.

### 4.4 Presentation

- React views remain display and UI-event layers.
- Zustand ViewModels expose domain state, offline state, pending counts, conflicts, device trust, and server status.
- Views do not call Matrix, Dexie, or Automerge directly.

## 5. Clean-slate persistence

The secure implementation uses a new IndexedDB database named `LiftSecureDatabase`.

- The old `TodoDatabase` is never opened by the new runtime.
- No legacy importer, migration, fallback, compatibility adapter, or rollback model is implemented.
- Supabase authentication, realtime, repositories, configuration, and runtime initialization are removed from production paths.
- Existing browser and Supabase data are not automatically deleted, but are invisible to the new application.
- First launch always starts with no Lift workspace data and enters Matrix setup.

The secure database contains, at minimum:

- `workspaceSnapshots`
- `workspaceChanges`
- `syncOutbox`
- `syncInbox`
- `matrixEventIndex`
- `syncTargets`
- `aclCheckpoints`
- `quarantine`
- local read-model projection tables

Matrix crypto uses a separate IndexedDB namespace per homeserver profile. Two Matrix client instances must never share one crypto-store namespace.

## 6. Workspace CRDT model

One Automerge document represents one workspace and contains:

- tasks;
- dated daily selections;
- tags;
- workspace settings;
- recurrence templates and materialized occurrences;
- immutable completion/audit records needed for statistics.

The encrypted ACL is transported and validated separately from ordinary editor changes so an Editor cannot grant itself a stronger role through the document.

### 6.1 Task fields

A task contains a stable ID, collaborative title, collaborative note, category, fractional position, creation metadata, optional defer date, original category, lifecycle operations, tags, and a permanent deletion tombstone.

Physical timestamps are display/audit data only. They never choose a synchronization winner.

### 6.2 Conflict policies

- **Title and note:** collaborative Automerge text operations merge character-level concurrent edits.
- **Tags:** observed-remove set.
- **Daily selection:** observed-remove set keyed by `(effectiveDate, taskId)`; a concurrent add wins over a remove that did not observe that add.
- **Deletion:** a grow-only tombstone. Delete wins over concurrent edits. Recreating an item requires a new Task ID.
- **Complete versus reopen:** if causally ordered, the later observed action wins; if truly concurrent, completed wins.
- **Scalar conflicts:** category, defer date, workspace setting, and position resolve by a canonical Automerge operation-ID comparator. All alternatives remain available through Automerge conflict history and are surfaced in the UI.
- **Ordering:** fractional position tokens are compared lexicographically, then by stable actor ID, then Task ID. Concurrent moves therefore produce one stable total order.

No resolver uses `Date.now()`, `updatedAt`, server timestamps, arrival order, or local receive time.

## 7. Effective date and asynchronous domain behavior

The effective date is a pure projection from:

- the workspace IANA timezone;
- the workspace start-of-day time;
- the device's current local time.

Clock skew can temporarily make two devices display different effective dates, but it cannot choose a CRDT winner or mutate existing history. Every date-derived object is keyed by its semantic date, so a corrected clock converges without duplicate occurrences.

### 7.1 Today

"Today" is a dated relation rather than a mutable boolean on the task. At the next effective day the UI queries another date. No client clears the previous day, and previous selections remain available for history and statistics.

### 7.2 Deferred tasks

A deferred task stores a `DateOnly` boundary and original category. Before the boundary it projects into Deferred. On and after the boundary it projects into the original category. No `undefer` timer mutation is required.

### 7.3 Recurrence

An occurrence ID is deterministic:

`SHA-256(templateId + NUL + occurrenceDate)`

Any client may materialize a missing occurrence. Multiple clients produce the same logical occurrence and do not create duplicates. After a long offline interval, the first opened client calculates the missing effective dates and materializes the required occurrences.

The relay may later send a generic wake-up signal, but wake-up delivery is an optimization and never required for correctness.

## 8. Local transaction and outbox protocol

Every user change follows this order:

1. Load the current local Automerge document.
2. Execute the domain use case.
3. Produce one or more Automerge binary changes.
4. In one IndexedDB transaction, persist the changes, updated snapshot/projection metadata, and one outbox record per change.
5. Commit locally and update the UI.
6. Trigger asynchronous delivery if a Matrix target is available.

The network is not part of a user transaction. Offline behavior is identical to online behavior except for status and pending counts.

An outbox record contains:

- workspace ID;
- Automerge change hash;
- encrypted-event inner type and schema version;
- ACL epoch;
- binary change or checkpoint reference;
- attempt count, next attempt time, and last error;
- Matrix transaction ID and acknowledged Matrix event ID.

Encrypted application payloads use versioned inner types:

- `dev.lift.crdt.change.v1`;
- `dev.lift.checkpoint.v1`;
- `dev.lift.acl.v1`.

The Matrix transaction ID is deterministically derived from the change hash. Matrix delivery is at-least-once, while application of the Automerge change is logically exactly-once by hash.

Retries use exponential backoff with jitter and a maximum delay, but do not expire ordinary data. Authentication, revoked-device, and permanent schema errors pause the entry and surface an actionable status instead of discarding it.

## 9. Inbox and apply protocol

Every received encrypted room event follows this order:

1. Persist event ID, sender/decryption metadata, ciphertext reference, and processing state in the durable inbox.
2. Ask Matrix Rust crypto to decrypt.
3. Require a verified sender device and a matching workspace room.
4. Validate the encrypted ACL chain and authorization epoch.
5. Validate payload schema, workspace ID, dependencies, and change hash.
6. In one IndexedDB transaction, deduplicate by change hash, persist the change, apply it to the document, update projections, and mark the inbox item handled.

Missing decryption keys leave the event pending and trigger Matrix key recovery. Invalid signatures/trust, unauthorized roles, malformed payloads, hash mismatches, and impossible dependencies enter quarantine with an explicit reason.

A crash before the final transaction causes safe replay. A crash after the transaction finds the change hash and does not apply it twice.

## 10. Matrix E2EE and device lifecycle

Each browser installation is a distinct Matrix device with its own identity and session keys. Private keys remain in the Matrix Rust crypto IndexedDB store.

### 10.1 First device

The first device:

- logs in or registers on the selected homeserver;
- initializes Rust crypto;
- bootstraps cross-signing;
- creates secret storage;
- creates an encrypted key backup protected by a high-entropy recovery key;
- requires the user to acknowledge/save the recovery key before the workspace is considered recoverable.

Password-only recovery is not accepted as the sole protection for workspace keys.

### 10.2 New device

A new device is untrusted until one of these succeeds:

- QR/SAS verification with an existing verified device;
- restoration and cross-signing bootstrap using the recovery key.

Workspace keys are shared only with verified devices. A new verified device can obtain historical keys through encrypted key backup or a verified existing device.

### 10.3 Rotation

The encrypted Matrix room uses `m.megolm.v1.aes-sha2` through Matrix Rust crypto. Outbound group sessions rotate:

- immediately after membership or device revocation changes;
- after at most 24 hours;
- after at most 100 application events;
- whenever Matrix crypto reports that the current session is unsafe or must be discarded.

### 10.4 Recovery limit

If all verified devices and the recovery key are lost, the data is cryptographically unrecoverable. The homeserver cannot reset encryption through an account password reset.

## 11. Roles and authorization

Roles are per Matrix user and trust is per Matrix device:

| Role   | Matrix level | Capabilities                                                       |
| ------ | -----------: | ------------------------------------------------------------------ |
| Owner  |          100 | all actions, ownership transfer, recovery policy, server migration |
| Admin  |           75 | invite/remove users, change Editor/Viewer roles, revoke devices    |
| Editor |           50 | mutate workspace domain data                                       |
| Viewer |            0 | decrypt and read only                                              |

Matrix room power levels provide coarse server-visible enforcement. Because all application payloads appear as `m.room.encrypted`, the client also enforces an encrypted append-only ACL chain.

Workspace rooms use Matrix room version 11. Version 12 deliberately is not
used: its creator has immutable implicit infinite power, which cannot model a
real ownership transfer or the demotion/removal of a former Owner. With v11,
Owner is an explicit transferable power level 100 entry. This choice is safe
for a clean-start system and must be revisited before adopting a later room
version with equivalent transferable-ownership semantics.

Each ACL checkpoint contains:

- workspace ID;
- monotonically increasing `authEpoch`;
- previous ACL checkpoint hash;
- roles and membership;
- revoked users/devices;
- the Automerge heads accepted before the checkpoint;
- authenticated Matrix sender/decryption metadata.

Only an authorized Owner/Admin ACL transition is accepted. Ownership transfer requires the current Owner. The last Owner cannot remove or demote itself without a successful transfer.

Ordinary changes bind to an `authEpoch`. On revocation, an old-epoch change is accepted only if it is in the causal closure of the Automerge heads recorded in the revocation checkpoint. Unsynced changes from a revoked device are therefore rejected even if that device claims they were authored earlier.

After reconnect, a client processes membership, device, and ACL updates before sending its outbox. If the device remains authorized, its unsent Automerge changes are re-enveloped at the current `authEpoch` and encrypted with the current Megolm session without changing their Automerge hashes. If the device was revoked or downgraded below Editor, those local changes are not uploaded and are exposed for local export/review.

This deliberately prefers strict post-revocation security over preserving edits that never reached an authorized device before revocation.

A Viewer receives workspace decryption keys and therefore sees the whole workspace. Data with a different confidentiality boundary requires a different workspace/room.

## 12. Checkpoints and compaction

Clients periodically publish encrypted checkpoints containing:

- a compressed Automerge snapshot;
- workspace ID and schema version;
- snapshot hash;
- covered Automerge heads;
- covered change hashes or a compact authenticated index;
- ACL epoch.

Checkpoint creation is idempotent and does not require a leader. Multiple valid checkpoints may coexist.

A checkpoint is trusted only after the client reads the Matrix event back, decrypts it, validates its hash and authorization, loads it into a fresh Automerge instance, and confirms the expected heads.

A checkpoint may cover only a valid causal closure of accepted changes. It never authorizes deletion of a local head that it does not contain, so an incomplete or maliciously truncated checkpoint cannot roll back a client.

Local history is compacted only after a verified checkpoint covers it. Read-model projections are disposable and can be rebuilt from the latest valid checkpoint plus later changes.

## 13. Failures and guarantees

The design provides:

- atomic local persistence;
- at-least-once encrypted transport;
- exactly-once logical change application by hash;
- deterministic convergence independent of event order;
- durable retry after client restart;
- replay after server restart;
- no dependency on an always-online client.

Specific failure handling:

- **Network unavailable:** local commits continue; outbox grows.
- **Client closes before send:** persisted outbox resumes on next launch.
- **Server accepts but response is lost:** deterministic Matrix transaction ID prevents a duplicate event; Automerge hash prevents duplicate application.
- **Server/DB restart:** Matrix durability and client retry recover delivery.
- **Missing room key:** inbox remains pending and requests/restores the key.
- **Invalid or unauthorized event:** quarantine; never silently apply or drop.
- **Projection corruption:** rebuild from verified snapshot and change log.
- **Malicious server omission:** dependency/head comparison exposes missing changes when another valid source is observed, but a server can still deny availability to all clients.

## 14. Server profiles and workspace migration

The app can store any number of Matrix server profiles. A workspace has exactly one active synchronization target at a time.

Switching a workspace to another server is a two-phase operation:

1. Authenticate and initialize verified crypto storage for the target server profile.
2. Create a new encrypted room and apply the intended membership/power levels.
3. Publish the current ACL chain, a verified checkpoint, and all pending changes.
4. Read them back from the target, decrypt, validate, and compare Automerge heads in a fresh document.
5. Mark the target active only after exact head equality.
6. Keep the old target read-only and configured until the user explicitly removes it.

If the old server is permanently unavailable, any verified device with a complete local document can seed a new server. If no complete device or recovery material remains, the server cannot reconstruct plaintext.

## 15. Local real-server deployment

The repository supplies Docker Compose configuration for:

- an official Synapse image;
- PostgreSQL with a persistent named volume;
- health checks;
- restart policies;
- isolated development credentials/configuration;
- a second Synapse/PostgreSQL stack that is optional for normal development but mandatory for server-migration tests.

Local HTTP is allowed only for loopback development addresses. Non-loopback Matrix profiles must use HTTPS.

The normal development workflow starts Synapse/PostgreSQL, starts Vite, provisions test accounts, and uses two independent browser contexts with separate storage and Matrix device IDs.

## 16. User-visible sync state

The UI distinguishes:

- offline and fully usable;
- connected and synchronized;
- sending/receiving with pending counts;
- waiting for device verification;
- waiting for recovery/decryption keys;
- paused authorization error;
- quarantined invalid events;
- conflict alternatives requiring optional user review.

"Synced" means the local outbox is acknowledged and all currently received inbox entries are applied or explicitly quarantined. It never merely means `navigator.onLine === true`.

## 17. Verification matrix

Completion requires automated evidence against a real local Synapse, not only mocks.

1. **Realtime:** two independent Playwright contexts synchronize changes in both directions.
2. **Full offline:** both devices edit independently while network-disabled; after reconnect their Automerge heads and canonical exported state match.
3. **Conflict permutations:** edit/edit, add/remove, complete/reopen, reorder, and delete/edit converge under reordered and duplicated deliveries.
4. **Client crash:** a local commit made before transport survives reload and is delivered.
5. **Lost acknowledgement:** the server accepts an event while the response is dropped; retry produces no logical duplicate.
6. **Server crash:** Synapse and PostgreSQL stop during edits; restart yields convergence without data loss.
7. **Start of day:** all clients are offline across the boundary; next launch shows correct Today, deferred, and recurring projections without cleanup events or duplicates.
8. **Ciphertext at rest:** a unique task/note marker appears on two clients but not in raw Matrix events or a PostgreSQL data dump.
9. **Device trust:** an unverified device receives no workspace keys; a verified device does; a revoked device cannot decrypt future events.
10. **Roles:** Viewer mutations, Editor ACL changes, and Admin ownership transfer are rejected.
11. **Recovery:** a new device with the recovery key restores keys and state; an incorrect key reveals nothing.
12. **Server migration:** workspace heads match after migration between two local Synapse stacks and remain usable after the old stack stops.
13. **Property-based convergence:** generated operations, partitions, reconnects, duplicate delivery, and arbitrary ordering converge for many deterministic seeds.
14. **Quality gates:** unit, integration, E2E, build, and lint complete with zero failures. Obsolete Supabase tests are removed or replaced rather than skipped.

At final handoff, the primary local server stack must be healthy and two independent device profiles must contain the same verified workspace state.

## 18. Primary references

- Matrix JavaScript SDK and Rust crypto: <https://github.com/matrix-org/matrix-js-sdk>
- Matrix Client-Server API and power levels: <https://spec.matrix.org/latest/client-server-api/>
- Matrix E2EE overview: <https://matrix.org/docs/matrix-concepts/end-to-end-encryption/>
- Automerge local-first CRDT: <https://automerge.org/>
- Automerge local storage and sync: <https://automerge.org/docs/tutorial/local-sync/>
- Automerge core implementation: <https://github.com/automerge/automerge>

## 19. Definition of done

The feature is done only when all of the following are simultaneously true:

- the real local Matrix/PostgreSQL stack is running and healthy;
- two independent verified Matrix devices synchronize Lift data in realtime;
- both devices remain fully functional offline and deterministically converge after reconnect;
- crash/retry, revocation, recovery, role, encryption-at-rest, and server-migration tests pass;
- the relay contains no plaintext Lift domain data;
- periodic domain behavior has no master client and survives all-client downtime;
- the complete quality matrix passes with zero failures;
- no legacy Supabase/Dexie migration path is present in the new runtime.
