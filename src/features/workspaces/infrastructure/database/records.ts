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
    "dev.lift.crdt.change.v1" | "dev.lift.checkpoint.v1" | "dev.lift.acl.v1";
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

export interface MatrixEventIndexRecord {
  eventId: string;
  workspaceId: string;
  changeHash: string;
  roomId: string;
  senderUserId: string;
  senderDeviceId: string | null;
  receivedAt: number;
}

export interface SyncTargetRecord {
  id: string;
  workspaceId: string;
  serverProfileId: string;
  roomId: string;
  mode: "candidate" | "preparing" | "active" | "read-only";
  state: "active" | "paused" | "retired";
  createdAt: number;
  updatedAt: number;
}

export interface MigrationCertificateRecord {
  hash: string;
  workspaceId: string;
  sourceTargetId: string;
  targetTargetId: string;
  sourceAclHash: string;
  targetAclHash: string;
  heads: string[];
  bytes: Uint8Array;
  sourceEventId: string;
  targetEventId: string;
  verifiedAt: number;
}

export interface AclCheckpointRecord {
  workspaceId: string;
  authEpoch: number;
  hash: string;
  previousHash: string | null;
  bytes: Uint8Array;
  createdAt: number;
}

export interface VerifiedCheckpointRecord {
  hash: string;
  workspaceId: string;
  schemaVersion: 1;
  authEpoch: number;
  heads: string[];
  coveredChangeHashes: string[];
  compressedSnapshot: Uint8Array;
  matrixEventIds: string[];
  verifiedAt: number;
}

export interface CheckpointPublicationRecord {
  id: string;
  hash: string;
  workspaceId: string;
  targetId: string;
  schemaVersion: 1;
  authEpoch: number;
  heads: string[];
  coveredChangeHashes: string[];
  compressedSnapshot: Uint8Array;
  createdAt: number;
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

export interface TaskProjectionRecord {
  workspaceId: string;
  taskId: string;
  title: string;
  note: string;
  tags: string[];
  category: "INBOX" | "SIMPLE" | "FOCUS" | "DEFERRED";
  completion: "active" | "completed";
  positionKey: string;
  deferredUntil: string | null;
  inboxEnteredOn: string | null;
  deleted: boolean;
  updatedAt: number;
}

export interface AuditProjectionRecord {
  workspaceId: string;
  source: "audit" | "completion";
  recordId: string;
  taskId: string | null;
  effectiveDate: string | null;
  kind: string;
  actorId: string;
  auditTime: string;
  data: Record<string, string>;
}

export interface DailyStatisticsProjectionRecord {
  workspaceId: string;
  date: string;
  simpleCompleted: number;
  focusCompleted: number;
  inboxReviewed: number;
}

export interface DailySelectionProjectionRecord {
  workspaceId: string;
  date: string;
  taskId: string;
  selected: boolean;
  updatedAt: number;
}

export interface ConflictProjectionRecord {
  id: string;
  workspaceId: string;
  taskId: string;
  path: string;
  winningValue: string;
  alternativeValues: string[];
  state: "unresolved" | "resolved";
  detectedAt: number;
  resolvedAt: number | null;
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

export interface ServerProfileRecord {
  id: string;
  name: string;
  baseUrl: string;
  sessionUserId?: string;
  sessionDeviceId?: string;
  sessionUpdatedAt?: number;
}

interface LocalSecretRecordBase {
  id: string;
  serverProfileId: string;
  schemaVersion: 1;
  createdAt: number;
  updatedAt: number;
}

export interface LocalWrappingKeyRecord extends LocalSecretRecordBase {
  kind: "wrapping-key";
  key: CryptoKey;
}

export interface AesGcmCiphertextRecord extends LocalSecretRecordBase {
  kind: "aes-gcm-ciphertext";
  wrappingKeyId: string;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

export type LocalSecretRecord = LocalWrappingKeyRecord | AesGcmCiphertextRecord;

export interface DomainEventRecord {
  id: string;
  workspaceId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  aggregateSequence: number;
  payload: string;
  occurredAt: number;
  status: "pending" | "processing" | "done" | "dead";
  attemptCount: number;
  nextAttemptAt: number;
  leaseUntil: number | null;
  lastError: string | null;
}

export interface HandledDomainEventRecord {
  eventId: string;
  handlerId: string;
  handledAt: number;
}
