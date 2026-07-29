import { useEffect } from "react";

import type { SecureRuntimeMatrixProfile } from "../../application/SecureRuntime";
import type { ServerMigrationViewModelState } from "../view-models/ServerMigrationViewModel";

interface ServerMigrationDialogProps {
  readonly store: {
    (): ServerMigrationViewModelState;
  };
  readonly profiles: readonly SecureRuntimeMatrixProfile[];
  readonly currentProfileId: string | null;
  readonly sourceUserIds: readonly string[];
}

export const ServerMigrationDialog = ({
  store,
  profiles,
  currentProfileId,
  sourceUserIds,
}: ServerMigrationDialogProps) => {
  const state = store();
  const sourceKey = [...sourceUserIds].sort().join("\0");
  useEffect(() => {
    state.configureMembers(sourceUserIds);
    // Source identities are the stable input; the action identity itself is
    // intentionally excluded to avoid reconfiguring on every Zustand render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  const targets = profiles.filter(({ id }) => id !== currentProfileId);

  return (
    <section
      aria-label="Миграция Matrix-сервера"
      className="rounded-xl border bg-white p-5 shadow-sm"
    >
      <h2 className="font-semibold">Миграция Matrix-сервера</h2>
      <p className="mt-1 text-sm text-gray-500">
        Secondary должен иметь заранее защищённый аккаунт. Lift проверит ключ
        восстановления, перенесёт только E2EE-события и оставит исходный room
        read-only.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Целевой Matrix-сервер
          <select
            aria-label="Целевой Matrix-сервер"
            value={state.targetProfileId}
            onChange={(event) => state.setTargetProfileId(event.target.value)}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-normal"
          >
            <option value="">Выберите сервер</option>
            {targets.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profile.baseUrl}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Пользователь secondary
          <input
            aria-label="Пользователь secondary"
            value={state.username}
            onChange={(event) => state.setUsername(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-medium">
          Пароль secondary
          <input
            type="password"
            aria-label="Пароль secondary"
            value={state.password}
            onChange={(event) => state.setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-medium">
          Ключ восстановления secondary
          <textarea
            aria-label="Ключ восстановления secondary"
            value={state.recoveryKey}
            onChange={(event) => state.setRecoveryKey(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 font-mono text-xs font-normal"
          />
        </label>
      </div>
      <div className="mt-4 space-y-2 border-t pt-4">
        <p className="text-sm font-medium">Явное сопоставление участников</p>
        {[...sourceUserIds].sort().map((sourceUserId) => (
          <label
            key={sourceUserId}
            className="grid gap-1 text-sm sm:grid-cols-2 sm:items-center"
          >
            <span className="break-all text-gray-600">{sourceUserId}</span>
            <input
              aria-label={`Matrix ID на новом сервере для ${sourceUserId}`}
              placeholder="@user:secondary.localhost"
              value={state.mappings[sourceUserId] ?? ""}
              onChange={(event) =>
                state.setTargetUserId(sourceUserId, event.target.value)
              }
              className="rounded-md border px-3 py-2"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={state.busy || targets.length === 0}
        onClick={() => void state.migrate()}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {state.busy ? "Проверяем и переносим…" : "Мигрировать сервер"}
      </button>
      {state.status !== null && (
        <p className="mt-2 text-sm text-gray-600">{state.status}</p>
      )}
    </section>
  );
};
