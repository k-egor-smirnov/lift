import {
  isWorkspaceDeviceRef,
  workspaceDeviceRef,
  type WorkspaceAclCheckpoint,
} from "./WorkspaceAcl";
import { can, validateRoleTransition } from "./WorkspaceRole";

const assertUnique = (values: readonly string[], label: string): void => {
  if (values.some((value) => value.length === 0)) {
    throw new Error(`${label} cannot contain empty values`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} cannot contain duplicates`);
  }
};

const requireSuperset = (
  previous: readonly string[],
  next: readonly string[],
  label: string
): void => {
  const values = new Set(next);
  if (previous.some((value) => !values.has(value))) {
    throw new Error(`${label} cannot shrink`);
  }
};

export const validateAclRoot = (checkpoint: WorkspaceAclCheckpoint): void => {
  if (checkpoint.workspaceId.length === 0)
    throw new Error("Invalid workspace ID");
  if (checkpoint.authEpoch !== 1)
    throw new Error("Initial ACL epoch must be 1");
  if (checkpoint.previousHash !== null)
    throw new Error("Initial ACL cannot have a previous hash");
  if (checkpoint.members[checkpoint.sender.userId] !== "OWNER") {
    throw new Error("Initial ACL sender must be an Owner");
  }
  if (
    checkpoint.sender.deviceId.length === 0 ||
    checkpoint.sender.ed25519Key.length === 0 ||
    checkpoint.sender.curve25519Key.length === 0
  ) {
    throw new Error("Initial ACL sender device keys are required");
  }
  assertUnique(checkpoint.revokedUsers, "Revoked users");
  assertUnique(checkpoint.revokedDevices, "Revoked devices");
  assertUnique(checkpoint.acceptedHeads, "Accepted heads");
};

export const validateAclTransition = (
  previous: WorkspaceAclCheckpoint,
  next: WorkspaceAclCheckpoint
): void => {
  if (next.workspaceId !== previous.workspaceId)
    throw new Error("ACL workspace cannot change");
  if (next.authEpoch !== previous.authEpoch + 1)
    throw new Error("ACL epoch must increment by one");
  const actorRole = previous.members[next.sender.userId];
  if (actorRole === undefined) throw new Error("ACL sender is not a member");
  if (previous.revokedUsers.includes(next.sender.userId))
    throw new Error("ACL sender user is revoked");
  if (
    previous.revokedDevices.includes(
      workspaceDeviceRef(next.sender.userId, next.sender.deviceId)
    )
  )
    throw new Error("ACL sender device is revoked");
  if (!can(actorRole, "invite"))
    throw new Error("ACL transition requires administration");

  validateRoleTransition({
    actorRole,
    previousRoles: previous.members,
    nextRoles: next.members,
  });
  assertUnique(next.revokedUsers, "Revoked users");
  assertUnique(next.revokedDevices, "Revoked devices");
  assertUnique(next.acceptedHeads, "Accepted heads");
  requireSuperset(previous.revokedUsers, next.revokedUsers, "Revoked users");
  requireSuperset(
    previous.revokedDevices,
    next.revokedDevices,
    "Revoked devices"
  );
  if (next.revokedDevices.some((value) => !isWorkspaceDeviceRef(value)))
    throw new Error("Revoked devices must use qualified user/device IDs");
  if (
    next.revokedDevices.some(
      (value) => !previous.revokedDevices.includes(value)
    ) &&
    !can(actorRole, "revoke-device")
  ) {
    throw new Error("ACL transition requires revoke-device");
  }
  if (
    next.revokedUsers.some((value) => !previous.revokedUsers.includes(value)) &&
    !can(actorRole, "remove-member")
  ) {
    throw new Error("ACL transition requires remove-member");
  }
  if (next.revokedUsers.some((userId) => next.members[userId] !== undefined))
    throw new Error("Revoked users cannot remain workspace members");
  requireSuperset(
    previous.acceptedHeads,
    next.acceptedHeads,
    "Accepted causal heads"
  );
};
