import type { SyncHealth } from "../../application/queries/GetSyncHealthQuery";

const label = (health: SyncHealth): string => {
  switch (health.kind) {
    case "synced":
      return "Синхронизировано";
    case "sending":
      return `${health.pendingOutbox} изм. ожидает отправки`;
    case "receiving":
      return `${health.pendingInbox} изм. применяется`;
    case "offline-usable":
      return "Оффлайн · изменения сохранены";
    case "waiting-verification":
      return "Нужно подтвердить устройство";
    case "waiting-keys":
      return `Ожидание ключей: ${health.waitingKeys}`;
    case "authorization-paused":
      return "Доступ изменён · отправка приостановлена";
    case "quarantined":
      return `Карантин: ${health.quarantined}`;
    case "error":
      return "Ошибка синхронизации";
  }
};

const color = (health: SyncHealth): string => {
  if (health.kind === "synced") return "bg-green-500";
  if (health.kind === "sending" || health.kind === "receiving")
    return "bg-blue-500";
  if (health.kind === "error" || health.kind === "quarantined")
    return "bg-red-500";
  return "bg-amber-500";
};

export const SyncStatusIndicator = ({
  health,
}: {
  readonly health: SyncHealth;
}) => (
  <div
    className="fixed right-4 top-4 z-50 rounded-full border bg-white/95 px-3 py-1 text-xs shadow-sm md:top-6"
    data-testid="connection-state"
    role="status"
  >
    <span
      className={`mr-2 inline-block h-2 w-2 rounded-full ${color(health)}`}
    />
    {label(health)}
  </div>
);
