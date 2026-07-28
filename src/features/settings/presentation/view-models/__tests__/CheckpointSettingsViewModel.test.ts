import { describe, expect, it, vi } from "vitest";

import { createCheckpointSettingsViewModel } from "../CheckpointSettingsViewModel";

describe("CheckpointSettingsViewModel", () => {
  it("owns checkpoint command lifecycle and presentation status", async () => {
    const createCheckpoint = vi.fn(async () => ({
      hash: "ab".repeat(32),
      workspaceId: "ws",
      authEpoch: 1,
      heads: ["cd".repeat(32)],
    }));
    const restoreCheckpoint = vi.fn(async () => ({
      workspaceId: "ws",
      checkpointHashes: ["ab".repeat(32)],
      heads: ["cd".repeat(32)],
    }));
    const viewModel = createCheckpointSettingsViewModel({
      createCheckpoint: { execute: createCheckpoint },
      restoreCheckpoint: { execute: restoreCheckpoint },
    });

    await viewModel.getState().createCheckpoint();
    expect(viewModel.getState()).toMatchObject({
      busy: false,
      status: `Зашифрованный checkpoint подтверждён: ${"ab".repeat(6)}…`,
    });

    await viewModel.getState().restoreCheckpoint();
    expect(viewModel.getState()).toMatchObject({
      busy: false,
      status: "Состояние восстановлено из verified checkpoint",
    });
  });
});
