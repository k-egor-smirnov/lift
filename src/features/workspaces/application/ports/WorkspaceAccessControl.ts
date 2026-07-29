import type { WorkspaceAclCheckpoint } from "../../domain/WorkspaceAcl";
import type { WorkspaceRole } from "../../domain/WorkspaceRole";

export type AssignableWorkspaceRole = Exclude<WorkspaceRole, "OWNER">;

export type WorkspaceAccessIntent =
  | {
      readonly kind: "invite-member";
      readonly userId: string;
      readonly role: AssignableWorkspaceRole;
    }
  | {
      readonly kind: "change-role";
      readonly userId: string;
      readonly role: AssignableWorkspaceRole;
    }
  | {
      readonly kind: "transfer-ownership";
      readonly nextOwnerUserId: string;
    }
  | { readonly kind: "remove-member"; readonly userId: string }
  | {
      readonly kind: "revoke-device";
      readonly userId: string;
      readonly deviceId: string;
    };

export interface WorkspaceAccessControl {
  current(workspaceId: string): Promise<WorkspaceAclCheckpoint>;
  apply(
    workspaceId: string,
    intent: WorkspaceAccessIntent
  ): Promise<WorkspaceAclCheckpoint>;
}
