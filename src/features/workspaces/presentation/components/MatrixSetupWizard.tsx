import React, { useState, useSyncExternalStore } from "react";
import { KeyRound, LogIn, UserPlus } from "lucide-react";

import type { MatrixSetupViewModel } from "../view-models/MatrixSetupViewModel";

export interface MatrixSetupProfileOption {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
}

interface MatrixSetupWizardProps {
  readonly viewModel: MatrixSetupViewModel;
  readonly profiles: readonly MatrixSetupProfileOption[];
}

const errorLabel = (code: string | null): string | null => {
  switch (code) {
    case "RECOVERY_CONFIRMATION_MISMATCH":
      return "Проверочная группа не совпала. Ключ нужно сохранить полностью.";
    case "RECOVERY_KEY_INVALID":
      return "Ключ восстановления не подошёл. Данные на сервере не изменены.";
    case "MATRIX_ACCOUNT_RECOVERY_REQUIRED":
      return "Этот аккаунт уже защищён. Используйте «Восстановить», чтобы не заменить существующие ключи.";
    case "MATRIX_FINALIZE_FAILED":
      return "Не удалось завершить вход. Проверьте соединение и повторите попытку либо выйдите и войдите заново.";
    case "MATRIX_SETUP_FAILED":
      return "Не удалось безопасно подготовить Matrix-устройство.";
    case "MATRIX_LOGIN_FAILED":
      return "Не удалось войти. Проверьте Matrix ID, пароль и доступность сервера.";
    case "MATRIX_REGISTRATION_FAILED":
      return "Сервер отклонил регистрацию. Возможно, она отключена или требует дополнительной проверки.";
    default:
      return code === null ? null : "Ошибка безопасной настройки Matrix.";
  }
};

export const MatrixSetupWizard: React.FC<MatrixSetupWizardProps> = ({
  viewModel,
  profiles,
}) => {
  const snapshot = useSyncExternalStore(
    (listener) => viewModel.subscribe(listener),
    () => viewModel.snapshot(),
    () => viewModel.snapshot()
  );
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [username, setUsername] = useState("alice");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [recoveryInput, setRecoveryInput] = useState("");

  const start = async (mode: "first" | "recover" | "register") => {
    const secret = password;
    setPassword("");
    setPasswordConfirmation("");
    if (mode === "register") {
      await viewModel.registerFirstDevice(profileId, username, secret);
      return;
    }
    if (mode === "first") {
      await viewModel.beginFirstDevice(profileId, username, secret);
    } else {
      await viewModel.beginRecovery(profileId, username, secret);
    }
  };

  const error = errorLabel(snapshot.errorCode);

  if (snapshot.phase === "initializing-crypto") {
    return <p role="status">Инициализируем изолированное E2EE-устройство…</p>;
  }

  if (snapshot.phase === "recovery-confirmation") {
    return (
      <section
        className="space-y-3"
        aria-label="Подтверждение ключа восстановления"
      >
        <h2 className="font-semibold">Сохраните ключ восстановления</h2>
        <p className="text-sm text-muted-foreground">
          Сервер его не знает. Без этого ключа новое устройство не сможет
          восстановить историю.
        </p>
        <code className="block break-all rounded-lg border bg-muted p-3 text-sm">
          {snapshot.recoveryKeyForDisplay}
        </code>
        <label className="block text-sm">
          Группа № {snapshot.confirmationGroup}
          <input
            aria-label="Проверочная группа"
            value={recoveryInput}
            onChange={(event) => setRecoveryInput(event.target.value)}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          onClick={() => void viewModel.confirmRecoveryGroup(recoveryInput)}
        >
          Ключ сохранён
        </button>
        <button
          type="button"
          onClick={() => void viewModel.cancelSetup()}
          className="block text-sm text-muted-foreground"
        >
          Выйти и войти заново
        </button>
      </section>
    );
  }

  if (
    snapshot.phase === "recovery-key-required" ||
    snapshot.phase === "recovering-keys"
  ) {
    return (
      <section
        className="space-y-3"
        aria-label="Восстановление Matrix-устройства"
      >
        <h2 className="font-semibold">Ключ восстановления</h2>
        <textarea
          aria-label="Ключ восстановления"
          value={recoveryInput}
          onChange={(event) => setRecoveryInput(event.target.value)}
          disabled={snapshot.phase === "recovering-keys"}
          className="w-full rounded-lg border bg-background px-3 py-2"
        />
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          disabled={snapshot.phase === "recovering-keys"}
          onClick={() => void viewModel.recoverWithKey(recoveryInput)}
        >
          Восстановить ключи
        </button>
        <button
          type="button"
          disabled={snapshot.phase === "recovering-keys"}
          onClick={() => void viewModel.cancelSetup()}
          className="block text-sm text-muted-foreground"
        >
          Выйти и войти заново
        </button>
      </section>
    );
  }

  if (snapshot.phase === "ready") {
    return (
      <p role="status">
        Matrix E2EE-устройство готово и ключ восстановления подтверждён.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-label="Настройка Matrix">
      <div
        className="flex rounded-lg bg-muted p-1"
        role="tablist"
        aria-label="Matrix-аккаунт"
      >
        <button
          type="button"
          role="tab"
          aria-selected={authMode === "login"}
          onClick={() => setAuthMode("login")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${authMode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          Войти
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === "register"}
          onClick={() => setAuthMode("register")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${authMode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          Регистрация
        </button>
      </div>
      <label className="block text-sm">
        Сервер
        <select
          aria-label="Matrix-сервер"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} · {profile.baseUrl}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        {authMode === "register"
          ? "Имя нового пользователя"
          : "Matrix ID или имя пользователя"}
        <input
          aria-label="Matrix-пользователь"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5"
        />
      </label>
      <label className="block text-sm">
        Пароль
        <input
          aria-label="Matrix-пароль"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={
            authMode === "register" ? "new-password" : "current-password"
          }
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5"
        />
      </label>
      {authMode === "register" && (
        <label className="block text-sm">
          Повторите пароль
          <input
            aria-label="Повторите Matrix-пароль"
            type="password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2.5"
          />
        </label>
      )}
      {authMode === "register" &&
        passwordConfirmation !== "" &&
        password !== passwordConfirmation && (
          <p role="alert" className="text-sm text-destructive">
            Пароли не совпадают.
          </p>
        )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-error-code={snapshot.errorCode ?? undefined}
        >
          {error}
        </p>
      )}
      {authMode === "register" ? (
        <button
          type="button"
          disabled={
            !profileId ||
            !username.trim() ||
            !password ||
            password !== passwordConfirmation
          }
          onClick={() => void start("register")}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" /> Создать защищённый аккаунт
        </button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!profileId || !password}
            onClick={() => void start("first")}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" /> Первое устройство
          </button>
          <button
            type="button"
            disabled={!profileId || !password}
            onClick={() => void start("recover")}
            className="flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" /> Восстановить
          </button>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Пароль передаётся только выбранному homeserver. Содержимое задач
        шифруется на этом устройстве до отправки.
      </p>
    </section>
  );
};
