import type { WorkspaceId } from "../../domain/WorkspaceIdentity";

export interface CurrentWorkspace {
  getId(): WorkspaceId | null;
  requireId(): WorkspaceId;
}
