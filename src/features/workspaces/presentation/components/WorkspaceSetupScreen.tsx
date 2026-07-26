import React, { useEffect, useState } from "react";
import {
  MatrixSetupWizard,
  type MatrixSetupProfileOption,
} from "./MatrixSetupWizard";
import type { MatrixSetupViewModel } from "../view-models/MatrixSetupViewModel";
import { ShieldCheck } from "lucide-react";
import LiftLogo from "../../../../../assets/icon.png";

interface WorkspaceSetupScreenProps {
  readonly onCreate: (settings: {
    timezone: string;
    startOfDay: string;
  }) => Promise<void>;
  readonly matrixSetup?: MatrixSetupViewModel;
  readonly matrixProfiles?: readonly MatrixSetupProfileOption[];
  readonly allowOfflineCreation?: boolean;
}

export const WorkspaceSetupScreen: React.FC<WorkspaceSetupScreenProps> = ({
  onCreate,
  matrixSetup,
  matrixProfiles = [],
  allowOfflineCreation = false,
}) => {
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [startOfDay, setStartOfDay] = useState("06:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrixReady, setMatrixReady] = useState(
    matrixSetup?.snapshot().phase === "ready"
  );

  useEffect(() => {
    if (matrixSetup === undefined) {
      setMatrixReady(false);
      return;
    }
    return matrixSetup.subscribe(() => {
      setMatrixReady(matrixSetup.snapshot().phase === "ready");
    });
  }, [matrixSetup]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({ timezone, startOfDay });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      data-testid="matrix-setup-wizard"
      className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6"
    >
      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-lg space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-sm">
            <img src={LiftLogo} alt="" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Добро пожаловать в Lift
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Локальные задачи с защищённой синхронизацией через ваш
            Matrix-сервер.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Сквозное шифрование
          </div>
        </div>

        {matrixSetup !== undefined && matrixProfiles.length > 0 && (
          <MatrixSetupWizard
            viewModel={matrixSetup}
            profiles={matrixProfiles}
          />
        )}

        {(matrixReady || allowOfflineCreation) && (
          <>
            <label className="block text-sm">
              Часовой пояс
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2.5"
                required
              />
            </label>
            <label className="block text-sm">
              Начало дня
              <input
                type="time"
                value={startOfDay}
                onChange={(event) => setStartOfDay(event.target.value)}
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2.5"
                required
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? "Создаю…"
                : allowOfflineCreation
                  ? "Начать офлайн"
                  : "Создать защищённое пространство"}
            </button>
          </>
        )}
      </form>
    </main>
  );
};
