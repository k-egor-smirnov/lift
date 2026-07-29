export interface OfflineWorkspaceCandidate {
  readonly workspaceId: string;
  readonly createdAt: number;
  readonly createdAtSource: "metadata" | "estimated";
  readonly taskCount: number;
}

export interface OfflineWorkspaceTask {
  readonly sourceTaskId: string;
  readonly title: string;
  readonly note: string;
  readonly category: "INBOX" | "SIMPLE" | "FOCUS";
  readonly deferredUntil: string | null;
  readonly originalCategory: "INBOX" | "SIMPLE" | "FOCUS" | null;
  readonly completion: "active" | "completed";
  readonly inboxEnteredOn: string | null;
  readonly tags: readonly string[];
  readonly selectedDates: readonly string[];
}

export interface OfflineWorkspaceContent {
  readonly workspaceId: string;
  readonly tasks: readonly OfflineWorkspaceTask[];
}

export interface OfflineWorkspaceDeletion {
  readonly workspaceId: string;
  readonly artifacts: Readonly<Record<string, number>>;
}

export interface OfflineWorkspaceStore {
  listCandidates(): Promise<readonly OfflineWorkspaceCandidate[]>;
  readCandidate(workspaceId: string): Promise<OfflineWorkspaceContent>;
  deleteCandidate(workspaceId: string): Promise<OfflineWorkspaceDeletion>;
}
