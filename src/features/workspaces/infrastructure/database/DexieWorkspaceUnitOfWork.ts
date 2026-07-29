import * as Automerge from "@automerge/automerge";
import Dexie from "dexie";

import type { WorkspaceCommand } from "../../application/commands/WorkspaceCommand";
import type {
  AcceptedRemoteChange,
  ApplyRemoteResult,
  CommitResult,
  PersistableDomainEvent,
  WorkspaceUnitOfWork,
} from "../../application/ports/WorkspaceUnitOfWork";
import { isValidDateOnly } from "../../domain/EffectiveDate";
import { ChangeHash, WorkspaceId } from "../../domain/WorkspaceIdentity";
import type { WorkspaceState } from "../../domain/WorkspaceState";
import type { AutomergeCommandHandler } from "../crdt/AutomergeCommandHandler";
import {
  AutomergeWorkspaceDocument,
  QuarantinedAutomergeChangeError,
  type BinaryWorkspaceChange,
} from "../crdt/AutomergeWorkspaceDocument";
import type {
  WorkspaceProjection,
  WorkspaceProjectionBuilder,
} from "../crdt/WorkspaceProjector";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";
import { DexieWorkspaceRepository } from "./DexieWorkspaceRepository";
import type {
  DomainEventRecord,
  MatrixEventIndexRecord,
  QuarantineRecord,
  SyncInboxRecord,
  SyncOutboxRecord,
  WorkspaceChangeRecord,
} from "./records";

export interface WorkspacePersistenceClock {
  now(): number;
  effectiveDate(state: Readonly<WorkspaceState>): string;
}

export type SignalWorkspaceOutbox = () => void | Promise<void>;

interface CommitArtifacts {
  readonly result: CommitResult;
  readonly createdOutbox: boolean;
}

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return value;
};

const requireMetadataTime = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error("Invalid persistence metadata time");
  }
  return value;
};

const knownHashes = (document: AutomergeWorkspaceDocument): Set<string> => {
  const raw = Automerge.load<WorkspaceState>(document.save().slice());
  return new Set(
    Automerge.getAllChanges(raw).map(
      (bytes) => Automerge.decodeChange(bytes).hash
    )
  );
};

const sortedDifference = (after: Set<string>, before: Set<string>): string[] =>
  [...after]
    .filter((hash) => !before.has(hash))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

const cloneProjection = (
  projection: WorkspaceProjection
): WorkspaceProjection => ({
  tasks: projection.tasks.map((task) => ({ ...task, tags: [...task.tags] })),
  dailySelections: projection.dailySelections.map((selection) => ({
    ...selection,
  })),
  conflicts: projection.conflicts.map((conflict) => ({
    ...conflict,
    alternativeValues: [...conflict.alternativeValues],
  })),
  audit: projection.audit.map((record) => ({
    ...record,
    data: { ...record.data },
  })),
  dailyStatistics: projection.dailyStatistics.map((record) => ({ ...record })),
});

const commitResult = (
  workspaceId: string,
  changeHashes: readonly string[],
  heads: readonly string[]
): CommitResult => ({
  workspaceId: WorkspaceId(workspaceId),
  changeHashes: changeHashes.map(ChangeHash),
  heads: heads.map(ChangeHash),
});

const remoteResult = (
  workspaceId: string,
  changeHash: string,
  status: ApplyRemoteResult["status"],
  appliedChangeHashes: readonly string[],
  heads: readonly string[]
): ApplyRemoteResult => ({
  workspaceId: WorkspaceId(workspaceId),
  changeHash: ChangeHash(changeHash),
  status,
  appliedChangeHashes: appliedChangeHashes.map(ChangeHash),
  heads: heads.map(ChangeHash),
});

const eventPayload = (
  event: PersistableDomainEvent
): Readonly<Record<string, unknown>> => {
  if (event.payload !== undefined) {
    return structuredClone(event.payload);
  }
  if (event.getEventData !== undefined) {
    return structuredClone(event.getEventData());
  }
  return {};
};

