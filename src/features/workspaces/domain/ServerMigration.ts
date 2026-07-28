import type { WorkspaceRole } from "./WorkspaceRole";

const HASH = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export interface MigrationMemberMapping {
  readonly sourceUserId: string;
  readonly targetUserId: string;
}

export interface ServerMigrationCertificateV1 {
  readonly type: "dev.lift.server_migration.v1";
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly source: {
    readonly profileId: string;
    readonly roomId: string;
    readonly aclEpoch: number;
    readonly aclHash: string;
  };
  readonly target: {
    readonly profileId: string;
    readonly roomId: string;
    readonly aclEpoch: 1;
    readonly aclHash: string;
  };
  readonly heads: readonly string[];
  readonly memberMappings: readonly MigrationMemberMapping[];
}

export interface HashedServerMigrationCertificate {
  readonly certificate: ServerMigrationCertificateV1;
  readonly bytes: Uint8Array;
  readonly hash: string;
}

const requireIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0"))
    throw new Error(`Invalid migration ${label}`);
  return normalized;
};

export const mapMigrationMembers = (
  sourceMembers: Readonly<Record<string, WorkspaceRole>>,
  mappings: readonly MigrationMemberMapping[]
): Readonly<Record<string, WorkspaceRole>> => {
  const sourceIds = Object.keys(sourceMembers).sort();
  const normalized = mappings
    .map(({ sourceUserId, targetUserId }) => ({
      sourceUserId: requireIdentity(sourceUserId, "source user"),
      targetUserId: requireIdentity(targetUserId, "target user"),
    }))
    .sort((left, right) => left.sourceUserId.localeCompare(right.sourceUserId));
  if (
    normalized.length !== sourceIds.length ||
    normalized.some(
      ({ sourceUserId }, index) => sourceUserId !== sourceIds[index]
    )
  ) {
    throw new Error(
      "Migration requires an explicit target mapping for every retained member"
    );
  }
  if (
    new Set(normalized.map(({ sourceUserId }) => sourceUserId)).size !==
      normalized.length ||
    new Set(normalized.map(({ targetUserId }) => targetUserId)).size !==
      normalized.length
  ) {
    throw new Error("Migration member mappings must be one-to-one");
  }
  return Object.fromEntries(
    normalized.map(({ sourceUserId, targetUserId }) => [
      targetUserId,
      sourceMembers[sourceUserId]!,
    ])
  );
};

const sortedUniqueHashes = (
  values: readonly string[],
  label: string
): readonly string[] => {
  const sorted = [...values].sort();
  if (
    sorted.length === 0 ||
    sorted.some(
      (value, index) =>
        !HASH.test(value) || (index > 0 && value === sorted[index - 1])
    )
  ) {
    throw new Error(`Invalid migration ${label}`);
  }
  return sorted;
};

export const createServerMigrationCertificate = async (input: {
  readonly workspaceId: string;
  readonly sourceProfileId: string;
  readonly sourceRoomId: string;
  readonly sourceAclEpoch: number;
  readonly sourceAclHash: string;
  readonly targetProfileId: string;
  readonly targetRoomId: string;
  readonly targetAclHash: string;
  readonly heads: readonly string[];
  readonly memberMappings: readonly MigrationMemberMapping[];
}): Promise<HashedServerMigrationCertificate> => {
  if (!HASH.test(input.sourceAclHash) || !HASH.test(input.targetAclHash))
    throw new Error("Invalid migration ACL hash");
  if (!Number.isSafeInteger(input.sourceAclEpoch) || input.sourceAclEpoch < 1) {
    throw new Error("Invalid migration source ACL epoch");
  }
  const certificate: ServerMigrationCertificateV1 = {
    type: "dev.lift.server_migration.v1",
    schemaVersion: 1,
    workspaceId: requireIdentity(input.workspaceId, "workspace"),
    source: {
      profileId: requireIdentity(input.sourceProfileId, "source profile"),
      roomId: requireIdentity(input.sourceRoomId, "source room"),
      aclEpoch: input.sourceAclEpoch,
      aclHash: input.sourceAclHash,
    },
    target: {
      profileId: requireIdentity(input.targetProfileId, "target profile"),
      roomId: requireIdentity(input.targetRoomId, "target room"),
      aclEpoch: 1,
      aclHash: input.targetAclHash,
    },
    heads: sortedUniqueHashes(input.heads, "heads"),
    memberMappings: [...input.memberMappings]
      .map(({ sourceUserId, targetUserId }) => ({
        sourceUserId: requireIdentity(sourceUserId, "source user"),
        targetUserId: requireIdentity(targetUserId, "target user"),
      }))
      .sort(
        (left, right) =>
          left.sourceUserId.localeCompare(right.sourceUserId) ||
          left.targetUserId.localeCompare(right.targetUserId)
      ),
  };
  const bytes = encoder.encode(JSON.stringify(certificate));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
  return { certificate, bytes, hash };
};
