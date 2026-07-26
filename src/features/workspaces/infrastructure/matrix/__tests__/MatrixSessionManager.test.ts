import { ServerProfile } from "../../../domain/ServerProfile";
import { MatrixEventStoreFactory } from "../MatrixEventStoreFactory";
import { MatrixSessionManager } from "../MatrixSessionManager";
import type {
  MatrixAuthenticatedClient,
  MatrixSdkFacade,
} from "../MatrixSdkFacade";
import { SecretStorageKeyCache } from "../SecretStorageKeyCache";

describe("MatrixSessionManager", () => {
  it("orders secure bootstrap and gates workspace creation on recovery acknowledgement", async () => {
    const calls: string[] = [];
    const client: MatrixAuthenticatedClient = {
      eventStoreStartup: async () => void calls.push("event-store-startup"),
      initRustCrypto: async () => void calls.push("rust-crypto"),
      setSignedDeviceIsolation: async () =>
        void calls.push("signed-device-isolation"),
      startAndWaitPrepared: async () => {
        calls.push("start-client");
        calls.push("prepared");
      },
      bootstrapCrossSigning: async () => void calls.push("cross-signing"),
      createRecoveryKey: async () => ({
        encodedPrivateKey: "alpha beta gamma",
        generated: { privateKey: new Uint8Array(32) },
      }),
      bootstrapSecretStorage: async () =>
        void calls.push("secret-storage-and-backup"),
      recoverKeys: async () => undefined,
      recoveryConfirmed: async () => void calls.push("recovery-confirmed"),
      logout: async () => void calls.push("logout"),
      stop: async () => undefined,
    };
    const sdk: MatrixSdkFacade = {
      register: async () => {
        calls.push("register");
        return {
          accessToken: "access-token-must-not-leak",
          refreshToken: "refresh-token-must-not-leak",
          userId: "@alice:primary.localhost",
          deviceId: "DEVICE_A",
        };
      },
      login: async () => {
        throw new Error("not used");
      },
      refresh: async () => {
        throw new Error("not used");
      },
      createAuthenticated: async () => client,
    };
    const secretKeys = new SecretStorageKeyCache();
    const session = new MatrixSessionManager(
      {
        get: async () =>
          ServerProfile.create({
            id: "primary",
            name: "Primary",
            baseUrl: "http://127.0.0.1:8008",
          }),
      } as never,
      sdk,
      {
        acquire: async (name) => {
          calls.push("lease");
          return { name, release: () => undefined };
        },
      },
      {
        storeSessionTokens: async () => undefined,
        getOrCreateCryptoStoreKey: async () => new Uint8Array(32),
        loadAccessToken: async () => undefined,
        loadRefreshToken: async () => undefined,
        clearSessionTokens: async () => void calls.push("clear-session-tokens"),
      },
      new MatrixEventStoreFactory(
        indexedDB,
        undefined,
        async () => class FakeStore {} as never
      ),
      secretKeys,
      {
        persist: async () => undefined,
        latest: async () => null,
        clear: async () => void calls.push("clear-session-metadata"),
      },
      () => 1
    );

    await session.registerFirstDevice({
      profileId: "primary",
      username: "alice",
      password: "password-must-not-leak",
    });

    expect(session.canCreateWorkspace()).toBe(false);
    expect(session.snapshot()).toMatchObject({
      phase: "recovery-confirmation",
      recoveryKeyForDisplay: "alpha beta gamma",
      confirmationGroup: 2,
    });
    expect(JSON.stringify(session.snapshot())).not.toContain("access-token");
    expect(JSON.stringify(session.snapshot())).not.toContain(
      "password-must-not-leak"
    );

    await session.confirmRecoveryGroup("beta");

    expect(calls).toEqual([
      "register",
      "lease",
      "event-store-startup",
      "rust-crypto",
      "signed-device-isolation",
      "start-client",
      "prepared",
      "cross-signing",
      "secret-storage-and-backup",
      "recovery-confirmed",
    ]);
    expect(session.canCreateWorkspace()).toBe(true);
    expect(session.snapshot().recoveryKeyForDisplay).toBeNull();

    await session.logout();
    expect(session.snapshot().phase).toBe("signed-out");
    expect(calls.slice(-3)).toEqual([
      "logout",
      "clear-session-tokens",
      "clear-session-metadata",
    ]);
  });

  it("keeps a wrong recovery key retryable and sanitized", async () => {
    const secretKeys = new SecretStorageKeyCache();
    const session = new MatrixSessionManager(
      {
        get: async () =>
          ServerProfile.create({
            id: "primary",
            name: "Primary",
            baseUrl: "http://127.0.0.1:8008",
          }),
      } as never,
      {
        register: async () => {
          throw new Error("not used");
        },
        login: async () => ({
          accessToken: "secret-access",
          userId: "@alice:primary.localhost",
          deviceId: "DEVICE_B",
        }),
        refresh: async () => {
          throw new Error("not used");
        },
        createAuthenticated: async () => ({
          eventStoreStartup: async () => undefined,
          initRustCrypto: async () => undefined,
          setSignedDeviceIsolation: async () => undefined,
          startAndWaitPrepared: async () => undefined,
          bootstrapCrossSigning: async () => undefined,
          createRecoveryKey: async () => {
            throw new Error("not used");
          },
          bootstrapSecretStorage: async () => undefined,
          recoverKeys: async () => {
            throw new Error("secret-access wrong-key");
          },
          recoveryConfirmed: async () => undefined,
          stop: async () => undefined,
        }),
      },
      { acquire: async (name) => ({ name, release: () => undefined }) },
      {
        storeSessionTokens: async () => undefined,
        getOrCreateCryptoStoreKey: async () => new Uint8Array(32),
        loadAccessToken: async () => undefined,
        loadRefreshToken: async () => undefined,
        clearSessionTokens: async () => undefined,
      },
      new MatrixEventStoreFactory(
        indexedDB,
        undefined,
        async () => class FakeStore {} as never
      ),
      secretKeys,
      {
        persist: async () => undefined,
        latest: async () => null,
        clear: async () => undefined,
      }
    );
    await session.beginRecovery({
      profileId: "primary",
      username: "alice",
      password: "private-password",
    });
    await session.recoverWithKey("wrong-secret-key");
    expect(session.snapshot()).toMatchObject({
      phase: "recovery-key-required",
      errorCode: "RECOVERY_KEY_INVALID",
    });
    expect(JSON.stringify(session.snapshot())).not.toMatch(
      /secret-access|wrong-secret-key|private-password/
    );
    expect(session.canCreateWorkspace()).toBe(false);
  });
});
