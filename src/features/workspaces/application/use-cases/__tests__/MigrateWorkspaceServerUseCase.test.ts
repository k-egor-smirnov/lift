import { describe, expect, it, vi } from "vitest";

import type { CurrentWorkspace } from "../../ports/CurrentWorkspace";
import { MigrateWorkspaceServerUseCase } from "../MigrateWorkspaceServerUseCase";

describe("MigrateWorkspaceServerUseCase", () => {
  it("binds the selected workspace and forwards only explicit credentials and member mappings", async () => {
    const migrate = vi.fn(async () => ({
      sourceTargetId: "source",
      targetTargetId: "target",
      checkpointHash: "ab".repeat(32),
      certificateHash: "cd".repeat(32),
      targetHeads: ["ef".repeat(32)],
    }));
    const workspace = {
      getId: () => "ws_1",
      requireId: () => "ws_1",
    } as CurrentWorkspace;
    const useCase = new MigrateWorkspaceServerUseCase(workspace, { migrate });

    await useCase.execute({
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

    expect(migrate).toHaveBeenCalledWith({
      workspaceId: "ws_1",
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
  });
});
