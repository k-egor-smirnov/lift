import { describe, expect, it, vi } from "vitest";

import type {
  MatrixCredentials,
  MatrixSessionSnapshot,
} from "../../../application/ports/MatrixSession";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { workspaceDeviceRef } from "../../../domain/WorkspaceAcl";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { MatrixAclBootstrapper } from "../../acl/MatrixAclBootstrapper";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../../matrix/MatrixSdkFacade";
import {
  VerifiedMatrixServerMigrationGateway,
  type MigrationMatrixSession,
} from "../VerifiedMatrixServerMigrationGateway";
import { createServerMigrationCertificate } from "../../../domain/ServerMigration";

const ready = (
  profileId: string,
  userId: string,
  deviceId: string
): MatrixSessionSnapshot => ({
  phase: "ready",
  profileId,
  userId,
  deviceId,
  errorCode: null,
  recoveryKeyForDisplay: null,
  confirmationGroup: null,
});

const signed = (content: Readonly<Record<string, unknown>>) => ({
  ...content,
  signatures: {
    "@alice:test": { "ed25519:DEVICE": "signature" },
  },
});

const fakeClient = (identity: {
  userId: string;
  deviceId: string;
  roomId: string;
}) => {
  const events = new Map<
    string,
    { type: string; content: Readonly<Record<string, unknown>> }
  >();
  const states = new Map<
    string,
    { eventId: string; content: Readonly<Record<string, unknown>> }
  >();
  const sentTypes: string[] = [];
  let userPowerLevels: Readonly<Record<string, number>> = {};
  let memberships: Readonly<Record<string, string>> = {};
  const client: MatrixWorkspaceClient = {
    workspaceIdentity: () => ({
      userId: identity.userId,
      deviceId: identity.deviceId,
    }),
    createEncryptedWorkspaceRoom: async () => identity.roomId,
    ownDeviceKeys: async () => ({
      ed25519: `${identity.deviceId}-ed25519`,
      curve25519: `${identity.deviceId}-curve25519`,
    }),
    applyWorkspaceAccess: async (_roomId, levels) => {
      userPowerLevels = { ...levels };
      memberships = Object.fromEntries(
        Object.keys(levels).map((userId) => [
          userId,
          userId === identity.userId ? "join" : "invite",
        ])
      );
    },
    readWorkspaceAccess: async () => ({
      userPowerLevels,
      memberships,
    }),
    signWorkspaceContent: async (content) => signed(content),
    sendEncryptedWorkspaceEvent: async (_roomId, type, content) => {
      const eventId = `$${events.size + 1}-${identity.deviceId}`;
      events.set(eventId, { type, content });
      sentTypes.push(type);
      return eventId;
    },
    readWorkspaceEvent: async (_roomId, eventId) => {
      const event = events.get(eventId);
      if (event === undefined) throw new Error("missing event");
      return {
        wireType: "m.room.encrypted",
        clearType: event.type,
        content: event.content,
      };
    },
    publishWorkspaceState: async (_roomId, type, content) => {
      const eventId = `$state-${type}-${identity.deviceId}`;
      states.set(type, { eventId, content });
      return eventId;
    },
    readWorkspaceState: async (_roomId, type) => {
      const state = states.get(type);
      if (state === undefined) throw new Error("missing state");
      return state;
    },
    subscribeWorkspaceEvents: () => () => undefined,
    listWorkspaceWireEvents: () => [],
    decryptWorkspaceEvent: async () => {
      throw new Error("unused");
    },
  };
  return { client, events, sentTypes };
};

class FakeSession implements MigrationMatrixSession {
  private value: MatrixSessionSnapshot;

  constructor(
    initial: MatrixSessionSnapshot,
    private readonly client: MatrixWorkspaceClient,
    private readonly recoveryIdentity?: MatrixSessionSnapshot
  ) {
    this.value = initial;
  }

  snapshot(): MatrixSessionSnapshot {
    return this.value;
  }

  async beginRecovery(_credentials: MatrixCredentials): Promise<void> {
    if (this.recoveryIdentity === undefined) throw new Error("not recoverable");
    this.value = {
      ...this.recoveryIdentity,
      phase: "recovery-key-required",
    };
  }

