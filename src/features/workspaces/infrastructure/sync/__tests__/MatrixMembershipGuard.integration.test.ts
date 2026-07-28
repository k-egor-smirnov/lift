import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type {
  MatrixWorkspaceClient,
  MatrixWorkspaceMembershipEvent,
} from "../../matrix/MatrixSdkFacade";
import { MatrixMembershipGuard } from "../MatrixMembershipGuard";

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

describe("MatrixMembershipGuard", () => {
  it("fails closed when Matrix reports that this user left the workspace room", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    await database.syncTargets.add({
      id: "target-1",
      workspaceId: "ws_1",
      serverProfileId: "primary",
      roomId: "!workspace:test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await database.syncOutbox.add({
      id: "pending-change",
      workspaceId: "ws_1",
      targetId: "target-1",
      changeHash: "change-1",
      innerType: "dev.lift.crdt.change.v1",
      authEpoch: 1,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: 0,
      lastError: null,
      matrixTxnId: "txn-1",
      matrixEventIds: [],
      nextFragmentIndex: 0,
    });
    let listener:
      | ((event: MatrixWorkspaceMembershipEvent) => void | Promise<void>)
      | undefined;
    const matrix = {
      subscribeWorkspaceMembership: (next: typeof listener) => {
        listener = next;
        return () => undefined;
      },
      workspaceMembership: () => "join",
    } as unknown as MatrixWorkspaceClient;
    const guard = new MatrixMembershipGuard(database, matrix, () => 10);
    await guard.start();

    await listener?.({
      roomId: "!workspace:test",
      membership: "leave",
    });

    expect(await database.syncTargets.get("target-1")).toMatchObject({
      mode: "read-only",
      state: "paused",
      updatedAt: 10,
    });
    expect(await database.syncOutbox.get("pending-change")).toMatchObject({
      state: "paused-auth",
      lastError: "matrix-workspace-membership-revoked",
    });
  });

  it("does not treat a not-yet-hydrated room as authenticated revocation", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-test-${crypto.randomUUID()}`
    );
    databases.push(database);
    await database.open();
    await database.syncTargets.add({
      id: "target-unknown",
      workspaceId: "ws_unknown",
      serverProfileId: "primary",
      roomId: "!unknown:test",
      mode: "active",
      state: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const matrix = {
      subscribeWorkspaceMembership: () => () => undefined,
      workspaceMembership: () => null,
    } as unknown as MatrixWorkspaceClient;

    await new MatrixMembershipGuard(database, matrix, () => 10).start();

    expect(await database.syncTargets.get("target-unknown")).toMatchObject({
      mode: "active",
      state: "active",
      updatedAt: 1,
    });
  });
});
