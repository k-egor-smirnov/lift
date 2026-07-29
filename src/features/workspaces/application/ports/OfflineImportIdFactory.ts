export interface OfflineImportIdFactory {
  taskId(
    sourceWorkspaceId: string,
    sourceTaskId: string,
    targetWorkspaceId: string
  ): Promise<string>;
  operationId(
    sourceWorkspaceId: string,
    targetWorkspaceId: string
  ): Promise<string>;
}
