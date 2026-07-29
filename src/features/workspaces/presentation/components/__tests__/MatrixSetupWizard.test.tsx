import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import type {
  MatrixSession,
  MatrixSessionSnapshot,
} from "../../../application/ports/MatrixSession";
import { MatrixSetupViewModel } from "../../view-models/MatrixSetupViewModel";
import { MatrixSetupWizard } from "../MatrixSetupWizard";

describe("MatrixSetupWizard", () => {
  it("registers a new account only after matching password confirmation", async () => {
    const registerFirstDevice = vi.fn(async () => undefined);
    const viewModel = new MatrixSetupViewModel({
      snapshot: () => ({
        phase: "signed-out",
        profileId: null,
        userId: null,
        deviceId: null,
        errorCode: null,
        recoveryKeyForDisplay: null,
        confirmationGroup: null,
      }),
      subscribe: () => () => undefined,
      registerFirstDevice,
    } as unknown as MatrixSession);
    render(
      <MatrixSetupWizard
        viewModel={viewModel}
        profiles={[
          { id: "primary", name: "Primary", baseUrl: "http://127.0.0.1:8008" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Регистрация" }));
    fireEvent.change(screen.getByLabelText("Matrix-пользователь"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("Matrix-пароль"), {
      target: { value: "long-password" },
    });
    expect(
      screen.getByRole("button", { name: "Создать защищённый аккаунт" })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Повторите Matrix-пароль"), {
      target: { value: "long-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Создать защищённый аккаунт" })
    );

    await waitFor(() =>
      expect(registerFirstDevice).toHaveBeenCalledWith({
        profileId: "primary",
        username: "new-user",
        password: "long-password",
      })
    );
    expect(screen.getByLabelText("Matrix-пароль")).toHaveValue("");
    expect(screen.getByLabelText("Повторите Matrix-пароль")).toHaveValue("");
  });

  it("clears credentials and renders only sanitized setup errors", async () => {
    let snapshot: MatrixSessionSnapshot = {
      phase: "signed-out",
      profileId: null,
      userId: null,
      deviceId: null,
      errorCode: null,
      recoveryKeyForDisplay: null,
      confirmationGroup: null,
    };
    const listeners = new Set<(value: MatrixSessionSnapshot) => void>();
    const viewModel = new MatrixSetupViewModel({
      snapshot: () => snapshot,
      subscribe: (listener: (value: MatrixSessionSnapshot) => void) => {
        listeners.add(listener);
        listener(snapshot);
        return () => listeners.delete(listener);
      },
      verificationSnapshot: () => ({
        phase: "idle",
        otherUserId: null,
        otherDeviceId: null,
        initiatedByMe: false,
        emojis: [],
        decimals: [],
      }),
      subscribeVerification: () => () => undefined,
      beginFirstDevice: async () => {
        snapshot = {
          ...snapshot,
          phase: "error",
          errorCode: "MATRIX_SETUP_FAILED",
        };
        listeners.forEach((listener) => listener(snapshot));
      },
      registerFirstDevice: async () => undefined,
      beginRecovery: async () => undefined,
      confirmRecoveryGroup: async () => undefined,
      recoverWithKey: async () => undefined,
      requestDeviceVerification: async () => undefined,
      acceptDeviceVerification: async () => undefined,
      startSasVerification: async () => undefined,
      confirmDeviceVerification: async () => undefined,
      rejectDeviceVerification: async () => undefined,
      logout: async () => undefined,
      resume: async () => false,
      canCreateWorkspace: () => false,
      stop: async () => undefined,
    });
    render(
      <MatrixSetupWizard
        viewModel={viewModel}
        profiles={[
          { id: "primary", name: "Primary", baseUrl: "http://127.0.0.1:8008" },
        ]}
      />
    );
    fireEvent.change(screen.getByLabelText("Matrix-пароль"), {
      target: { value: "password-must-not-render" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Первое устройство" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByLabelText("Matrix-пароль")).toHaveValue("");
    expect(document.body.textContent).not.toMatch(
      /password-must-not-render|access-token/
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось безопасно подготовить Matrix-устройство."
    );
  });

  it("allows leaving an unfinished recovery confirmation to retry login", async () => {
    let snapshot: MatrixSessionSnapshot = {
      phase: "recovery-confirmation",
      profileId: "primary",
      userId: "@alice:primary.localhost",
      deviceId: "DEVICE_A",
      errorCode: "MATRIX_FINALIZE_FAILED",
      recoveryKeyForDisplay: "alpha beta gamma",
      confirmationGroup: 2,
    };
    const listeners = new Set<(value: MatrixSessionSnapshot) => void>();
    const logout = vi.fn(async () => {
      snapshot = {
        phase: "signed-out",
        profileId: null,
        userId: null,
        deviceId: null,
        errorCode: null,
        recoveryKeyForDisplay: null,
        confirmationGroup: null,
      };
      listeners.forEach((listener) => listener(snapshot));
    });
    const viewModel = new MatrixSetupViewModel({
      snapshot: () => snapshot,
      subscribe: (listener: (value: MatrixSessionSnapshot) => void) => {
        listeners.add(listener);
        listener(snapshot);
        return () => listeners.delete(listener);
      },
      logout,
    } as unknown as MatrixSession);

    render(
      <MatrixSetupWizard
        viewModel={viewModel}
        profiles={[
          { id: "primary", name: "Primary", baseUrl: "http://127.0.0.1:8008" },
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Выйти и войти заново" })
    );

    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Настройка Matrix")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Первое устройство" })
    ).toBeVisible();
  });

  it("reads the current session when the wizard mounts after logout", () => {
    let snapshot: MatrixSessionSnapshot = {
      phase: "ready",
      profileId: "primary",
      userId: "@alice:primary.localhost",
      deviceId: "DEVICE_A",
      errorCode: null,
      recoveryKeyForDisplay: null,
      confirmationGroup: null,
    };
    const session = {
      snapshot: () => snapshot,
      subscribe: () => () => undefined,
    } as unknown as MatrixSession;
    const viewModel = new MatrixSetupViewModel(session);
    snapshot = {
      phase: "signed-out",
      profileId: null,
      userId: null,
      deviceId: null,
      errorCode: null,
      recoveryKeyForDisplay: null,
      confirmationGroup: null,
    };

    render(
      <MatrixSetupWizard
        viewModel={viewModel}
        profiles={[
          { id: "primary", name: "Primary", baseUrl: "http://127.0.0.1:8008" },
        ]}
      />
    );

    expect(screen.getByLabelText("Настройка Matrix")).toBeVisible();
  });
});
