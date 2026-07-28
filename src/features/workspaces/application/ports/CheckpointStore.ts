export interface PublishedCheckpoint {
  readonly hash: string;
  readonly workspaceId: string;
  readonly authEpoch: number;
  readonly heads: readonly string[];
}

export interface RestoredCheckpoint {
  readonly workspaceId: string;
  readonly checkpointHashes: readonly string[];
  readonly heads: readonly string[];
}

export interface CheckpointStore {
  publish(workspaceId: string): Promise<PublishedCheckpoint>;
  restoreLatest(workspaceId: string): Promise<RestoredCheckpoint>;
}
