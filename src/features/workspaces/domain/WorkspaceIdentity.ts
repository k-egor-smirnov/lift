declare const workspaceIdBrand: unique symbol;
declare const changeHashBrand: unique symbol;
declare const deviceIdBrand: unique symbol;
declare const serverProfileIdBrand: unique symbol;
declare const syncTargetIdBrand: unique symbol;
declare const aclHashBrand: unique symbol;

export type WorkspaceId = string & {
  readonly [workspaceIdBrand]: "WorkspaceId";
};
export type ChangeHash = string & { readonly [changeHashBrand]: "ChangeHash" };
export type DeviceId = string & { readonly [deviceIdBrand]: "DeviceId" };
export type ServerProfileId = string & {
  readonly [serverProfileIdBrand]: "ServerProfileId";
};
export type SyncTargetId = string & {
  readonly [syncTargetIdBrand]: "SyncTargetId";
};
export type AclHash = string & { readonly [aclHashBrand]: "AclHash" };

export class InvalidWorkspaceIdentityError extends Error {
  constructor(identity: string) {
    super(`Invalid ${identity}: expected a non-empty string`);
    this.name = "InvalidWorkspaceIdentityError";
  }
}

const requireNonEmptyString = <Identity>(
  identity: string,
  value: unknown
): Identity => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidWorkspaceIdentityError(identity);
  }

  return value as Identity;
};

export const WorkspaceId = (value: unknown): WorkspaceId =>
  requireNonEmptyString<WorkspaceId>("WorkspaceId", value);

export const ChangeHash = (value: unknown): ChangeHash =>
  requireNonEmptyString<ChangeHash>("ChangeHash", value);

export const DeviceId = (value: unknown): DeviceId =>
  requireNonEmptyString<DeviceId>("DeviceId", value);

export const ServerProfileId = (value: unknown): ServerProfileId =>
  requireNonEmptyString<ServerProfileId>("ServerProfileId", value);

export const SyncTargetId = (value: unknown): SyncTargetId =>
  requireNonEmptyString<SyncTargetId>("SyncTargetId", value);

export const AclHash = (value: unknown): AclHash =>
  requireNonEmptyString<AclHash>("AclHash", value);
