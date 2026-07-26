import type { MatrixSession } from "../ports/MatrixSession";

export interface CreateWorkspaceInput {
  readonly timezone: string;
  readonly startOfDay: string;
}

export interface LocalWorkspaceBootstrap {
  getOrCreate(input: CreateWorkspaceInput): Promise<{
    readonly workspaceId: string;
    readonly heads: readonly string[];
    readonly snapshotBytes: Uint8Array;
  }>;
}

export interface WorkspaceRoomProvisioner {
  ensureRoot(input: {
    readonly workspaceId: string;
    readonly profileId: string;
    readonly ownerUserId: string;
    readonly ownerDeviceId: string;
    readonly acceptedHeads: readonly string[];
    readonly bootstrapSnapshot: Uint8Array;
  }): Promise<unknown>;
}

export class CreateWorkspaceUseCase {
  constructor(
    private readonly matrix: MatrixSession,
    private readonly local: LocalWorkspaceBootstrap,
    private readonly rooms: WorkspaceRoomProvisioner,
    private readonly allowOfflineOnly = false
  ) {}

  async execute(input: CreateWorkspaceInput): Promise<string> {
    const session = this.matrix.snapshot();
    if (session.phase !== "ready") {
      if (this.allowOfflineOnly) {
        return (await this.local.getOrCreate(input)).workspaceId;
      }
      throw new Error(
        "Matrix recovery must be acknowledged before workspace creation"
      );
    }
    if (
      session.profileId === null ||
      session.userId === null ||
      session.deviceId === null
    ) {
      throw new Error("Ready Matrix session has incomplete identity");
    }
    const local = await this.local.getOrCreate(input);
    await this.rooms.ensureRoot({
      workspaceId: local.workspaceId,
      profileId: session.profileId,
      ownerUserId: session.userId,
      ownerDeviceId: session.deviceId,
      acceptedHeads: local.heads,
      bootstrapSnapshot: local.snapshotBytes,
    });
    return local.workspaceId;
  }
}
