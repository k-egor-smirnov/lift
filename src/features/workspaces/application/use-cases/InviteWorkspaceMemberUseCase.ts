import type {
  AssignableWorkspaceRole,
  WorkspaceAccessControl,
} from "../ports/WorkspaceAccessControl";

export class InviteWorkspaceMemberUseCase {
  constructor(private readonly access: WorkspaceAccessControl) {}

  execute(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly role: AssignableWorkspaceRole;
  }) {
    return this.access.apply(input.workspaceId, {
      kind: "invite-member",
      userId: input.userId.trim(),
      role: input.role,
    });
  }
}
