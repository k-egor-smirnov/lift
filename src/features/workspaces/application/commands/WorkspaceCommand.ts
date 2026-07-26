export type WorkspaceTaskCategory = "INBOX" | "SIMPLE" | "FOCUS";
export type WorkspaceTaskTextPath = "title" | "note";

interface WorkspaceCommandBase {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly operationId: string;
}

interface PositionedCommand {
  readonly leftTaskId?: string | null;
  readonly rightTaskId?: string | null;
}

export interface CreateTaskCommand
  extends WorkspaceCommandBase, PositionedCommand {
  readonly type: "CreateTask";
  readonly taskId: string;
  readonly title: string;
  readonly note?: string;
  readonly category: WorkspaceTaskCategory;
  readonly effectiveDate: string;
  /** When present, task creation and day selection are one CRDT transaction. */
  readonly addToDate?: string;
  readonly deviceId: string;
  readonly auditTime: string;
}

export interface SpliceTaskTextCommand extends WorkspaceCommandBase {
  readonly type: "SpliceTaskText";
  readonly taskId: string;
  readonly path: WorkspaceTaskTextPath;
  /** Automerge heads of the exact text value used to calculate this splice. */
  readonly baseHeads: readonly string[];
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
}

export interface ChangeTaskCategoryCommand extends WorkspaceCommandBase {
  readonly type: "ChangeTaskCategory";
  readonly taskId: string;
  readonly fromCategory: WorkspaceTaskCategory;
  readonly category: WorkspaceTaskCategory;
  readonly effectiveDate: string;
  readonly auditTime: string;
}

export interface MoveTaskCommand
  extends WorkspaceCommandBase, PositionedCommand {
  readonly type: "MoveTask";
  readonly taskId: string;
}

export interface CompleteTaskCommand extends WorkspaceCommandBase {
  readonly type: "CompleteTask";
  readonly taskId: string;
  readonly effectiveDate: string;
  readonly auditTime: string;
  readonly categoryAtCompletion: WorkspaceTaskCategory;
}

export interface ReopenTaskCommand extends WorkspaceCommandBase {
  readonly type: "ReopenTask";
  readonly taskId: string;
  readonly effectiveDate: string;
  readonly auditTime: string;
}

export interface DeferTaskCommand extends WorkspaceCommandBase {
  readonly type: "DeferTask";
  readonly taskId: string;
  readonly deferredUntil: string | null;
}

export interface DeleteTaskCommand extends WorkspaceCommandBase {
  readonly type: "DeleteTask";
  readonly taskId: string;
}

export interface AddTagCommand extends WorkspaceCommandBase {
  readonly type: "AddTag";
  readonly taskId: string;
  readonly tag: string;
}

export interface RemoveTagCommand extends WorkspaceCommandBase {
  readonly type: "RemoveTag";
  readonly taskId: string;
  readonly tag: string;
}

export interface AddToDayCommand extends WorkspaceCommandBase {
  readonly type: "AddToDay";
  readonly taskId: string;
  readonly date: string;
}

export interface RemoveFromDayCommand extends WorkspaceCommandBase {
  readonly type: "RemoveFromDay";
  readonly taskId: string;
  readonly date: string;
}

interface UpdateWorkspaceSettingsCommandBase extends WorkspaceCommandBase {
  readonly type: "UpdateWorkspaceSettings";
  readonly auditTime: string;
}

export type UpdateWorkspaceSettingsCommand =
  UpdateWorkspaceSettingsCommandBase &
    (
      | { readonly timezone: string; readonly startOfDay?: string }
      | { readonly timezone?: string; readonly startOfDay: string }
    ) & {
      readonly fromTimezone?: string;
      readonly fromStartOfDay?: string;
    };

export interface MaterializeOccurrenceCommand
  extends WorkspaceCommandBase, PositionedCommand {
  readonly type: "MaterializeOccurrence";
  readonly templateId: string;
  readonly occurrenceDate: string;
  readonly deviceId: string;
  readonly auditTime: string;
}

export interface AppendAuditRecordCommand extends WorkspaceCommandBase {
  readonly type: "AppendAuditRecord";
  readonly auditRecordId?: string;
  readonly auditKind: string;
  readonly auditTime: string;
  readonly taskId: string | null;
  readonly effectiveDate: string | null;
  readonly data: Readonly<Record<string, string>>;
}

/** The exhaustive semantic mutation boundary for one workspace document. */
export type WorkspaceCommand =
  | CreateTaskCommand
  | SpliceTaskTextCommand
  | ChangeTaskCategoryCommand
  | MoveTaskCommand
  | CompleteTaskCommand
  | ReopenTaskCommand
  | DeferTaskCommand
  | DeleteTaskCommand
  | AddTagCommand
  | RemoveTagCommand
  | AddToDayCommand
  | RemoveFromDayCommand
  | UpdateWorkspaceSettingsCommand
  | MaterializeOccurrenceCommand
  | AppendAuditRecordCommand;
