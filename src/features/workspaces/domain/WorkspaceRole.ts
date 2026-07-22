export enum WorkspaceRole {
  Owner = "OWNER",
  Admin = "ADMIN",
  Editor = "EDITOR",
  Viewer = "VIEWER",
}

export type WorkspaceCapability =
  | "read"
  | "edit"
  | "invite"
  | "remove-member"
  | "assign-editor"
  | "assign-admin"
  | "assign-owner"
  | "revoke-device"
  | "migrate-server";

const capabilities: Record<WorkspaceRole, ReadonlySet<WorkspaceCapability>> = {
  [WorkspaceRole.Owner]: new Set([
    "read",
    "edit",
    "invite",
    "remove-member",
    "assign-editor",
    "assign-admin",
    "assign-owner",
    "revoke-device",
    "migrate-server",
  ]),
  [WorkspaceRole.Admin]: new Set([
    "read",
    "edit",
    "invite",
    "remove-member",
    "assign-editor",
    "revoke-device",
  ]),
  [WorkspaceRole.Editor]: new Set(["read", "edit"]),
  [WorkspaceRole.Viewer]: new Set(["read"]),
};

export const matrixPowerLevel: Record<WorkspaceRole, number> = {
  [WorkspaceRole.Owner]: 100,
  [WorkspaceRole.Admin]: 75,
  [WorkspaceRole.Editor]: 50,
  [WorkspaceRole.Viewer]: 0,
};

export const can = (
  role: WorkspaceRole,
  capability: WorkspaceCapability
): boolean => capabilities[role].has(capability);

export interface RoleTransition {
  actorRole: WorkspaceRole;
  previousRoles: Readonly<Record<string, WorkspaceRole>>;
  nextRoles: Readonly<Record<string, WorkspaceRole>>;
}

const requireCapability = (
  actorRole: WorkspaceRole,
  capability: WorkspaceCapability
): void => {
  if (!can(actorRole, capability)) {
    throw new Error(`Role transition requires ${capability}`);
  }
};

const ownerCount = (roles: Readonly<Record<string, WorkspaceRole>>): number =>
  Object.values(roles).filter((role) => role === WorkspaceRole.Owner).length;

const requireChangeCapabilities = (
  actorRole: WorkspaceRole,
  previousRole: WorkspaceRole | undefined,
  nextRole: WorkspaceRole | undefined
): void => {
  if (
    previousRole === WorkspaceRole.Owner ||
    nextRole === WorkspaceRole.Owner
  ) {
    requireCapability(actorRole, "assign-owner");
  }

  if (nextRole === undefined) {
    requireCapability(actorRole, "remove-member");
    return;
  }

  if (previousRole === undefined) {
    requireCapability(actorRole, "invite");
  }

  if (
    nextRole === WorkspaceRole.Admin ||
    (previousRole === WorkspaceRole.Admin && nextRole !== undefined)
  ) {
    requireCapability(actorRole, "assign-admin");
  }

  if (
    nextRole === WorkspaceRole.Editor ||
    (previousRole === WorkspaceRole.Editor && nextRole === WorkspaceRole.Viewer)
  ) {
    requireCapability(actorRole, "assign-editor");
  }
};

/**
 * Rejects ACL role changes that exceed the actor's role or would leave a
 * workspace without an Owner. Ownership changes always require an Owner.
 */
export const validateRoleTransition = ({
  actorRole,
  previousRoles,
  nextRoles,
}: RoleTransition): void => {
  if (ownerCount(nextRoles) === 0) {
    throw new Error("Role transition cannot remove or demote the last Owner");
  }

  const memberIds = new Set([
    ...Object.keys(previousRoles),
    ...Object.keys(nextRoles),
  ]);

  for (const memberId of memberIds) {
    const previousRole = previousRoles[memberId];
    const nextRole = nextRoles[memberId];

    if (previousRole !== nextRole) {
      requireChangeCapabilities(actorRole, previousRole, nextRole);
    }
  }
};
