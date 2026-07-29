import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type {
  WorkspaceRepository,
  WorkspaceTaskReadModel,
} from "../../../features/workspaces/application/ports/WorkspaceRepository";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";

/** Read-only deferred-task projection. Due tasks appear in their base category. */
export class DeferredTaskService {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly repository: WorkspaceRepository
  ) {}

  async getDeferredTasks(
    effectiveDate: string
  ): Promise<readonly WorkspaceTaskReadModel[]> {
    if (!isValidDateOnly(effectiveDate)) {
      throw new Error("Invalid effective date");
    }

    return this.repository.findTasks({
      workspaceId: this.workspace.requireId(),
      effectiveDate,
      projectedCategory: "DEFERRED",
      completion: "active",
    });
  }
}
