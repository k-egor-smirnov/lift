import { ServerProfile } from "../../../domain/ServerProfile";
import {
  DexieServerProfileRepository,
  ServerProfileInUseError,
} from "../DexieServerProfileRepository";
import { LiftSecureDatabase } from "../LiftSecureDatabase";

describe("DexieServerProfileRepository", () => {
  it("selects one active target and protects attached profiles", async () => {
    const database = new LiftSecureDatabase(
      `LiftSecureDatabase-server-profiles-${crypto.randomUUID()}`
    );
    await database.open();
    const repository = new DexieServerProfileRepository(database);
    await repository.save(
      ServerProfile.create({
        id: "primary",
        name: "Primary",
        baseUrl: "http://127.0.0.1:8008/",
      })
    );
    await repository.save(
      ServerProfile.create({
        id: "secondary",
        name: "Secondary",
        baseUrl: "http://127.0.0.1:8009",
      })
    );
    await database.syncTargets.bulkAdd([
      {
        id: "target-primary",
        workspaceId: "ws-1",
        serverProfileId: "primary",
        roomId: "!primary:test",
        mode: "candidate",
        state: "active",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "target-secondary",
        workspaceId: "ws-1",
        serverProfileId: "secondary",
        roomId: "!secondary:test",
        mode: "candidate",
        state: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    await repository.activateTarget("ws-1", "target-primary");
    expect(await repository.getActiveTarget("ws-1")).toMatchObject({
      id: "target-primary",
      serverProfileId: "primary",
    });
    await repository.activateTarget("ws-1", "target-secondary");
    expect(await repository.getActiveTarget("ws-1")).toMatchObject({
      id: "target-secondary",
      serverProfileId: "secondary",
    });
    expect(await database.syncTargets.get("target-primary")).toMatchObject({
      mode: "candidate",
    });

    await expect(repository.delete("secondary")).rejects.toBeInstanceOf(
      ServerProfileInUseError
    );
    await database.syncTargets.update("target-secondary", { state: "retired" });
    await repository.delete("secondary");
    expect(await repository.get("secondary")).toBeUndefined();
    await database.delete();
  });
});
