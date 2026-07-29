import type { CurrentActor } from "../../../features/workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../features/workspaces/application/ports/CurrentWorkspace";
import type { EffectiveDateProvider } from "../../../features/workspaces/application/ports/EffectiveDateProvider";
import type {
  WorkspaceRepository,
  WorkspaceTaskReadModel,
} from "../../../features/workspaces/application/ports/WorkspaceRepository";
import { isValidDateOnly } from "../../../features/workspaces/domain/EffectiveDate";
import { Result, ResultUtils } from "../../domain/Result";
import { errorMessage } from "./BaseTaskUseCase";

export interface GetTodayTasksRequest {
  readonly date?: string;
  readonly includeCompleted?: boolean;
}

export interface GetTodayTasksResponse {
  readonly tasks: readonly WorkspaceTaskReadModel[];
  readonly date: string;
  readonly totalCount: number;
  readonly completedCount: number;
  readonly activeCount: number;
}

export class GetTodayTasksError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "GetTodayTasksError";
  }
}

export class GetTodayTasksUseCase {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly repository: WorkspaceRepository,
    private readonly actor: CurrentActor,
    private readonly effectiveDates: EffectiveDateProvider
  ) {}

  async execute(
    request: GetTodayTasksRequest = {}
  ): Promise<Result<GetTodayTasksResponse, GetTodayTasksError>> {
    if (request.date !== undefined && !isValidDateOnly(request.date)) {
      return ResultUtils.error(
        new GetTodayTasksError("Invalid date format", "INVALID_DATE")
      );
    }

    try {
      const workspaceId = this.workspace.requireId();
      let date = request.date;
      if (date === undefined) {
        const identity = this.actor.require();
        const workspace = await this.repository.getWorkspace(
          workspaceId,
          identity.actorId
        );
        if (workspace === undefined) {
          return ResultUtils.error(
            new GetTodayTasksError("Workspace not found", "WORKSPACE_NOT_FOUND")
          );
        }
        date = this.effectiveDates.current(workspace.state.settings);
      }
      if (!isValidDateOnly(date)) {
        return ResultUtils.error(
          new GetTodayTasksError("Invalid date format", "INVALID_DATE")
        );
      }

      const [selectedIds, projectedTasks] = await Promise.all([
        this.repository.getTaskIdsForDay(workspaceId, date),
        this.repository.findTasks({ workspaceId, effectiveDate: date }),
      ]);
      const selected = new Set(selectedIds);
      const tasks = projectedTasks.filter(
        (task) =>
          selected.has(task.taskId) &&
          (request.includeCompleted !== false || task.completion === "active")
      );
      const completedCount = tasks.filter(
        (task) => task.completion === "completed"
      ).length;

      return ResultUtils.ok({
        tasks,
        date,
        totalCount: tasks.length,
        completedCount,
        activeCount: tasks.length - completedCount,
      });
    } catch (error) {
      return ResultUtils.error(
        new GetTodayTasksError(
          `Failed to get today's tasks: ${errorMessage(error)}`,
          "GET_FAILED"
        )
      );
    }
  }
}
