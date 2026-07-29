import type { WorkspaceRole } from "./WorkspaceRole";

export interface WorkspaceAclSender {
  readonly userId: string;
  readonly deviceId: string;
  readonly ed25519Key: string;
  readonly curve25519Key: string;
}

/** Matrix device IDs are only unique within a user account. */
export const workspaceDeviceRef = (userId: string, deviceId: string): string =>
  JSON.stringify([userId, deviceId]);

export const isWorkspaceDeviceRef = (value: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((item) => typeof item === "string" && item.length > 0)
    );
  } catch {
    return false;
  }
};

export interface WorkspaceAclCheckpoint {
  readonly workspaceId: string;
  readonly authEpoch: number;
  readonly previousHash: string | null;
  readonly members: Readonly<Record<string, WorkspaceRole>>;
  readonly revokedUsers: readonly string[];
  readonly revokedDevices: readonly string[];
  readonly acceptedHeads: readonly string[];
  readonly sender: WorkspaceAclSender;
}

export interface HashedWorkspaceAclCheckpoint {
  readonly checkpoint: WorkspaceAclCheckpoint;
  readonly bytes: Uint8Array;
  readonly hash: string;
}
