import Dexie, { type Table } from "dexie";

import type {
  AclCheckpointRecord,
  AuditProjectionRecord,
  ConflictProjectionRecord,
  DailySelectionProjectionRecord,
  DailyStatisticsProjectionRecord,
  DomainEventRecord,
  HandledDomainEventRecord,
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
  VerifiedCheckpointRecord,
} from "./records";

const DEFAULT_DATABASE_NAME = "LiftSecureDatabase";
const TEST_DATABASE_NAME_PREFIX = `${DEFAULT_DATABASE_NAME}-`;

export class InvalidLiftSecureDatabaseNameError extends Error {
  constructor(name: string) {
    super(
      `Invalid LiftSecureDatabase name "${name}": expected "${DEFAULT_DATABASE_NAME}" or its hyphenated namespace`
    );
    this.name = "InvalidLiftSecureDatabaseNameError";
  }
}

const requireSecureDatabaseName = (name: string): string => {
  if (
    name !== DEFAULT_DATABASE_NAME &&
    !name.startsWith(TEST_DATABASE_NAME_PREFIX)
  ) {
    throw new InvalidLiftSecureDatabaseNameError(name);
  }

  return name;
};

export class LiftSecureDatabase extends Dexie {
  workspaceSnapshots!: Table<WorkspaceSnapshotRecord, string>;
  workspaceChanges!: Table<WorkspaceChangeRecord, [string, string]>;
  syncOutbox!: Table<SyncOutboxRecord, string>;
  syncInbox!: Table<SyncInboxRecord, string>;
  matrixEventIndex!: Table<MatrixEventIndexRecord, string>;
  syncTargets!: Table<SyncTargetRecord, string>;
  aclCheckpoints!: Table<AclCheckpointRecord, [string, number]>;
  verifiedCheckpoints!: Table<VerifiedCheckpointRecord, string>;
  quarantine!: Table<QuarantineRecord, string>;
  taskProjections!: Table<TaskProjectionRecord, [string, string]>;
  dailySelectionProjections!: Table<
    DailySelectionProjectionRecord,
    [string, string, string]
  >;
  conflictProjections!: Table<ConflictProjectionRecord, string>;
  auditProjections!: Table<
    AuditProjectionRecord,
    [string, "audit" | "completion", string]
  >;
  dailyStatisticsProjections!: Table<
    DailyStatisticsProjectionRecord,
    [string, string]
  >;
  payloadFragments!: Table<PayloadFragmentRecord, [string, string, number]>;
  serverProfiles!: Table<ServerProfileRecord, string>;
  localSecrets!: Table<LocalSecretRecord, string>;
  domainEvents!: Table<DomainEventRecord, string>;
  handledDomainEvents!: Table<HandledDomainEventRecord, [string, string]>;

  constructor(name = DEFAULT_DATABASE_NAME) {
    super(requireSecureDatabaseName(name));

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
      verifiedCheckpoints:
        "&hash, [workspaceId+authEpoch], workspaceId, verifiedAt",
      quarantine: "&id, eventId, workspaceId, reason, createdAt",
      taskProjections:
        "&[workspaceId+taskId], [workspaceId+category], [workspaceId+completion], [workspaceId+positionKey]",
      dailySelectionProjections:
        "&[workspaceId+date+taskId], [workspaceId+date]",
      conflictProjections: "&id, [workspaceId+taskId], path",
      auditProjections:
        "&[workspaceId+source+recordId], [workspaceId+auditTime], [workspaceId+taskId], [workspaceId+kind]",
      dailyStatisticsProjections: "&[workspaceId+date], workspaceId",
      payloadFragments:
        "&[direction+transferId+index], [direction+transferId], workspaceId, changeHash",
      serverProfiles: "&id, baseUrl",
      localSecrets: "&id, serverProfileId",
      domainEvents:
        "&id, [workspaceId+status], [status+nextAttemptAt], [aggregateId+aggregateSequence]",
      handledDomainEvents: "&[eventId+handlerId], eventId, handlerId",
    });
  }
}
