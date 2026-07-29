import type { WorkspaceAccessControl } from "../ports/WorkspaceAccessControl";

export class RevokeWorkspaceDeviceUseCase {
  constructor(private readonly access: WorkspaceAccessControl) {}

  execute(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly deviceId: string;
  }) {
    return this.access.apply(input.workspaceId, {
      kind: "revoke-device",
      userId: input.userId,
      deviceId: input.deviceId,
    });
  }
}
