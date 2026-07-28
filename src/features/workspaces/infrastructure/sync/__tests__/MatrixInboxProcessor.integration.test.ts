import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AcceptedRemoteChange,
  ApplyRemoteResult,
  CommitResult,
  WorkspaceUnitOfWork,
} from "../../../application/ports/WorkspaceUnitOfWork";
import { RejectedInboxEventError } from "../../../application/use-cases/ProcessInboxUseCase";
import type { WorkspaceCommand } from "../../../application/commands/WorkspaceCommand";
import { ChangeHash, WorkspaceId } from "../../../domain/WorkspaceIdentity";
import { WorkspaceRole } from "../../../domain/WorkspaceRole";
import { createEmptyWorkspace } from "../../../domain/WorkspaceState";
import { CanonicalAclCodec } from "../../acl/CanonicalAclCodec";
import type { MatrixAclBootstrapper } from "../../acl/MatrixAclBootstrapper";
import type { MatrixCheckpointReceiver } from "../../checkpoint/MatrixCheckpointReceiver";
import { AutomergeWorkspaceDocument } from "../../crdt/AutomergeWorkspaceDocument";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type {
  DecryptedMatrixWorkspaceEvent,
  MatrixWorkspaceClient,
} from "../../matrix/MatrixSdkFacade";
import { MatrixInboxProcessor } from "../MatrixInboxProcessor";

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

class RecordingUnitOfWork implements WorkspaceUnitOfWork {
  readonly remote: AcceptedRemoteChange[] = [];

  async commit(_command: WorkspaceCommand): Promise<CommitResult> {
    throw new Error("unused");
  }

  async applyRemote(input: AcceptedRemoteChange): Promise<ApplyRemoteResult> {
    this.remote.push(input);
    return {
      workspaceId: WorkspaceId(input.workspaceId),
      changeHash: ChangeHash(input.changeHash),
      status: "applied",
      appliedChangeHashes: [ChangeHash(input.changeHash)],
      heads: [ChangeHash(input.changeHash)],
    };
  }
}

const matrixClient = (
  event: DecryptedMatrixWorkspaceEvent
): MatrixWorkspaceClient =>
  ({
    decryptWorkspaceEvent: async () => event,
  }) as unknown as MatrixWorkspaceClient;

const setupHistoricalChange = async (includeChangeInSnapshot: boolean) => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();

  const document = AutomergeWorkspaceDocument.create(
    createEmptyWorkspace("ws_history", "Europe/Moscow", "06:00"),
    "aa".repeat(16)
  );
  const rootSnapshot = document.save();
  const rootHeads = [...document.heads()];
  const [change] = document.change("offline edit", (draft) => {
    draft.settings.startOfDay = "07:00";
  });
  if (change === undefined) throw new Error("Expected Automerge change");

  const codec = new CanonicalAclCodec();
  const epochOne = {
    workspaceId: "ws_history",
    authEpoch: 1,
    previousHash: null,
    members: {
      "@owner:test": WorkspaceRole.Owner,
      "@editor:test": WorkspaceRole.Editor,
    },
    revokedUsers: [],
    revokedDevices: [],
    acceptedHeads: rootHeads,
    sender: {
      userId: "@owner:test",
      deviceId: "OWNER",
      ed25519Key: "owner-ed25519",
      curve25519Key: "owner-curve25519",
    },
  } as const;
  const epochOneBytes = codec.encode(epochOne);
  const epochOneHash = await codec.hash(epochOneBytes);
  const epochTwoBytes = codec.encode({
    ...epochOne,
    authEpoch: 2,
    previousHash: epochOneHash,
    acceptedHeads: [...new Set([...rootHeads, change.hash])].sort(),
  });

  await database.aclCheckpoints.bulkAdd([
    {
      workspaceId: "ws_history",
      authEpoch: 1,
      hash: epochOneHash,
      previousHash: null,
      bytes: epochOneBytes,
      createdAt: 1,
    },
    {
      workspaceId: "ws_history",
      authEpoch: 2,
      hash: await codec.hash(epochTwoBytes),
      previousHash: epochOneHash,
      bytes: epochTwoBytes,
      createdAt: 2,
    },
  ]);
  await database.workspaceSnapshots.add({
    workspaceId: "ws_history",
    schemaVersion: 1,
    bytes: includeChangeInSnapshot ? document.save() : rootSnapshot,
    heads: includeChangeInSnapshot ? [...document.heads()] : rootHeads,
    savedAt: 2,
  });
  await database.syncTargets.add({
    id: "matrix:ws_history:primary",
    workspaceId: "ws_history",
    serverProfileId: "primary",
    roomId: "!history:test",
    mode: "active",
    state: "active",
    createdAt: 1,
    updatedAt: 1,
  });

  const event: DecryptedMatrixWorkspaceEvent = {
    eventId: "$historical",
    roomId: "!history:test",
    clearType: "dev.lift.crdt.change.v1",
    content: {
      type: "dev.lift.crdt.change.v1",
      schemaVersion: 1,
      workspaceId: "ws_history",
      authEpoch: 1,
      changeHash: change.hash,
      dependencies: change.dependencies,
      payload: { mode: "inline", bytes: base64Url(change.bytes) },
    },
    senderUserId: "@editor:test",
    senderDeviceId: "EDITOR",
    senderCurve25519Key: "editor-curve25519",
    claimedEd25519Key: "editor-ed25519",
    deviceCrossSigned: true,
    shield: "none",
    applicationSignatureVerified: true,
    verified: true,
  };
  const unitOfWork = new RecordingUnitOfWork();
  const processor = new MatrixInboxProcessor(
    database,
    matrixClient(event),
    undefined as unknown as MatrixAclBootstrapper,
    unitOfWork,
    "bb".repeat(16)
  );
  const item = {
    eventId: "$historical",
    roomId: "!history:test",
    workspaceId: "ws_history",
    wireEvent: "{}",
  };

  return { database, processor, unitOfWork, item, change };
};

