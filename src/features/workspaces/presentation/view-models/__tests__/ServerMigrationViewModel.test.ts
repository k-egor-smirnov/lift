import { describe, expect, it, vi } from "vitest";

import { createServerMigrationViewModel } from "../ServerMigrationViewModel";

describe("ServerMigrationViewModel", () => {
  it("requires explicit mappings and clears recovery secrets after success", async () => {
    const execute = vi.fn(async () => ({
      sourceTargetId: "source",
      targetTargetId: "target",
      checkpointHash: "ab".repeat(32),
      certificateHash: "cd".repeat(32),
      targetHeads: ["ef".repeat(32)],
    }));
    const store = createServerMigrationViewModel({ execute });
    store.getState().configureMembers(["@alice:primary"]);

    await store.getState().migrate();
    expect(execute).not.toHaveBeenCalled();
    expect(store.getState().status).toMatch(/Заполните сервер/);

    store.getState().setTargetProfileId("secondary");
    store.getState().setUsername("alice");
    store.getState().setPassword("password");
    store.getState().setRecoveryKey("recovery");
    store.getState().setTargetUserId("@alice:primary", "@alice:secondary");
    await store.getState().migrate();

    expect(execute).toHaveBeenCalledWith({
      targetProfileId: "secondary",
      username: "alice",
      password: "password",
      recoveryKey: "recovery",
      memberMappings: [
        {
          sourceUserId: "@alice:primary",
          targetUserId: "@alice:secondary",
        },
      ],
    });
    expect(store.getState()).toMatchObject({
      busy: false,
      password: "",
      recoveryKey: "",
    });
    expect(store.getState().status).toMatch(/Миграция подтверждена/);
  });
});
