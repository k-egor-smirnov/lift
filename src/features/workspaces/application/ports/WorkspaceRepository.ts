import type { WorkspaceState } from "../../domain/WorkspaceState";

export interface WorkspaceTaskQuery {
  readonly workspaceId: string;
  readonly effectiveDate: string;
  readonly projectedCategory?: "INBOX" | "SIMPLE" | "FOCUS" | "DEFERRED";
  readonly completion?: "active" | "completed";
}

export interface WorkspaceTaskReadModel {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly title: string;
  readonly note: string;
  readonly tags: readonly string[];
  readonly category: "INBOX" | "SIMPLE" | "FOCUS" | "DEFERRED";
  readonly completion: "active" | "completed";
  readonly positionKey: string;
  readonly deferredUntil: string | null;
  readonly inboxEnteredOn: string | null;
}

export interface WorkspaceReadModel {
  readonly state: Readonly<WorkspaceState>;
  readonly heads: readonly string[];
}

export interface WorkspaceRepository {
  getWorkspace(
    workspaceId: string,
    actorId: string
  ): Promise<WorkspaceReadModel | undefined>;
  findTask(
    workspaceId: string,
    taskId: string,
    effectiveDate: string
  ): Promise<WorkspaceTaskReadModel | undefined>;
  findTasks(
    query: WorkspaceTaskQuery
  ): Promise<readonly WorkspaceTaskReadModel[]>;
  getTaskIdsForDay(
    workspaceId: string,
    date: string
  ): Promise<readonly string[]>;
}
