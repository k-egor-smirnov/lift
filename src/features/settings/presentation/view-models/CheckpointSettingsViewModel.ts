import { create } from "zustand";

import type { SecureRuntimeUseCases } from "../../../workspaces/application/SecureRuntime";

export interface CheckpointSettingsState {
  readonly busy: boolean;
  readonly status: string | null;
  readonly createCheckpoint: () => Promise<void>;
  readonly restoreCheckpoint: () => Promise<void>;
}

interface CheckpointSettingsDependencies {
  readonly createCheckpoint: Pick<
    SecureRuntimeUseCases["createCheckpoint"],
    "execute"
  >;
  readonly restoreCheckpoint: Pick<
    SecureRuntimeUseCases["restoreCheckpoint"],
    "execute"
  >;
}

export const createCheckpointSettingsViewModel = (
  useCases: CheckpointSettingsDependencies
) =>
  create<CheckpointSettingsState>((set) => ({
    busy: false,
    status: null,
    createCheckpoint: async () => {
      set({ busy: true, status: null });
      try {
        const { hash } = await useCases.createCheckpoint.execute();
        set({
          busy: false,
          status: `Зашифрованный checkpoint подтверждён: ${hash.slice(0, 12)}…`,
        });
      } catch (error) {
        set({
          busy: false,
          status:
            error instanceof Error
              ? error.message
              : "Не удалось создать checkpoint",
        });
      }
    },
    restoreCheckpoint: async () => {
      set({ busy: true, status: null });
      try {
        await useCases.restoreCheckpoint.execute();
        set({
          busy: false,
          status: "Состояние восстановлено из verified checkpoint",
        });
      } catch (error) {
        set({
          busy: false,
          status:
            error instanceof Error
              ? error.message
              : "Не удалось восстановить checkpoint",
        });
      }
    },
  }));
