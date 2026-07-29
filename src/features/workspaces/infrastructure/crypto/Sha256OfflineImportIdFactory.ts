import type { OfflineImportIdFactory } from "../../application/ports/OfflineImportIdFactory";

const requireNonEmpty = (value: string, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return value;
};

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

export class Sha256OfflineImportIdFactory implements OfflineImportIdFactory {
  async taskId(
    sourceWorkspaceId: string,
    sourceTaskId: string,
    targetWorkspaceId: string
  ): Promise<string> {
    const sourceWorkspace = requireNonEmpty(
      sourceWorkspaceId,
      "sourceWorkspaceId"
    );
    const sourceTask = requireNonEmpty(sourceTaskId, "sourceTaskId");
    const targetWorkspace = requireNonEmpty(
      targetWorkspaceId,
      "targetWorkspaceId"
    );

    return sha256(
      `lift-offline-import-v1\0${sourceWorkspace}\0${sourceTask}\0${targetWorkspace}`
    );
  }

  async operationId(
    sourceWorkspaceId: string,
    targetWorkspaceId: string
  ): Promise<string> {
    const sourceWorkspace = requireNonEmpty(
      sourceWorkspaceId,
      "sourceWorkspaceId"
    );
    const targetWorkspace = requireNonEmpty(
      targetWorkspaceId,
      "targetWorkspaceId"
    );
    const digest = await sha256(
      `lift-offline-import-operation-v1\0${sourceWorkspace}\0${targetWorkspace}`
    );
    return `offline-import-v1:${digest}`;
  }
}
