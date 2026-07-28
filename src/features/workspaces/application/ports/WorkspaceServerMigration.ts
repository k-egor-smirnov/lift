import type { MigrationMemberMapping } from "../../domain/ServerMigration";

export interface WorkspaceServerMigrationRequest {
  readonly workspaceId: string;
  readonly targetProfileId: string;
  readonly username: string;
  readonly password: string;
  readonly recoveryKey: string;
  readonly memberMappings: readonly MigrationMemberMapping[];
}

export interface WorkspaceServerMigrationResult {
  readonly sourceTargetId: string;
  readonly targetTargetId: string;
  readonly checkpointHash: string;
  readonly certificateHash: string;
  readonly targetHeads: readonly string[];
}

export interface WorkspaceServerMigration {
  migrate(
    input: WorkspaceServerMigrationRequest
  ): Promise<WorkspaceServerMigrationResult>;
}
