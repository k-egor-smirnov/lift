import type { WorkspaceAccessControl } from "../ports/WorkspaceAccessControl";

export class RemoveWorkspaceMemberUseCase {
  constructor(private readonly access: WorkspaceAccessControl) {}

  execute(input: { readonly workspaceId: string; readonly userId: string }) {
    return this.access.apply(input.workspaceId, {
      kind: "remove-member",
      userId: input.userId,
    });
  }
}
