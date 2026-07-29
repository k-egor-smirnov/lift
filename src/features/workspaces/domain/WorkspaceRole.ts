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

export const isWorkspaceRole = (value: unknown): value is WorkspaceRole =>
  value === WorkspaceRole.Owner ||
  value === WorkspaceRole.Admin ||
  value === WorkspaceRole.Editor ||
  value === WorkspaceRole.Viewer;

type WorkspaceRoleAssertion = (
  value: unknown
) => asserts value is WorkspaceRole;

const assertWorkspaceRole: WorkspaceRoleAssertion = (value) => {
  if (!isWorkspaceRole(value)) {
    throw new Error("Invalid WorkspaceRole");
  }
};

export const can = (
  role: unknown,
  capability: WorkspaceCapability
): boolean => {
  assertWorkspaceRole(role);
  return capabilities[role].has(capability);
};

/**
 * Policy input for an ACL role update.
 *
 * `actorRole` must be resolved from the authenticated Matrix sender/device
 * against `previousRoles` before calling this function. This pure domain
 * validator does not authenticate a sender or bind a role to an actor.
 */
export interface RoleTransition {
  actorRole: WorkspaceRole;
  previousRoles: Readonly<Record<string, WorkspaceRole>>;
  nextRoles: Readonly<Record<string, WorkspaceRole>>;
}

type RoleMap = Readonly<Record<string, WorkspaceRole>>;

const ownMemberIds = (roles: RoleMap): readonly string[] =>
  Object.getOwnPropertyNames(roles);

const hasOwnMember = (roles: RoleMap, memberId: string): boolean =>
  Object.prototype.hasOwnProperty.call(roles, memberId);

type RoleMapAssertion = (
  roles: unknown,
  label: string
) => asserts roles is RoleMap;

const assertRoleMap: RoleMapAssertion = (roles, label) => {
  if (typeof roles !== "object" || roles === null || Array.isArray(roles)) {
    throw new Error(`Invalid ${label}`);
  }

  for (const memberId of Object.getOwnPropertyNames(roles)) {
    assertWorkspaceRole(Reflect.get(roles, memberId));
  }
};

const requireCapability = (
  actorRole: WorkspaceRole,
  capability: WorkspaceCapability
): void => {
  if (!can(actorRole, capability)) {
    throw new Error(`Role transition requires ${capability}`);
  }
};

const ownerCount = (roles: RoleMap): number =>
  ownMemberIds(roles).filter(
    (memberId) => roles[memberId] === WorkspaceRole.Owner
  ).length;

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
 *
 * The caller must authenticate the actor and resolve `actorRole` from the
 * previous ACL. This function validates authorization policy only; it does not
 * authenticate or bind an actor to that role.
 */
export const validateRoleTransition = ({
  actorRole,
  previousRoles,
  nextRoles,
}: RoleTransition): void => {
  assertWorkspaceRole(actorRole);
  assertRoleMap(previousRoles, "previous role map");
  assertRoleMap(nextRoles, "next role map");

  if (ownerCount(nextRoles) === 0) {
    throw new Error("Role transition cannot remove or demote the last Owner");
  }

  const memberIds = new Set([
    ...ownMemberIds(previousRoles),
    ...ownMemberIds(nextRoles),
  ]);

  for (const memberId of memberIds) {
    const previousRole = hasOwnMember(previousRoles, memberId)
      ? previousRoles[memberId]
      : undefined;
    const nextRole = hasOwnMember(nextRoles, memberId)
      ? nextRoles[memberId]
      : undefined;

    if (previousRole !== nextRole) {
      requireChangeCapabilities(actorRole, previousRole, nextRole);
    }
  }
};