const normalizeEvent = (
  workspaceId: string,
  event: PersistableDomainEvent,
  now: number
): DomainEventRecord => {
  const id = requireNonEmpty(event.eventId, "domain event id");
  const aggregateId = requireNonEmpty(
    event.aggregateId,
    "domain event aggregateId"
  );
  const eventType = requireNonEmpty(event.eventType, "domain event type");
  const occurredAt =
    event.occurredAt instanceof Date
      ? event.occurredAt.getTime()
      : event.occurredAt;
  if (!Number.isFinite(occurredAt) || occurredAt < 0) {
    throw new Error("Invalid domain event occurredAt");
  }
  return {
    id,
    workspaceId,
    aggregateId,
    aggregateType:
      event.aggregateType === undefined
        ? "Aggregate"
        : requireNonEmpty(event.aggregateType, "domain event aggregateType"),
    eventType,
    aggregateSequence: 0,
    payload: JSON.stringify(eventPayload(event)),
    occurredAt,
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    leaseUntil: null,
    lastError: null,
  };
};

const cloneRemote = (input: AcceptedRemoteChange): AcceptedRemoteChange => ({
  workspaceId: requireNonEmpty(input.workspaceId, "workspaceId"),
  actorId: requireNonEmpty(input.actorId, "actorId"),
  eventId: requireNonEmpty(input.eventId, "eventId"),
  roomId: requireNonEmpty(input.roomId, "roomId"),
  senderUserId: requireNonEmpty(input.senderUserId, "senderUserId"),
  senderDeviceId:
    input.senderDeviceId === null
      ? null
      : requireNonEmpty(input.senderDeviceId, "senderDeviceId"),
  wireEvent:
    input.wireEvent === undefined
      ? undefined
      : requireNonEmpty(input.wireEvent, "wireEvent"),
  bytes:
    input.bytes instanceof Uint8Array
      ? input.bytes.slice()
      : (() => {
          throw new Error("Invalid remote change bytes");
        })(),
  changeHash: requireNonEmpty(input.changeHash, "changeHash"),
  dependencies: Array.isArray(input.dependencies)
    ? [...input.dependencies]
    : (() => {
        throw new Error("Invalid remote dependencies");
      })(),
});

