import type {
  AssignableWorkspaceRole,
  WorkspaceAccessControl,
} from "../ports/WorkspaceAccessControl";

export class ChangeWorkspaceRoleUseCase {
  constructor(private readonly access: WorkspaceAccessControl) {}

  execute(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly role: AssignableWorkspaceRole;
  }) {
    return this.access.apply(input.workspaceId, {
      kind: "change-role",
      userId: input.userId,
      role: input.role,
    });
  }
}
