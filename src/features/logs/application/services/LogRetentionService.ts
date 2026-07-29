export interface LogCleanupStats {
  readonly projectionsDeleted: number;
  readonly checkpointId: string;
}

export interface VerifiedAuditProjectionCompactor {
  /** Compacts disposable rows only after their CRDT history is checkpointed. */
  compactDisposableAuditProjections(): Promise<LogCleanupStats>;
}

/** Explicit local maintenance; never deletes authoritative audit history. */
export class LogRetentionService {
  constructor(private readonly compactor: VerifiedAuditProjectionCompactor) {}

  runCleanup(): Promise<LogCleanupStats> {
    return this.compactor.compactDisposableAuditProjections();
  }
}
