import { useState, useSyncExternalStore } from "react";
import { ShieldCheck, Smartphone, X } from "lucide-react";

import type { MatrixSession } from "../../application/ports/MatrixSession";

interface MatrixDeviceVerificationProps {
  readonly session: MatrixSession;
}

export const MatrixDeviceVerification = ({
  session,
}: MatrixDeviceVerificationProps) => {
  const snapshot = useSyncExternalStore(
    (listener) => session.subscribeVerification(listener),
    () => session.verificationSnapshot(),
    () => session.verificationSnapshot()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    snapshot.phase === "idle" ||
    snapshot.phase === "done" ||
    snapshot.phase === "cancelled"
  ) {
    return null;
  }

  const act = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch {
      setError(
        "Не удалось продолжить проверку. Убедитесь, что второе устройство подключено."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Подтверждение Matrix-устройства"
    >
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Подтверждение нового устройства</h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {snapshot.otherDeviceId === null
                ? snapshot.otherUserId
                : `Устройство ${snapshot.otherDeviceId}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Отклонить проверку"
            disabled={busy}
            onClick={() => void act(() => session.rejectDeviceVerification())}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {snapshot.phase === "requested" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm leading-relaxed">
              {snapshot.initiatedByMe
                ? "Запрос отправлен на ваши другие Matrix-устройства. Подтвердите его там."
                : "Другое устройство просит подтвердить, что оно принадлежит вам."}
            </p>
            {!snapshot.initiatedByMe && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => session.acceptDeviceVerification())
                }
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
              >
                Принять и сравнить
              </button>
            )}
          </div>
        )}

        {snapshot.phase === "ready" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm">
              Оба устройства готовы. Запустите безопасное сравнение.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => session.startSasVerification())}
              className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              Показать эмодзи
            </button>
          </div>
        )}

        {snapshot.phase === "verifying" && (
          <p role="status" className="mt-5 text-sm text-muted-foreground">
            Устанавливаем защищённый канал сравнения…
          </p>
        )}

        {snapshot.phase === "sas" && (
          <div className="mt-5 space-y-5">
            <p className="text-sm leading-relaxed">
              Сравните символы с другим устройством. Порядок должен совпасть
              полностью.
            </p>
            {snapshot.emojis.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {snapshot.emojis.map((item, index) => (
                  <div
                    key={`${item.symbol}-${index}`}
                    className="rounded-lg bg-muted p-2 text-center"
                  >
                    <div className="text-2xl" aria-hidden="true">
                      {item.symbol}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-4 text-center font-mono text-xl tracking-wider">
                {snapshot.decimals.join(" · ")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => session.rejectDeviceVerification())
                }
                className="rounded-lg border px-4 py-2.5 font-medium"
              >
                Не совпадает
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => session.confirmDeviceVerification())
                }
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white"
              >
                <ShieldCheck className="h-4 w-4" /> Совпадает
              </button>
            </div>
          </div>
        )}

        {(snapshot.phase === "error" || error !== null) && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error ?? "Проверка была прервана. Запустите её заново."}
          </p>
        )}
      </section>
    </div>
  );
};
