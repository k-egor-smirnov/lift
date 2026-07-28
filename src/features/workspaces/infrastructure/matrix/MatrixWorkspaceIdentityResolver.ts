import Dexie from "dexie";

import { workspaceDeviceRef } from "../../domain/WorkspaceAcl";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";

export interface MatrixWorkspaceIdentity {
  readonly profileId: string;
  readonly userId: string;
  readonly deviceId: string;
}

/**
 * Resolves local data only through a verified Matrix identity binding.
 * A snapshot's mere presence is deliberately insufficient: it may belong to a
 * different account that previously used this browser profile.
 */
export class MatrixWorkspaceIdentityResolver {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly aclCodec = new CanonicalAclCodec()
  ) {}

  async resolve(identity: MatrixWorkspaceIdentity): Promise<string | null> {
    const targets = await this.database.syncTargets
      .where("serverProfileId")
      .equals(identity.profileId)
      .filter(({ mode, state }) => mode === "active" && state === "active")
      .toArray();
    const authorized: Array<{ workspaceId: string; updatedAt: number }> = [];
    for (const target of targets) {
      const acl = await this.database.aclCheckpoints
        .where("[workspaceId+authEpoch]")
        .between(
          [target.workspaceId, Dexie.minKey],
          [target.workspaceId, Dexie.maxKey],
          true,
          true
        )
        .last();
      if (acl === undefined) continue;
      const checkpoint = this.aclCodec.decode(acl.bytes);
      if (
        checkpoint.members[identity.userId] === undefined ||
        checkpoint.revokedUsers.includes(identity.userId) ||
        checkpoint.revokedDevices.includes(
          workspaceDeviceRef(identity.userId, identity.deviceId)
        )
      ) {
        continue;
      }
      authorized.push({
        workspaceId: target.workspaceId,
        updatedAt: target.updatedAt,
      });
    }
    return (
      authorized.sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          left.workspaceId.localeCompare(right.workspaceId)
      )[0]?.workspaceId ?? null
    );
  }

  async listOfflineWorkspaceIds(): Promise<readonly string[]> {
    const snapshots = await this.database.workspaceSnapshots.toArray();
    const targets = await this.database.syncTargets.toArray();
    const bound = new Set(targets.map(({ workspaceId }) => workspaceId));
    return snapshots
      .map(({ workspaceId }) => workspaceId)
      .filter((workspaceId) => !bound.has(workspaceId))
      .sort();
  }
}
