import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import {
  workspaceDeviceRef,
  type WorkspaceAclCheckpoint,
} from "../../../domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
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
