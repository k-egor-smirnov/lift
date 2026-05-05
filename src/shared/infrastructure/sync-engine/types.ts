export type DevicePlatform = "ios" | "android" | "web" | "desktop" | "unknown";

export interface ConnectedDevice {
  id: string;
  label: string;
  platform: DevicePlatform;
  createdAt: string;
  lastSeenAt: string;
  identityKey: string;
  isCurrent: boolean;
  isRevoked: boolean;
}

export interface MlsGroupSnapshot {
  groupId: string;
  epoch: number;
  members: Array<Pick<ConnectedDevice, "id" | "identityKey" | "isRevoked">>;
  pendingCommits: number;
  hasExternalCommit: boolean;
}

export interface EncryptedSyncUpdate {
  id: string;
  userId: string;
  groupId: string;
  sourceDeviceId: string;
  encryptedPayload: string;
  iv: string;
  epoch: number;
  createdAt: string;
}

export enum MlsCornerCaseCode {
  STALE_EPOCH = "STALE_EPOCH",
  DUPLICATE_DEVICE = "DUPLICATE_DEVICE",
  DEVICE_NOT_FOUND = "DEVICE_NOT_FOUND",
  PENDING_COMMIT_REQUIRED = "PENDING_COMMIT_REQUIRED",
  SELF_REMOVE_FORBIDDEN = "SELF_REMOVE_FORBIDDEN",
  KEY_PACKAGE_EXPIRED = "KEY_PACKAGE_EXPIRED",
  INVALID_EXTERNAL_COMMIT = "INVALID_EXTERNAL_COMMIT",
}

export class MlsCornerCaseError extends Error {
  constructor(
    public readonly code: MlsCornerCaseCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MlsCornerCaseError";
  }
}
