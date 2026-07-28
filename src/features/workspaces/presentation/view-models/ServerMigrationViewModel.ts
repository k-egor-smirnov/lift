import { create } from "zustand";

import type { MigrateWorkspaceServerUseCase } from "../../application/use-cases/MigrateWorkspaceServerUseCase";

export interface ServerMigrationViewModelState {
  readonly targetProfileId: string;
  readonly username: string;
  readonly password: string;
  readonly recoveryKey: string;
  readonly mappings: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly status: string | null;
  readonly setTargetProfileId: (value: string) => void;
  readonly setUsername: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setRecoveryKey: (value: string) => void;
  readonly configureMembers: (sourceUserIds: readonly string[]) => void;
  readonly setTargetUserId: (
    sourceUserId: string,
    targetUserId: string
  ) => void;
  readonly migrate: () => Promise<void>;
}

export const createServerMigrationViewModel = (
  useCase: Pick<MigrateWorkspaceServerUseCase, "execute">
) =>
  create<ServerMigrationViewModelState>((set, get) => ({
    targetProfileId: "",
    username: "",
    password: "",
    recoveryKey: "",
    mappings: {},
    busy: false,
    status: null,
    setTargetProfileId: (targetProfileId) =>
      set({ targetProfileId, status: null }),
    setUsername: (username) => set({ username, status: null }),
    setPassword: (password) => set({ password, status: null }),
    setRecoveryKey: (recoveryKey) => set({ recoveryKey, status: null }),
    configureMembers: (sourceUserIds) =>
      set(({ mappings }) => ({
        mappings: Object.fromEntries(
          [...sourceUserIds]
            .sort()
            .map((sourceUserId) => [sourceUserId, mappings[sourceUserId] ?? ""])
        ),
      })),
    setTargetUserId: (sourceUserId, targetUserId) =>
      set(({ mappings }) => ({
        mappings: { ...mappings, [sourceUserId]: targetUserId },
        status: null,
      })),
    migrate: async () => {
      const state = get();
      const memberMappings = Object.entries(state.mappings).map(
        ([sourceUserId, targetUserId]) => ({
          sourceUserId,
          targetUserId: targetUserId.trim(),
        })
      );
      if (
        state.targetProfileId.length === 0 ||
        state.username.trim().length === 0 ||
        state.password.length === 0 ||
        state.recoveryKey.trim().length === 0 ||
        memberMappings.length === 0 ||
        memberMappings.some(({ targetUserId }) => targetUserId.length === 0)
      ) {
        set({
          status:
            "Заполните сервер, пароль, ключ восстановления и все сопоставления Matrix ID",
        });
        return;
      }
      set({
        busy: true,
        status: "Проверяем secondary и переносим шифрованное состояние…",
      });
      try {
        const result = await useCase.execute({
          targetProfileId: state.targetProfileId,
          username: state.username.trim(),
          password: state.password,
          recoveryKey: state.recoveryKey.trim(),
          memberMappings,
        });
        set({
          busy: false,
          password: "",
          recoveryKey: "",
          status: `Миграция подтверждена: ${result.certificateHash.slice(0, 12)}…`,
        });
      } catch (error) {
        set({
          busy: false,
          status:
            error instanceof Error
              ? error.message
              : "Не удалось мигрировать Matrix-сервер",
        });
      }
    },
  }));
