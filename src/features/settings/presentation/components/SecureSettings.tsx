import { useEffect, useMemo, useState } from "react";
import { KeyRound, LockKeyhole, Server, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  SecureRuntime,
  SecureSyncDiagnostics,
} from "../../../workspaces/application/SecureRuntime";
import type { MatrixSessionSnapshot } from "../../../workspaces/application/ports/MatrixSession";
import type { WorkspaceAclCheckpoint } from "../../../workspaces/domain/WorkspaceAcl";
import { WorkspaceRole } from "../../../workspaces/domain/WorkspaceRole";
import { ResultUtils } from "../../../../shared/domain/Result";
import { MatrixSetupViewModel } from "../../../workspaces/presentation/view-models/MatrixSetupViewModel";
import { MatrixSetupWizard } from "../../../workspaces/presentation/components/MatrixSetupWizard";
import { MATRIX_AUTHENTICATION_CAPABILITIES } from "../../../workspaces/application/security/MatrixAuthenticationCapabilities";

interface SecureSettingsProps {
  readonly runtime: SecureRuntime;
}

export const SecureSettings = ({ runtime }: SecureSettingsProps) => {
  const { i18n } = useTranslation();
  const [matrix, setMatrix] = useState<MatrixSessionSnapshot>(
    runtime.matrixSession.snapshot()
  );
  const [sync, setSync] = useState<SecureSyncDiagnostics | null>(null);
  const [acl, setAcl] = useState<WorkspaceAclCheckpoint | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [startOfDay, setStartOfDay] = useState("04:00");
  const [status, setStatus] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<
    WorkspaceRole.Admin | WorkspaceRole.Editor | WorkspaceRole.Viewer
  >(WorkspaceRole.Editor);
  const [revokeUserId, setRevokeUserId] = useState("");
  const [revokeDeviceId, setRevokeDeviceId] = useState("");
  const matrixSetup = useMemo(
    () => new MatrixSetupViewModel(runtime.matrixSession),
    [runtime]
  );

  useEffect(() => runtime.matrixSession.subscribe(setMatrix), [runtime]);
  useEffect(() => {
    const load = async () => {
      setSync(await runtime.syncDiagnostics());
      setAcl(await runtime.workspaceAcl().catch(() => null));
      const settings = await runtime.workspaceSettings();
      setTimezone(settings.timezone);
      setStartOfDay(settings.startOfDay);
    };
    void load();
    const interval = setInterval(() => void load(), 1_000);
    return () => clearInterval(interval);
  }, [runtime]);
  const save = async () => {
    const result = await runtime.useCases.updateWorkspaceSettings.execute({
      timezone,
      startOfDay,
    });
    setStatus(
      ResultUtils.isSuccess(result)
        ? "Настройки сохранены и синхронизируются"
        : result.error.message
    );
  };

  const accessOperation = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
      setAcl(await runtime.workspaceAcl());
      setStatus("Права обновлены, ACL и Matrix power levels согласованы");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Не удалось изменить права"
      );
    }
  };

  const currentRole =
    matrix.userId === null ? undefined : acl?.members[matrix.userId];
  const canAdminister =
    currentRole === WorkspaceRole.Owner || currentRole === WorkspaceRole.Admin;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <LockKeyhole className="h-5 w-5 text-green-600" />
          <div>
            <h2 className="font-semibold">Сквозное шифрование</h2>
            <p className="text-sm text-gray-500">
              Matrix Olm/Megolm, cross-signing, secret storage и backup ключей
            </p>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Сессия</dt>
            <dd className="font-medium">{matrix.phase}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Устройство</dt>
            <dd className="break-all font-mono text-xs">
              {matrix.deviceId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Пользователь</dt>
            <dd className="break-all">{matrix.userId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Транспорт</dt>
            <dd className="flex items-center gap-2">
              {sync?.matrixLive ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-amber-600" />
              )}
              {sync?.matrixLive
                ? `Matrix ${sync.matrixSyncState}`
                : "Оффлайн — изменения сохраняются локально"}
            </dd>
          </div>
        </dl>
        {matrix.phase === "ready" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {MATRIX_AUTHENTICATION_CAPABILITIES.sasEmojiVerification ? (
              <button
                type="button"
                onClick={() =>
                  void runtime.matrixSession
                    .requestDeviceVerification()
                    .catch((error) =>
                      setStatus(
                        error instanceof Error
                          ? error.message
                          : "Не удалось начать проверку"
                      )
                    )
                }
                className="rounded-md border px-3 py-2 text-sm font-medium"
              >
                Подтвердить другое устройство
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void runtime.matrixSession
                  .logout()
                  .then(() =>
                    setStatus("Matrix-сессия удалена с этого устройства")
                  )
                  .catch((error) =>
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : "Не удалось завершить Matrix-сессию"
                    )
                  )
              }
              className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
            >
              Выйти из Matrix
            </button>
          </div>
        ) : (
          <div className="mt-5 border-t pt-5">
            <MatrixSetupWizard
              viewModel={matrixSetup}
              profiles={runtime.matrixProfiles}
            />
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">Участники и доступ</h2>
          <p className="text-sm text-gray-500">
            Зашифрованный ACL является источником истины; Matrix power levels
            дают дополнительную серверную защиту.
          </p>
        </div>
        {acl === null ? (
          <p className="text-sm text-gray-500">
            ACL доступен после подключения рабочего пространства к Matrix.
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(acl.members)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([userId, role]) => (
                <div
                  key={userId}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 break-all">
                    {userId}
                    {userId === matrix.userId ? " · это вы" : ""}
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-1 font-medium">
                    {role}
                  </span>
                  {canAdminister &&
                    userId !== matrix.userId &&
                    role !== WorkspaceRole.Owner && (
                      <>
                        <select
                          aria-label={`Роль ${userId}`}
                          defaultValue={role}
                          onChange={(event) =>
                            void accessOperation(() =>
                              runtime.useCases.changeWorkspaceRole.execute({
                                workspaceId: acl.workspaceId,
                                userId,
                                role: event.target.value as
                                  | WorkspaceRole.Admin
                                  | WorkspaceRole.Editor
                                  | WorkspaceRole.Viewer,
                              })
                            )
                          }
                          className="rounded border bg-white px-2 py-1"
                        >
                          {currentRole === WorkspaceRole.Owner && (
                            <option value={WorkspaceRole.Admin}>Admin</option>
                          )}
                          <option value={WorkspaceRole.Editor}>Editor</option>
                          <option value={WorkspaceRole.Viewer}>Viewer</option>
                        </select>
                        {currentRole === WorkspaceRole.Owner && (
                          <button
                            onClick={() =>
                              void accessOperation(() =>
                                runtime.useCases.transferWorkspaceOwnership.execute(
                                  {
                                    workspaceId: acl.workspaceId,
                                    nextOwnerUserId: userId,
                                  }
                                )
                              )
                            }
                            className="rounded border px-2 py-1"
                          >
                            Передать владение
                          </button>
                        )}
                        <button
                          onClick={() =>
                            void accessOperation(() =>
                              runtime.useCases.removeWorkspaceMember.execute({
                                workspaceId: acl.workspaceId,
                                userId,
                              })
                            )
                          }
                          className="rounded border border-red-200 px-2 py-1 text-red-700"
                        >
                          Удалить
                        </button>
                      </>
                    )}
                </div>
              ))}
            {canAdminister && (
              <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  aria-label="Matrix ID нового участника"
                  placeholder="@user:server"
                  value={memberUserId}
                  onChange={(event) => setMemberUserId(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                />
                <select
                  value={memberRole}
                  onChange={(event) =>
                    setMemberRole(event.target.value as typeof memberRole)
                  }
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                >
                  {currentRole === WorkspaceRole.Owner && (
                    <option value={WorkspaceRole.Admin}>Admin</option>
                  )}
                  <option value={WorkspaceRole.Editor}>Editor</option>
                  <option value={WorkspaceRole.Viewer}>Viewer</option>
                </select>
                <button
                  onClick={() =>
                    void accessOperation(async () => {
                      await runtime.useCases.inviteWorkspaceMember.execute({
                        workspaceId: acl.workspaceId,
                        userId: memberUserId,
                        role: memberRole,
                      });
                      setMemberUserId("");
                    })
                  }
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white"
                >
                  Пригласить
                </button>
              </div>
            )}
            {canAdminister && (
              <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  aria-label="Matrix ID владельца устройства"
                  placeholder="@user:server"
                  value={revokeUserId}
                  onChange={(event) => setRevokeUserId(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                />
                <input
                  aria-label="ID отзываемого устройства"
                  placeholder="DEVICE_ID"
                  value={revokeDeviceId}
                  onChange={(event) => setRevokeDeviceId(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                />
                <button
                  onClick={() =>
                    void accessOperation(() =>
                      runtime.useCases.revokeWorkspaceDevice.execute({
                        workspaceId: acl.workspaceId,
                        userId: revokeUserId,
                        deviceId: revokeDeviceId,
                      })
                    )
                  }
                  className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700"
                >
                  Отозвать устройство
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Server className="h-5 w-5 text-blue-600" />
          <div>
            <h2 className="font-semibold">Синхронизация</h2>
            <p className="text-sm text-gray-500">
              Сервер видит только зашифрованные события
            </p>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            Outbox: <b>{sync?.pendingOutbox ?? 0}</b> ожидает /{" "}
            {sync?.acknowledgedOutbox ?? 0} подтверждено
          </p>
          <p>
            Inbox: <b>{sync?.pendingInbox ?? 0}</b> ожидает
          </p>
          <p>
            Ключи: <b>{sync?.waitingKeys ?? 0}</b> / карантин:{" "}
            {sync?.quarantined ?? 0} / dead-letter: {sync?.deadLetters ?? 0}
          </p>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-purple-600" />
          <div>
            <h2 className="font-semibold">Рабочий день</h2>
            <p className="text-sm text-gray-500">
              Дата вычисляется детерминированно на каждом клиенте; мастер-клиент
              не нужен
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Часовой пояс
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-medium">
            Начало дня
            <input
              type="time"
              value={startOfDay}
              onChange={(event) => setStartOfDay(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-normal"
            />
          </label>
        </div>
        <button
          onClick={() => void save()}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm text-white"
        >
          Сохранить
        </button>
        {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Язык</h2>
        <select
          value={i18n.language}
          onChange={(event) => void i18n.changeLanguage(event.target.value)}
          className="rounded-md border bg-white px-3 py-2"
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </section>
    </div>
  );
};
