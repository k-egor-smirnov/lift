import { describe, expect, it } from "vitest";

import { WorkspaceId } from "../../../domain/WorkspaceIdentity";
import type { CheckpointStore } from "../../ports/CheckpointStore";
import type { CurrentWorkspace } from "../../ports/CurrentWorkspace";
import { CreateCheckpointUseCase } from "../CreateCheckpointUseCase";
import { RestoreCheckpointUseCase } from "../RestoreCheckpointUseCase";

describe("checkpoint use cases", () => {
  it("publishes and restores only the current workspace", async () => {
    const calls: string[] = [];
    const workspace: CurrentWorkspace = {
      getId: () => WorkspaceId("ws_1"),
      requireId: () => WorkspaceId("ws_1"),
    };
    const store: CheckpointStore = {
      publish: async (workspaceId) => {
        calls.push(`publish:${workspaceId}`);
        return {
          hash: "aa".repeat(32),
          workspaceId,
          authEpoch: 1,
          heads: ["bb".repeat(32)],
        };
      },
      restoreLatest: async (workspaceId) => {
        calls.push(`restore:${workspaceId}`);
        return {
          workspaceId,
          checkpointHashes: ["aa".repeat(32)],
          heads: ["bb".repeat(32)],
        };
      },
    };

    await new CreateCheckpointUseCase(workspace, store).execute();
    await new RestoreCheckpointUseCase(workspace, store).execute();

    expect(calls).toEqual(["publish:ws_1", "restore:ws_1"]);
  });
});
