export interface WorkspaceWriteAuthorization {
  requireEdit(workspaceId: string): Promise<void>;
}
