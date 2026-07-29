import type { WorkspaceCommand } from "../commands/WorkspaceCommand";
import type { ChangeHash, WorkspaceId } from "../../domain/WorkspaceIdentity";

export interface PersistableDomainEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateType?: string;
  readonly eventType: string;
  readonly occurredAt: Date | number;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly getEventData?: () => Readonly<Record<string, unknown>>;
}

export interface CommitResult {
  readonly workspaceId: WorkspaceId;
  readonly changeHashes: readonly ChangeHash[];
  readonly heads: readonly ChangeHash[];
}

export interface AcceptedRemoteChange {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly eventId: string;
  readonly roomId: string;
  readonly senderUserId: string;
  readonly senderDeviceId: string | null;
  readonly wireEvent?: string;
  readonly bytes: Uint8Array;
  readonly changeHash: string;
  readonly dependencies: readonly string[];
}

export interface ApplyRemoteResult {
  readonly workspaceId: WorkspaceId;
  readonly changeHash: ChangeHash;
  readonly status:
    "applied" | "duplicate" | "waiting-dependencies" | "quarantined";
  readonly appliedChangeHashes: readonly ChangeHash[];
  readonly heads: readonly ChangeHash[];
}

export interface WorkspaceUnitOfWork {
  commit(
    command: WorkspaceCommand,
    events?: readonly PersistableDomainEvent[]
  ): Promise<CommitResult>;
  applyRemote(input: AcceptedRemoteChange): Promise<ApplyRemoteResult>;
}
