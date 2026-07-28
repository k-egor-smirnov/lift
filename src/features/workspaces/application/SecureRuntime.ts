import type { UpdateWorkspaceSettingsUseCase } from "../../settings/application/use-cases/UpdateWorkspaceSettingsUseCase";
import type { AddTaskToTodayUseCase } from "../../../shared/application/use-cases/AddTaskToTodayUseCase";
import type { CompleteTaskUseCase } from "../../../shared/application/use-cases/CompleteTaskUseCase";
import type { CreateTaskUseCase } from "../../../shared/application/use-cases/CreateTaskUseCase";
import type { DeferTaskUseCase } from "../../../shared/application/use-cases/DeferTaskUseCase";
import type { DeleteTaskUseCase } from "../../../shared/application/use-cases/DeleteTaskUseCase";
import type { GetTodayTasksUseCase } from "../../../shared/application/use-cases/GetTodayTasksUseCase";
import type { RemoveTaskFromTodayUseCase } from "../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import type { ReorderTasksUseCase } from "../../../shared/application/use-cases/ReorderTasksUseCase";
import type { RevertTaskCompletionUseCase } from "../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import type { UndeferTaskUseCase } from "../../../shared/application/use-cases/UndeferTaskUseCase";
import type { UpdateTaskUseCase } from "../../../shared/application/use-cases/UpdateTaskUseCase";
import type { ChangeTaskNoteUseCase } from "../../../shared/application/use-cases/ChangeTaskNoteUseCase";
import type { ChangeTaskTitleUseCase } from "../../../shared/application/use-cases/ChangeTaskTitleUseCase";
import type { UpdateTaskTagsUseCase } from "../../../shared/application/use-cases/UpdateTaskTagsUseCase";
import type { GetTaskLogsUseCase } from "../../../shared/application/use-cases/GetTaskLogsUseCase";
import type { CreateUserLogUseCase } from "../../../shared/application/use-cases/CreateUserLogUseCase";
import type { StatisticsService } from "../../stats/application/services/StatisticsService";
import type { WorkspaceTaskReadModel } from "./ports/WorkspaceRepository";
import type { MatrixSession } from "./ports/MatrixSession";
import type { SyncHealth } from "./queries/GetSyncHealthQuery";
import type { WorkspaceAclCheckpoint } from "../domain/WorkspaceAcl";
import type { InviteWorkspaceMemberUseCase } from "./use-cases/InviteWorkspaceMemberUseCase";
import type { ChangeWorkspaceRoleUseCase } from "./use-cases/ChangeWorkspaceRoleUseCase";
import type { TransferWorkspaceOwnershipUseCase } from "./use-cases/TransferWorkspaceOwnershipUseCase";
import type { RemoveWorkspaceMemberUseCase } from "./use-cases/RemoveWorkspaceMemberUseCase";
import type { RevokeWorkspaceDeviceUseCase } from "./use-cases/RevokeWorkspaceDeviceUseCase";
import type { CreateCheckpointUseCase } from "./use-cases/CreateCheckpointUseCase";
import type { RestoreCheckpointUseCase } from "./use-cases/RestoreCheckpointUseCase";

export interface SecureRuntimeMatrixProfile {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
}

export interface SecureSyncDiagnostics {
  readonly matrixPhase: string;
  readonly matrixSyncState: string;
  readonly matrixLive: boolean;
  readonly inboxLifecycle: string;
  readonly pendingOutbox: number;
  readonly acknowledgedOutbox: number;
  readonly pendingInbox: number;
  readonly pendingReasons: readonly string[];
  readonly pendingStates: readonly string[];
  readonly waitingKeys: number;
  readonly quarantined: number;
  readonly pausedAuthorization: number;
  readonly conflicts: number;
  readonly deadLetters: number;
  readonly quarantineReasons: readonly string[];
}

export interface SecureRuntimeUseCases {
  readonly createTask: CreateTaskUseCase;
  readonly updateTask: UpdateTaskUseCase;
  readonly changeTaskTitle: ChangeTaskTitleUseCase;
  readonly changeTaskNote: ChangeTaskNoteUseCase;
  readonly updateTaskTags: UpdateTaskTagsUseCase;
  readonly deleteTask: DeleteTaskUseCase;
  readonly reorderTasks: ReorderTasksUseCase;
  readonly completeTask: CompleteTaskUseCase;
  readonly reopenTask: RevertTaskCompletionUseCase;
  readonly getTodayTasks: GetTodayTasksUseCase;
  readonly addTaskToToday: AddTaskToTodayUseCase;
  readonly removeTaskFromToday: RemoveTaskFromTodayUseCase;
  readonly deferTask: DeferTaskUseCase;
  readonly undeferTask: UndeferTaskUseCase;
  readonly updateWorkspaceSettings: UpdateWorkspaceSettingsUseCase;
  readonly getTaskLogs: GetTaskLogsUseCase;
  readonly createUserLog: CreateUserLogUseCase;
  readonly statistics: StatisticsService;
  readonly inviteWorkspaceMember: InviteWorkspaceMemberUseCase;
  readonly changeWorkspaceRole: ChangeWorkspaceRoleUseCase;
  readonly transferWorkspaceOwnership: TransferWorkspaceOwnershipUseCase;
  readonly removeWorkspaceMember: RemoveWorkspaceMemberUseCase;
  readonly revokeWorkspaceDevice: RevokeWorkspaceDeviceUseCase;
  readonly createCheckpoint: CreateCheckpointUseCase;
  readonly restoreCheckpoint: RestoreCheckpointUseCase;
}

/** Application-facing facade. Infrastructure stays behind the composition root. */
export interface SecureRuntime {
  readonly useCases: SecureRuntimeUseCases;
  readonly matrixSession: MatrixSession;
  readonly matrixProfiles: readonly SecureRuntimeMatrixProfile[];
  readonly allowOfflineWorkspaceCreation: boolean;
  workspaceId(): string | null;
  createWorkspace(settings: {
    readonly timezone: string;
    readonly startOfDay: string;
  }): Promise<string>;
  effectiveDate(): Promise<string>;
  findTasks(): Promise<readonly WorkspaceTaskReadModel[]>;
  workspaceSettings(): Promise<{
    readonly timezone: string;
    readonly startOfDay: string;
  }>;
  workspaceAcl(): Promise<WorkspaceAclCheckpoint>;
  syncDiagnostics(): Promise<SecureSyncDiagnostics>;
  syncHealth(): Promise<SyncHealth>;
  stop(): Promise<void>;
}