/** Persists authoritative state, disposable projections, events and sync work atomically. */
export class DexieWorkspaceUnitOfWork implements WorkspaceUnitOfWork {
  private readonly repository: DexieWorkspaceRepository;

  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly commands: AutomergeCommandHandler,
    private readonly projector: WorkspaceProjectionBuilder,
    private readonly clock: WorkspacePersistenceClock,
    private readonly signalOutbox: SignalWorkspaceOutbox = () => undefined,
    private readonly signalDomainEvents: SignalWorkspaceOutbox = () => undefined
  ) {
    this.repository = new DexieWorkspaceRepository(database);
  }

  async commit(
    command: WorkspaceCommand,
    events: readonly PersistableDomainEvent[] = []
  ): Promise<CommitResult> {
    const isolatedCommand = structuredClone(command);
    const workspaceId = requireNonEmpty(
      isolatedCommand.workspaceId,
      "workspaceId"
    );
    const actorId = requireNonEmpty(isolatedCommand.actorId, "actorId");
    const now = requireMetadataTime(this.clock.now());
    const eventRecords = events.map((event) =>
      normalizeEvent(workspaceId, event, now)
    );

    const artifacts = await this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceChanges,
        this.database.taskProjections,
        this.database.dailySelectionProjections,
        this.database.conflictProjections,
        this.database.auditProjections,
        this.database.dailyStatisticsProjections,
        this.database.syncOutbox,
        this.database.domainEvents,
        this.database.syncTargets,
        this.database.syncInbox,
        this.database.matrixEventIndex,
      ],
      async (): Promise<CommitArtifacts> => {
        const document = await this.repository.loadDocument(
          workspaceId,
          actorId,
          true
        );
        if (document === undefined) {
          throw new Error("Unable to initialize workspace document");
        }
        const changes = await Dexie.waitFor(
          this.commands.handle(document, isolatedCommand)
        );
        if (changes.length === 0) {
          return {
            result: {
              ...commitResult(workspaceId, [], document.heads()),
            },
            createdOutbox: false,
          };
        }
        const effectiveDate = this.clock.effectiveDate(document.value());
        if (!isValidDateOnly(effectiveDate)) {
          throw new Error("Invalid projection effective date");
        }
        const projection = cloneProjection(
          this.projector.project(document, effectiveDate, now)
        );

        await this.persistLocalChanges(workspaceId, changes, now);
        await this.database.workspaceSnapshots.put({
          workspaceId,
          schemaVersion: 1,
          bytes: document.save().slice(),
          heads: [...document.heads()],
          savedAt: now,
        });
        await this.replaceProjections(workspaceId, projection);

        const targets = (
          await this.database.syncTargets
            .where("workspaceId")
            .equals(workspaceId)
            .toArray()
        )
          .filter(({ mode, state }) => mode === "active" && state === "active")
          .sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0
          );
        const outbox = changes.flatMap((change) =>
          targets.map((target): SyncOutboxRecord => {
            const deterministicId = `${workspaceId}\0${target.id}\0${change.hash}`;
            return {
              id: deterministicId,
              workspaceId,
              targetId: target.id,
              changeHash: change.hash,
              innerType: "dev.lift.crdt.change.v1",
              authEpoch: 0,
              state: "pending",
              attemptCount: 0,
              nextAttemptAt: now,
              lastError: null,
              matrixTxnId: deterministicId,
              matrixEventIds: [],
              nextFragmentIndex: 0,
            };
          })
        );
        if (outbox.length > 0) {
          await this.database.syncOutbox.bulkAdd(outbox);
        }
        if (eventRecords.length > 0) {
          const nextSequence = new Map<string, number>();
          for (const record of eventRecords) {
            let sequence = nextSequence.get(record.aggregateId);
            if (sequence === undefined) {
              const latest = await this.database.domainEvents
                .where("[aggregateId+aggregateSequence]")
                .between(
                  [record.aggregateId, Dexie.minKey],
                  [record.aggregateId, Dexie.maxKey],
                  true,
                  true
                )
                .last();
              sequence = (latest?.aggregateSequence ?? 0) + 1;
            }
            record.aggregateSequence = sequence;
            nextSequence.set(record.aggregateId, sequence + 1);
          }
          await this.database.domainEvents.bulkAdd(
            eventRecords.map((record) => ({ ...record }))
          );
        }

        return {
          result: {
            ...commitResult(
              workspaceId,
              changes.map(({ hash }) => hash),
              document.heads()
            ),
          },
          createdOutbox: outbox.length > 0,
        };
      }
    );

    if (artifacts.createdOutbox) {
      try {
        await this.signalOutbox();
      } catch {
        // The durable row is already committed and will be retried later.
      }
    }
    if (eventRecords.length > 0) {
      try {
        await this.signalDomainEvents();
      } catch {
        // Event delivery is post-commit; a wake failure cannot undo user data.
      }
    }
    return {
      workspaceId: artifacts.result.workspaceId,
      changeHashes: [...artifacts.result.changeHashes],
      heads: [...artifacts.result.heads],
    };
  }

  async applyRemote(input: AcceptedRemoteChange): Promise<ApplyRemoteResult> {
    const remote = cloneRemote(input);
    const now = requireMetadataTime(this.clock.now());

    return this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceChanges,
        this.database.taskProjections,
        this.database.dailySelectionProjections,
        this.database.conflictProjections,
        this.database.auditProjections,
        this.database.dailyStatisticsProjections,
        this.database.syncOutbox,
        this.database.domainEvents,
        this.database.syncTargets,
        this.database.syncInbox,
        this.database.matrixEventIndex,
        this.database.quarantine,
      ],
      async (): Promise<ApplyRemoteResult> => {
        const activeTarget = await this.database.syncTargets
          .where("workspaceId")
          .equals(remote.workspaceId)
          .filter(
            ({ roomId, mode, state }) =>
              roomId === remote.roomId &&
              mode === "active" &&
              state === "active"
          )
          .first();
        if (activeTarget === undefined) {
          throw new Error("Remote event room is not the active sync target");
        }
        await this.assertEventIdentity(remote);
        const existing = await this.database.workspaceChanges.get([
          remote.workspaceId,
          remote.changeHash,
        ]);
        let document = await this.repository.loadDocument(
          remote.workspaceId,
          remote.actorId,
          true
        );
        if (document === undefined) {
          throw new Error("Unable to initialize workspace document");
        }

        const change: BinaryWorkspaceChange = {
          bytes: remote.bytes.slice(),
          hash: remote.changeHash,
          dependencies: [...remote.dependencies],
        };
        let before = new Set<string>();
        let after: Set<string> | undefined;
        const storedChangeCount = await this.database.workspaceChanges
          .where("workspaceId")
          .equals(remote.workspaceId)
          .count();
        for (let attempt = 0; attempt <= storedChangeCount; attempt += 1) {
          before = knownHashes(document);
          try {
            document.apply([change]);
            after = knownHashes(document);
            break;
          } catch (error: unknown) {
            if (!(error instanceof QuarantinedAutomergeChangeError)) {
              throw error;
            }
            await this.quarantineStoredChange(
              remote.workspaceId,
              error.hash,
              error.detail,
              now
            );
            if (error.hash === remote.changeHash) {
              await this.recordRemoteDelivery(
                remote,
                "quarantined",
                now,
                error.detail
              );
              await this.persistQuarantine(remote, error.detail, now);
              return remoteResult(
                remote.workspaceId,
                remote.changeHash,
                "quarantined",
                [],
                document.heads()
              );
            }
            const reloaded = await this.repository.loadDocument(
              remote.workspaceId,
              remote.actorId,
              true
            );
            if (reloaded === undefined) {
              throw new Error(
                "Unable to reconstruct workspace after quarantine"
              );
            }
            document = reloaded;
          }
        }
        if (after === undefined) {
          throw new Error("Unable to apply remote change after quarantine");
        }

        if (existing !== undefined) {
          const duplicateApplied = after.has(remote.changeHash);
          await this.recordRemoteDelivery(
            remote,
            duplicateApplied ? "handled" : "waiting-dependencies",
            now
          );
          return remoteResult(
            remote.workspaceId,
            remote.changeHash,
            duplicateApplied ? "duplicate" : "waiting-dependencies",
            [],
            document.heads()
          );
        }

        const appliedHashes = sortedDifference(after, before);
        const applied = after.has(remote.changeHash);

        const record: WorkspaceChangeRecord = {
          workspaceId: remote.workspaceId,
          changeHash: remote.changeHash,
          bytes: remote.bytes.slice(),
          dependencies: [...remote.dependencies],
          origin: "remote",
          createdAt: now,
        };
        await this.database.workspaceChanges.add(record);
        await this.recordRemoteDelivery(
          remote,
          applied ? "handled" : "waiting-dependencies",
          now
        );

        if (applied) {
          const effectiveDate = this.clock.effectiveDate(document.value());
          if (!isValidDateOnly(effectiveDate)) {
            throw new Error("Invalid projection effective date");
          }
          const projection = cloneProjection(
            this.projector.project(document, effectiveDate, now)
          );
          await this.database.workspaceSnapshots.put({
            workspaceId: remote.workspaceId,
            schemaVersion: 1,
            bytes: document.save().slice(),
            heads: [...document.heads()],
            savedAt: now,
          });
          await this.replaceProjections(remote.workspaceId, projection);
          await this.markAppliedInboxRecordsHandled(
            remote.workspaceId,
            appliedHashes
          );
        } else if (
          (await this.database.workspaceSnapshots.get(remote.workspaceId)) ===
          undefined
        ) {
          await this.database.workspaceSnapshots.put({
            workspaceId: remote.workspaceId,
            schemaVersion: 1,
            bytes: document.save().slice(),
            heads: [...document.heads()],
            savedAt: now,
          });
        }

        return remoteResult(
          remote.workspaceId,
          remote.changeHash,
          applied ? "applied" : "waiting-dependencies",
          appliedHashes,
          document.heads()
        );
      }
    );
  }

  async rebuildProjections(
    workspaceIdValue: string,
    actorIdValue: string
  ): Promise<void> {
    const workspaceId = requireNonEmpty(workspaceIdValue, "workspaceId");
    const actorId = requireNonEmpty(actorIdValue, "actorId");
    const now = requireMetadataTime(this.clock.now());
    await this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceChanges,
        this.database.taskProjections,
        this.database.dailySelectionProjections,
        this.database.conflictProjections,
        this.database.auditProjections,
        this.database.dailyStatisticsProjections,
      ],
      async () => {
        const document = await this.repository.loadDocument(
          workspaceId,
          actorId
        );
        if (document === undefined) {
          throw new Error(`Workspace not found: ${workspaceId}`);
        }
        const effectiveDate = this.clock.effectiveDate(document.value());
        if (!isValidDateOnly(effectiveDate)) {
          throw new Error("Invalid projection effective date");
        }
        const projection = cloneProjection(
          this.projector.project(document, effectiveDate, now)
        );
        await this.replaceProjections(workspaceId, projection);
      }
    );
  }

  private async persistLocalChanges(
    workspaceId: string,
    changes: readonly BinaryWorkspaceChange[],
    now: number
  ): Promise<void> {
    const records: WorkspaceChangeRecord[] = changes.map((change) => ({
      workspaceId,
      changeHash: change.hash,
      bytes: change.bytes.slice(),
      dependencies: [...change.dependencies],
      origin: "local",
      createdAt: now,
    }));
    await this.database.workspaceChanges.bulkAdd(records);
  }

  private async replaceProjections(
    workspaceId: string,
    projection: WorkspaceProjection
  ): Promise<void> {
    await this.database.taskProjections
      .filter((record) => record.workspaceId === workspaceId)
      .delete();
    await this.database.dailySelectionProjections
      .filter((record) => record.workspaceId === workspaceId)
      .delete();
    await this.database.conflictProjections
      .filter((record) => record.workspaceId === workspaceId)
      .delete();
    await this.database.auditProjections
      .filter((record) => record.workspaceId === workspaceId)
      .delete();
    await this.database.dailyStatisticsProjections
      .filter((record) => record.workspaceId === workspaceId)
      .delete();
    if (projection.tasks.length > 0) {
      await this.database.taskProjections.bulkAdd(
        projection.tasks.map((task) => ({ ...task, tags: [...task.tags] }))
      );
    }
    if (projection.dailySelections.length > 0) {
      await this.database.dailySelectionProjections.bulkAdd(
        projection.dailySelections.map((selection) => ({ ...selection }))
      );
    }
    if (projection.conflicts.length > 0) {
      await this.database.conflictProjections.bulkAdd(
        projection.conflicts.map((conflict) => ({
          ...conflict,
          alternativeValues: [...conflict.alternativeValues],
        }))
      );
    }
    if (projection.audit.length > 0) {
      await this.database.auditProjections.bulkAdd(
        projection.audit.map((record) => ({
          ...record,
          data: { ...record.data },
        }))
      );
    }
    if (projection.dailyStatistics.length > 0) {
      await this.database.dailyStatisticsProjections.bulkAdd(
        projection.dailyStatistics.map((record) => ({ ...record }))
      );
    }
  }

  private async assertEventIdentity(
    input: AcceptedRemoteChange
  ): Promise<void> {
    const index = await this.database.matrixEventIndex.get(input.eventId);
    if (
      index !== undefined &&
      (index.workspaceId !== input.workspaceId ||
        index.changeHash !== input.changeHash ||
        index.roomId !== input.roomId)
    ) {
      throw new Error("Matrix event identity is already bound to other data");
    }
    const inbox = await this.database.syncInbox.get(input.eventId);
    if (
      inbox !== undefined &&
      inbox.workspaceId !== null &&
      inbox.workspaceId !== input.workspaceId
    ) {
      throw new Error("Inbox event belongs to a different workspace");
    }
  }

  private async recordRemoteDelivery(
    input: AcceptedRemoteChange,
    state: "waiting-dependencies" | "handled" | "quarantined",
    now: number,
    detail?: string
  ): Promise<void> {
    const existingInbox = await this.database.syncInbox.get(input.eventId);
    const inbox: SyncInboxRecord = {
      eventId: input.eventId,
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      wireEvent: input.wireEvent ?? existingInbox?.wireEvent ?? "{}",
      state,
      receivedAt: existingInbox?.receivedAt ?? now,
      lastError:
        state === "waiting-dependencies"
          ? "missing dependencies"
          : state === "quarantined"
            ? (detail ?? "invalid schema")
            : null,
    };
    const index: MatrixEventIndexRecord = {
      eventId: input.eventId,
      workspaceId: input.workspaceId,
      changeHash: input.changeHash,
      roomId: input.roomId,
      senderUserId: input.senderUserId,
      senderDeviceId: input.senderDeviceId,
      receivedAt: now,
    };
    await this.database.syncInbox.put(inbox);
    await this.database.matrixEventIndex.put(index);
  }

  private async quarantineStoredChange(
    workspaceId: string,
    changeHash: string,
    detail: string,
    now: number
  ): Promise<void> {
    await this.database.workspaceChanges.delete([workspaceId, changeHash]);
    const indexes = await this.database.matrixEventIndex
      .where("[workspaceId+changeHash]")
      .equals([workspaceId, changeHash])
      .toArray();
    for (const index of indexes) {
      const inbox = await this.database.syncInbox.get(index.eventId);
      if (inbox !== undefined) {
        await this.database.syncInbox.put({
          ...inbox,
          state: "quarantined",
          lastError: detail,
        });
      }
      await this.database.quarantine.put({
        id: `${workspaceId}\0${changeHash}\0${index.eventId}`,
        eventId: index.eventId,
        workspaceId,
        reason: "invalid-schema",
        detail,
        createdAt: now,
      });
    }
  }

  private async persistQuarantine(
    input: AcceptedRemoteChange,
    detail: string,
    now: number
  ): Promise<void> {
    const record: QuarantineRecord = {
      id: `${input.workspaceId}\0${input.changeHash}\0${input.eventId}`,
      eventId: input.eventId,
      workspaceId: input.workspaceId,
      reason: "invalid-schema",
      detail,
      createdAt: now,
    };
    await this.database.quarantine.put(record);
  }

  private async markAppliedInboxRecordsHandled(
    workspaceId: string,
    appliedHashes: readonly string[]
  ): Promise<void> {
    for (const hash of appliedHashes) {
      const indexes = await this.database.matrixEventIndex
        .where("[workspaceId+changeHash]")
        .equals([workspaceId, hash])
        .toArray();
      for (const index of indexes) {
        const inbox = await this.database.syncInbox.get(index.eventId);
        if (inbox !== undefined) {
          await this.database.syncInbox.put({
            ...inbox,
            state: "handled",
            lastError: null,
          });
        }
      }
    }
  }
}