describe("MatrixInboxProcessor historical ACL epochs", () => {
  it("delegates encrypted checkpoint events to the checkpoint receiver", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    const event = {
      eventId: "$checkpoint",
      roomId: "!checkpoint:test",
      clearType: "dev.lift.checkpoint.v1",
      content: {},
      senderUserId: "@owner:test",
      senderDeviceId: "OWNER",
      senderCurve25519Key: "curve",
      claimedEd25519Key: "ed",
      deviceCrossSigned: true,
      shield: "none" as const,
      applicationSignatureVerified: true,
      verified: true,
    };
    const received: DecryptedMatrixWorkspaceEvent[] = [];
    const checkpointReceiver = {
      accept: async (input: DecryptedMatrixWorkspaceEvent) => {
        received.push(input);
        return true;
      },
    } as MatrixCheckpointReceiver;
    const processor = new MatrixInboxProcessor(
      database,
      matrixClient(event),
      undefined as unknown as MatrixAclBootstrapper,
      new RecordingUnitOfWork(),
      "bb".repeat(16),
      undefined,
      checkpointReceiver
    );

    await processor.process({
      eventId: "$checkpoint",
      roomId: "!checkpoint:test",
      workspaceId: null,
      wireEvent: "{}",
    });

    expect(received).toEqual([event]);
  });

  it("accepts an older-epoch change already covered by the current signed snapshot", async () => {
    const { database, processor, unitOfWork, item, change } =
      await setupHistoricalChange(true);
    const snapshot = await database.workspaceSnapshots.get("ws_history");
    expect(
      AutomergeWorkspaceDocument.load(
        new Uint8Array([...snapshot!.bytes]),
        "cc".repeat(16)
      ).containsHeads([change.hash])
    ).toBe(true);

    await processor.process(item);

    expect(unitOfWork.remote).toHaveLength(1);
    expect(unitOfWork.remote[0]).toMatchObject({
      changeHash: change.hash,
      senderUserId: "@editor:test",
      senderDeviceId: "EDITOR",
    });
  });

  it("rejects an older-epoch change outside the current accepted frontier", async () => {
    const { processor, item } = await setupHistoricalChange(false);

    await expect(processor.process(item)).rejects.toMatchObject({
      code: "change-outside-accepted-frontier",
    } satisfies Partial<RejectedInboxEventError>);
  });
});