  async recoverWithKey(): Promise<void> {
    if (this.recoveryIdentity === undefined) throw new Error("not recoverable");
    this.value = this.recoveryIdentity;
  }

  requireAuthenticatedClient(): MatrixWorkspaceClient {
    if (this.value.phase !== "ready") throw new Error("not ready");
    return this.client;
  }

  async stop(): Promise<void> {
    this.value = {
      ...this.value,
      phase: "signed-out",
      profileId: null,
      userId: null,
      deviceId: null,
    };
  }

  async resume(): Promise<boolean> {
    if (this.recoveryIdentity === undefined) return false;
    this.value = this.recoveryIdentity;
    return true;
  }
}

describe("VerifiedMatrixServerMigrationGateway", () => {
  it("publishes exact encrypted ACL, checkpoint and certificate events on both servers before handing off the session", async () => {
    const workspaceId = "ws_migrate";
    const sourceUserId = "@alice:primary.localhost";
    const targetUserId = "@alice:secondary.localhost";
    const sourceFake = fakeClient({
      userId: sourceUserId,
      deviceId: "SOURCE",
      roomId: "!source:primary.localhost",
    });
    const targetFake = fakeClient({
      userId: targetUserId,
      deviceId: "TARGET",
      roomId: "!target:secondary.localhost",
    });
    const sourceSession = new FakeSession(
      ready("local-primary", sourceUserId, "SOURCE"),
      sourceFake.client,
      ready("local-secondary", targetUserId, "TARGET")
    );
    const targetSession = new FakeSession(
      {
        ...ready("local-secondary", targetUserId, "TARGET"),
        phase: "signed-out",
        profileId: null,
        userId: null,
        deviceId: null,
      },
      targetFake.client,
      ready("local-secondary", targetUserId, "TARGET")
    );
    const persist = vi.fn(async () => undefined);
    const gateway = new VerifiedMatrixServerMigrationGateway(
      sourceSession,
      targetSession,
      { persist },
      {
        profileId: "local-secondary",
        username: "alice",
        password: "strong-password",
        recoveryKey: "recovery key",
      }
    );
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace(workspaceId, "UTC", "04:00"),
      "aa".repeat(16)
    );
    const snapshot = document.save();
    const heads = [...document.heads()].sort();

    const prepared = await gateway.prepareTarget({
      workspaceId,
      targetProfileId: "local-secondary",
      sourceTargetId: "source",
      sourceRoomId: "!source:primary.localhost",
      sourceAclHash: "ab".repeat(32),
      sourceAclEpoch: 1,
      sourceRevokedUsers: [],
      sourceRevokedDevices: [],
      sourceSnapshot: snapshot,
      sourceHeads: heads,
      memberMappings: [{ sourceUserId, targetUserId }],
      targetMembers: { [targetUserId]: WorkspaceRole.Owner },
    });

    expect(prepared.roomId).toBe("!target:secondary.localhost");
    expect(prepared.freshHeads).toEqual(heads);
    expect(targetFake.sentTypes).toContain("dev.lift.acl.v1");
    expect(targetFake.sentTypes).toContain("dev.lift.checkpoint.v1");

    const targetAclEvent = [...targetFake.events.entries()].find(
      ([, event]) => event.type === "dev.lift.acl.v1"
    );
    expect(targetAclEvent).toBeDefined();
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    await database.open();
    try {
      const { signatures: _signatures, ...targetAclContent } =
        targetAclEvent![1].content;
      await new MatrixAclBootstrapper(
        database,
        () => "local-secondary",
        () => undefined,
        undefined,
        () => 1,
        () => ({ userId: targetUserId, deviceId: "SECOND_TARGET" })
      ).acceptRoot({
        eventId: targetAclEvent![0],
        roomId: prepared.roomId,
        clearType: "dev.lift.acl.v1",
        content: targetAclContent,
        senderUserId: targetUserId,
        senderDeviceId: "TARGET",
        senderCurve25519Key: "TARGET-curve25519",
        claimedEd25519Key: "TARGET-ed25519",
        deviceCrossSigned: true,
        shield: "none",
        applicationSignatureVerified: true,
        verified: true,
      });
      expect(
        await database.syncTargets
          .where("serverProfileId")
          .equals("local-secondary")
          .first()
      ).toMatchObject({
        workspaceId,
        roomId: prepared.roomId,
        mode: "active",
        state: "active",
      });
    } finally {
      database.close();
      await database.delete();
    }

    const certificate = await createServerMigrationCertificate({
      workspaceId,
      sourceProfileId: "local-primary",
      sourceRoomId: "!source:primary.localhost",
      sourceAclEpoch: 1,
      sourceAclHash: "ab".repeat(32),
      targetProfileId: "local-secondary",
      targetRoomId: prepared.roomId,
      targetAclHash: prepared.targetAclHash,
      heads,
      memberMappings: [{ sourceUserId, targetUserId }],
    });
    const receipt = await gateway.publishCertificate({
      certificate,
      sourceTargetId: "source",
      targetTargetId: prepared.targetId,
    });

    expect(receipt.hash).toBe(certificate.hash);
    expect(sourceFake.sentTypes).toContain("dev.lift.server_migration.v1");
    expect(targetFake.sentTypes).toContain("dev.lift.server_migration.v1");

    const revokedGateway = new VerifiedMatrixServerMigrationGateway(
      sourceSession,
      new FakeSession(
        {
          ...ready("local-secondary", targetUserId, "TARGET"),
          phase: "signed-out",
          profileId: null,
          userId: null,
          deviceId: null,
        },
        targetFake.client,
        ready("local-secondary", targetUserId, "TARGET")
      ),
      { persist },
      {
        profileId: "local-secondary",
        username: "alice",
        password: "strong-password",
        recoveryKey: "recovery key",
      }
    );
    await expect(
      revokedGateway.prepareTarget({
        workspaceId,
        targetProfileId: "local-secondary",
        sourceTargetId: "source",
        sourceRoomId: "!source:primary.localhost",
        sourceAclHash: "ab".repeat(32),
        sourceAclEpoch: 1,
        sourceRevokedUsers: [],
        sourceRevokedDevices: [workspaceDeviceRef(sourceUserId, "SOURCE")],
        sourceSnapshot: snapshot,
        sourceHeads: heads,
        memberMappings: [{ sourceUserId, targetUserId }],
        targetMembers: { [targetUserId]: WorkspaceRole.Owner },
      })
    ).rejects.toThrow("Authenticated source device is revoked");

    const editorSourceUserId = "@editor:primary.localhost";
    const targetEditorUserId = "@editor:secondary.localhost";
    const editorSourceSession = new FakeSession(
      ready("local-primary", editorSourceUserId, "SOURCE_EDITOR"),
      sourceFake.client
    );
    const editorTargetSession = new FakeSession(
      {
        ...ready("local-secondary", targetUserId, "TARGET"),
        phase: "signed-out",
        profileId: null,
        userId: null,
        deviceId: null,
      },
      targetFake.client,
      ready("local-secondary", targetUserId, "TARGET")
    );
    const editorGateway = new VerifiedMatrixServerMigrationGateway(
      editorSourceSession,
      editorTargetSession,
      { persist },
      {
        profileId: "local-secondary",
        username: "alice",
        password: "strong-password",
        recoveryKey: "recovery key",
      }
    );
    await expect(
      editorGateway.prepareTarget({
        workspaceId,
        targetProfileId: "local-secondary",
        sourceTargetId: "source",
        sourceRoomId: "!source:primary.localhost",
        sourceAclHash: "ab".repeat(32),
        sourceAclEpoch: 1,
        sourceRevokedUsers: [],
        sourceRevokedDevices: [],
        sourceSnapshot: snapshot,
        sourceHeads: heads,
        memberMappings: [
          { sourceUserId, targetUserId },
          {
            sourceUserId: editorSourceUserId,
            targetUserId: targetEditorUserId,
          },
        ],
        targetMembers: {
          [targetUserId]: WorkspaceRole.Owner,
          [targetEditorUserId]: WorkspaceRole.Editor,
        },
      })
    ).rejects.toThrow("Authenticated source user must be workspace Owner");

    await gateway.activateTargetSession();

    expect(persist).not.toHaveBeenCalled();
    expect(sourceSession.snapshot()).toMatchObject({
      phase: "ready",
      profileId: "local-secondary",
    });
  });
});
