import type { CurrentWorkspace } from "../ports/CurrentWorkspace";
import type {
  WorkspaceServerMigration,
  WorkspaceServerMigrationRequest,
  WorkspaceServerMigrationResult,
} from "../ports/WorkspaceServerMigration";

export type MigrateWorkspaceServerInput = Omit<
  WorkspaceServerMigrationRequest,
  "workspaceId"
>;

export class MigrateWorkspaceServerUseCase {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly migration: WorkspaceServerMigration
  ) {}

  execute(
    input: MigrateWorkspaceServerInput
  ): Promise<WorkspaceServerMigrationResult> {
    return this.migration.migrate({
      ...input,
      workspaceId: this.workspace.requireId(),
    });
  }
}
