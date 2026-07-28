import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import {
  workspaceDeviceRef,
  type WorkspaceAclCheckpoint,
} from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { AclChainValidator } from "../AclChainValidator";
import { CanonicalAclCodec } from "../CanonicalAclCodec";
import { MatrixAclBootstrapper } from "../MatrixAclBootstrapper";

const databases: LiftSecureDatabase[] = [];

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

describe("MatrixAclBootstrapper transitions", () => {
  it("bootstraps an invited member from a complete ACL chain and current snapshot", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    const codec = new CanonicalAclCodec();
    const document = AutomergeWorkspaceDocument.create(
      createEmptyWorkspace("ws_invite", "Europe/Moscow", "06:00"),
      "aa".repeat(16)
    );
    const rootHeads = [...document.heads()];
    const rootSnapshot = document.save();
    document.change("seed invited workspace", (draft) => {
      draft.settings.startOfDay = "07:00";
    });
    const currentHeads = [...document.heads()];
    const snapshot = document.save();
    const root: WorkspaceAclCheckpoint = {
      workspaceId: "ws_invite",
      authEpoch: 1,
      previousHash: null,
      members: { "@owner:test": WorkspaceRole.Owner },
      revokedUsers: [],
      revokedDevices: [],
      acceptedHeads: rootHeads,
      sender: {
        userId: "@owner:test",
        deviceId: "OWNER",
        ed25519Key: "owner-ed25519",
        curve25519Key: "owner-curve25519",
      },
    };
    const validator = new AclChainValidator(codec);
    const acceptedRoot = await validator.accept(root);
    await database.aclCheckpoints.add({
      workspaceId: "ws_invite",
      authEpoch: 1,
      hash: acceptedRoot.hash,
      previousHash: null,
      bytes: acceptedRoot.bytes,
      createdAt: 1,
    });
    await database.workspaceSnapshots.add({
      workspaceId: "ws_invite",
      schemaVersion: 1,
      bytes: rootSnapshot,
      heads: rootHeads,
      savedAt: 1,
    });
    await database.syncTargets.add({
      id: "matrix:ws_invite:primary",
      workspaceId: "ws_invite",
      serverProfileId: "primary",
      roomId: "!invite:test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const invitation: WorkspaceAclCheckpoint = {
      ...root,
      authEpoch: 2,
      previousHash: acceptedRoot.hash,
      members: {
        "@owner:test": WorkspaceRole.Owner,
        "@editor:test": WorkspaceRole.Editor,
      },
      acceptedHeads: [...new Set([...rootHeads, ...currentHeads])].sort(),
    };
    const acceptedInvitation = await validator.accept(invitation);
    const bootstrapper = new MatrixAclBootstrapper(
      database,
      () => "primary",
      () => undefined,
      codec,
      () => 2,
      () => ({ userId: "@editor:test", deviceId: "EDITOR" })
    );

    await bootstrapper.acceptRoot({
      eventId: "$invite-bootstrap",
      roomId: "!invite:test",
      clearType: "dev.lift.acl.v1",
      content: {
        schemaVersion: 1,
        hash: acceptedInvitation.hash,
        bytes: base64Url(acceptedInvitation.bytes),
        aclChain: [
          {
            hash: acceptedRoot.hash,
            bytes: base64Url(acceptedRoot.bytes),
          },
          {
            hash: acceptedInvitation.hash,
            bytes: base64Url(acceptedInvitation.bytes),
          },
        ],
        bootstrap: {
          hash: await codec.hash(snapshot),
          bytes: base64Url(snapshot),
          heads: currentHeads,
        },
      },
      senderUserId: "@owner:test",
      senderDeviceId: "OWNER",
      senderCurve25519Key: "owner-curve25519",
      claimedEd25519Key: "owner-ed25519",
      deviceCrossSigned: true,
      shield: "none",
      applicationSignatureVerified: true,
      verified: false,
    });

    expect(await database.aclCheckpoints.count()).toBe(2);
    expect(await database.workspaceSnapshots.get("ws_invite")).toMatchObject({
      heads: currentHeads,
    });
    expect(
      AutomergeWorkspaceDocument.load(
        new Uint8Array([
          ...(await database.workspaceSnapshots.get("ws_invite"))!.bytes,
        ]),
        "bb".repeat(16)
      ).value().settings.startOfDay
    ).toBe("07:00");
    expect(
      await database.syncTargets.get("matrix:ws_invite:primary")
    ).toMatchObject({
      roomId: "!invite:test",
      mode: "active",
      state: "active",
    });
  });

  it("accepts a valid next epoch and pauses revoked-device outbox before reconnect send", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    const codec = new CanonicalAclCodec();
    const root: WorkspaceAclCheckpoint = {
      workspaceId: "ws_1",
      authEpoch: 1,
      previousHash: null,
      members: {
        "@owner:test": WorkspaceRole.Owner,
        "@bob:test": WorkspaceRole.Editor,
      },
      revokedUsers: [],
      revokedDevices: [],
      acceptedHeads: ["head-1"],
      sender: {
        userId: "@owner:test",
        deviceId: "OWNER",
        ed25519Key: "owner-ed25519",
        curve25519Key: "owner-curve25519",
      },
    };
    const validator = new AclChainValidator(codec);
    const acceptedRoot = await validator.accept(root);
    await database.aclCheckpoints.add({
      workspaceId: "ws_1",
      authEpoch: 1,
      hash: acceptedRoot.hash,
      previousHash: null,
      bytes: acceptedRoot.bytes,
      createdAt: 1,
    });
    await database.syncTargets.add({
      id: "matrix:ws_1:primary",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!room:test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await database.syncOutbox.add({
      id: "pending-change",
      workspaceId: "ws_1",
      targetId: "matrix:ws_1:primary",
      changeHash: "change-1",
      innerType: "dev.lift.crdt.change.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: "txn",
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    const transition: WorkspaceAclCheckpoint = {
      ...root,
      authEpoch: 2,
      previousHash: acceptedRoot.hash,
      revokedDevices: [workspaceDeviceRef("@bob:test", "BOB")],
    };
    const acceptedTransition = await validator.accept(transition);
    const bootstrapper = new MatrixAclBootstrapper(
      database,
      () => "primary",
      () => undefined,
      codec,
      () => 2,
      () => ({ userId: "@bob:test", deviceId: "BOB" })
    );

    await bootstrapper.acceptRoot({
      eventId: "$acl-2",
      roomId: "!room:test",
      clearType: "dev.lift.acl.v1",
      content: {
        schemaVersion: 1,
        hash: acceptedTransition.hash,
        bytes: base64Url(acceptedTransition.bytes),
      },
      senderUserId: "@owner:test",
      senderDeviceId: "OWNER",
      senderCurve25519Key: "owner-curve25519",
      claimedEd25519Key: "owner-ed25519",
      deviceCrossSigned: true,
      shield: "none",
      applicationSignatureVerified: true,
      verified: true,
    });

    expect(await database.aclCheckpoints.get(["ws_1", 2])).toMatchObject({
      hash: acceptedTransition.hash,
      previousHash: acceptedRoot.hash,
    });
    expect(await database.syncOutbox.get("pending-change")).toMatchObject({
      state: "paused-auth",
      lastError: "workspace-role-or-device-revoked",
    });
  });
});
