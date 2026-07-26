export interface CurrentActorIdentity {
  readonly actorId: string;
  readonly deviceId: string;
}

/** Supplies stable authorship and fresh metadata for semantic commands. */
export interface CurrentActor {
  require(): CurrentActorIdentity;
  nextOperationId(): string;
  auditTime(): string;
}
