import type { WorkspaceAccessControl } from "../ports/WorkspaceAccessControl";

export class TransferWorkspaceOwnershipUseCase {
  constructor(private readonly access: WorkspaceAccessControl) {}

  execute(input: {
    readonly workspaceId: string;
    readonly nextOwnerUserId: string;
  }) {
    return this.access.apply(input.workspaceId, {
      kind: "transfer-ownership",
      nextOwnerUserId: input.nextOwnerUserId,
    });
  }
}
