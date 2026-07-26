import { afterEach, describe, expect, it } from "vitest";
import type { MatrixWorkspaceClient } from "../MatrixSdkFacade";
import { MatrixWorkspaceRoom } from "../MatrixWorkspaceRoom";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";

const databases: LiftSecureDatabase[] = [];

const openDatabase = async (): Promise<LiftSecureDatabase> => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    })
  );
});

const fakeClient = (wireType = "m.room.encrypted") => {
  let sent:
    | {
        type: string;
        content: Readonly<Record<string, unknown>>;
        transactionId: string;
      }
    | undefined;
  const published: Array<{
    type: string;
    content: Readonly<Record<string, unknown>>;
  }> = [];
  const client = {
    createEncryptedWorkspaceRoom: async () => "!opaque:test",
    ownDeviceKeys: async () => ({
      ed25519: "ed25519-public",
      curve25519: "curve25519-public",
    }),
    sendEncryptedWorkspaceEvent: async (
      _roomId: string,
      type: string,
      content: Readonly<Record<string, unknown>>,
      transactionId: string
    ) => {
      sent = { type, content, transactionId };
      return "$acl";
    },
    readWorkspaceEvent: async () => {
      if (sent === undefined) throw new Error("nothing sent");
      return { wireType, clearType: sent.type, content: sent.content };
    },
    publishWorkspaceState: async (
      _roomId: string,
      type: string,
      content: Readonly<Record<string, unknown>>
    ) => {
      published.push({ type, content });
      return "$head";
    },
    signWorkspaceContent: async (content) => content,
    subscribeWorkspaceEvents: () => () => undefined,
    listWorkspaceWireEvents: () => [],
    decryptWorkspaceEvent: async () => {
      throw new Error("unused");
    },
  } as MatrixWorkspaceClient;
  return { client, published, sent: () => sent };
};

describe("MatrixWorkspaceRoom", () => {
  it("activates a target only after encrypted ACL read-back validation", async () => {
    const database = await openDatabase();
    const fake = fakeClient();
    const rooms = new MatrixWorkspaceRoom(database, {
      requireAuthenticatedClient: () => fake.client,
    });

    const binding = await rooms.ensureRoot({
      workspaceId: "ws_1",
      profileId: "primary",
      ownerUserId: "@alice:test",
      ownerDeviceId: "ALICE_DEVICE",
      acceptedHeads: ["head-b", "head-a"],
      bootstrapSnapshot: new Uint8Array([9, 8, 7]),
    });

    expect(binding).toMatchObject({ roomId: "!opaque:test", authEpoch: 1 });
    expect(fake.sent()).toMatchObject({
      type: "dev.lift.acl.v1",
      transactionId: `lift.acl.${binding.aclHash}`,
    });
    expect(fake.published).toEqual([
      {
        type: "dev.lift.acl.head.v1",
        content: { authEpoch: 1, hash: binding.aclHash },
      },
    ]);
    expect(await database.syncTargets.get(binding.targetId)).toMatchObject({
      mode: "active",
      state: "active",
    });
    expect(await database.aclCheckpoints.get(["ws_1", 1])).toMatchObject({
      hash: binding.aclHash,
    });
    expect(JSON.stringify(fake.sent())).not.toContain("title");
  });

  it("leaves a failed wire-encryption attempt detached and retryable", async () => {
    const database = await openDatabase();
    const fake = fakeClient("dev.lift.acl.v1");
    const rooms = new MatrixWorkspaceRoom(database, {
      requireAuthenticatedClient: () => fake.client,
    });

    await expect(
      rooms.ensureRoot({
        workspaceId: "ws_1",
        profileId: "primary",
        ownerUserId: "@alice:test",
        ownerDeviceId: "ALICE_DEVICE",
        acceptedHeads: [],
        bootstrapSnapshot: new Uint8Array([1]),
      })
    ).rejects.toThrow("not encrypted on the wire");
    expect(await database.syncTargets.toCollection().first()).toMatchObject({
      mode: "candidate",
      state: "paused",
    });
    expect(await database.aclCheckpoints.count()).toBe(0);
  });
});
