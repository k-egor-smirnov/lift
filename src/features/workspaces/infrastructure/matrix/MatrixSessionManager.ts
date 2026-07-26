import type {
  MatrixCredentials,
  MatrixSession,
  MatrixSessionSnapshot,
  MatrixVerificationSnapshot,
} from "../../application/ports/MatrixSession";
import type { ServerProfileRepository } from "../../application/ports/ServerProfileRepository";
import type { LocalKeyVault } from "../crypto/LocalKeyVault";
import type {
  BrowserMatrixClientLease,
  MatrixClientLease,
} from "./BrowserMatrixClientLease";
import type { MatrixSessionMetadataStore } from "./DexieMatrixSessionMetadataStore";
import type { MatrixEventStoreFactory } from "./MatrixEventStoreFactory";
import { matrixCryptoDatabasePrefix } from "./MatrixEventStoreFactory";
import type {
  MatrixAuthenticatedClient,
  MatrixLoginResult,
  MatrixSdkFacade,
  MatrixWorkspaceClient,
} from "./MatrixSdkFacade";
import type { SecretStorageKeyCache } from "./SecretStorageKeyCache";

const initialSnapshot = (): MatrixSessionSnapshot => ({
  phase: "signed-out",
  profileId: null,
  userId: null,
  deviceId: null,
  errorCode: null,
  recoveryKeyForDisplay: null,
  confirmationGroup: null,
});

const initialVerification = (): MatrixVerificationSnapshot => ({
  phase: "idle",
  otherUserId: null,
  otherDeviceId: null,
  initiatedByMe: false,
  emojis: [],
  decimals: [],
});

const recoveryGroups = (encoded: string): readonly string[] =>
  encoded.trim().split(/\s+/).filter(Boolean);

class MatrixSetupStageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MatrixSetupStageError";
  }
}

const stage = async <T>(
  code: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch {
    throw new MatrixSetupStageError(code);
  }
};

const safeFailureKind = (error: unknown): string => {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? (error as { readonly name?: unknown }).name
      : undefined;
  switch (name) {
    case "DataError":
    case "Error":
    case "InvalidAccessError":
    case "InvalidStateError":
    case "NotSupportedError":
    case "OperationError":
    case "QuotaExceededError":
    case "RuntimeError":
    case "SecurityError":
    case "TypeError":
    case "VersionError":
      return name.toUpperCase();
    default:
      return "UNKNOWN";
  }
};

const diagnosticStage = async <T>(
  code: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw new MatrixSetupStageError(`${code}_${safeFailureKind(error)}`);
  }
};

export class MatrixSessionManager implements MatrixSession {
  private value = initialSnapshot();
  private verification = initialVerification();
  private readonly listeners = new Set<
    (value: MatrixSessionSnapshot) => void
  >();
  private client: MatrixAuthenticatedClient | null = null;
  private readonly verificationListeners = new Set<
    (value: MatrixVerificationSnapshot) => void
  >();
  private stopVerificationSubscription: (() => void) | null = null;
  private lease: MatrixClientLease | null = null;
  private expectedRecoveryGroup: string | null = null;
  private pendingCredentials: MatrixCredentials | null = null;

  constructor(
    private readonly profiles: ServerProfileRepository,
    private readonly sdk: MatrixSdkFacade,
    private readonly leases: Pick<BrowserMatrixClientLease, "acquire">,
    private readonly vault: Pick<
      LocalKeyVault,
      | "getOrCreateCryptoStoreKey"
      | "storeSessionTokens"
      | "loadAccessToken"
      | "loadRefreshToken"
      | "clearSessionTokens"
    >,
    private readonly eventStores: MatrixEventStoreFactory,
    private readonly secretKeys: SecretStorageKeyCache,
    private readonly metadata: MatrixSessionMetadataStore,
    private readonly chooseGroup: (count: number) => number = (count) =>
      crypto.getRandomValues(new Uint32Array(1))[0] % count
  ) {}

  snapshot(): MatrixSessionSnapshot {
    return { ...this.value };
  }

  subscribe(listener: (snapshot: MatrixSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  verificationSnapshot(): MatrixVerificationSnapshot {
    return this.verification;
  }

  subscribeVerification(
    listener: (snapshot: MatrixVerificationSnapshot) => void
  ): () => void {
    this.verificationListeners.add(listener);
    listener(this.verificationSnapshot());
    return () => this.verificationListeners.delete(listener);
  }

  async requestDeviceVerification(): Promise<void> {
    if (this.client?.requestDeviceVerification === undefined)
      throw new Error("Matrix device verification is unavailable");
    await this.client.requestDeviceVerification();
  }

  async acceptDeviceVerification(): Promise<void> {
    if (this.client?.acceptDeviceVerification === undefined)
      throw new Error("Matrix device verification is unavailable");
    await this.client.acceptDeviceVerification();
  }

  async startSasVerification(): Promise<void> {
    if (this.client?.startSasVerification === undefined)
      throw new Error("Matrix SAS verification is unavailable");
    await this.client.startSasVerification();
  }

  async confirmDeviceVerification(): Promise<void> {
    if (this.client?.confirmDeviceVerification === undefined)
      throw new Error("Matrix SAS verification is unavailable");
    await this.client.confirmDeviceVerification();
  }

  async rejectDeviceVerification(): Promise<void> {
    if (this.client?.rejectDeviceVerification === undefined)
      throw new Error("Matrix device verification is unavailable");
    await this.client.rejectDeviceVerification();
  }

  async logout(): Promise<void> {
    const { profileId, userId, deviceId } = this.value;
    if (profileId === null || userId === null || deviceId === null) {
      await this.stop();
      return;
    }
    let remoteFailure: unknown;
    try {
      await this.client?.logout?.();
    } catch (error) {
      remoteFailure = error;
    }
    let localFailure: unknown;
    try {
      await this.vault.clearSessionTokens(profileId, userId, deviceId);
      await this.metadata.clear(profileId);
    } catch (error) {
      localFailure = error;
    } finally {
      await this.stop();
    }
    if (localFailure !== undefined) {
      throw new Error("Не удалось полностью удалить локальную Matrix-сессию");
    }
    if (remoteFailure !== undefined) {
      throw new Error(
        "Локальная сессия удалена, но сервер был недоступен и мог сохранить токен до истечения срока"
      );
    }
  }

  async beginFirstDevice(credentials: MatrixCredentials): Promise<void> {
    await this.prepareFirstDevice(credentials, false);
  }

  async registerFirstDevice(credentials: MatrixCredentials): Promise<void> {
    await this.prepareFirstDevice(credentials, true);
  }

  private async prepareFirstDevice(
    credentials: MatrixCredentials,
    register: boolean
  ): Promise<void> {
    try {
      const { client, session } = await this.initialize(credentials, register);
      await client.bootstrapCrossSigning(
        credentials.username,
        credentials.password
      );
      const recovery = await client.createRecoveryKey();
      await client.bootstrapSecretStorage(recovery.generated);
      const groups = recoveryGroups(recovery.encodedPrivateKey);
      if (groups.length === 0) throw new Error("Matrix recovery key is empty");
      const groupIndex = this.chooseGroup(groups.length);
      if (
        !Number.isInteger(groupIndex) ||
        groupIndex < 0 ||
        groupIndex >= groups.length
      ) {
        throw new Error("Invalid recovery challenge index");
      }
      this.expectedRecoveryGroup = groups[groupIndex];
      this.set({
        phase: "recovery-confirmation",
        profileId: credentials.profileId,
        userId: session.userId,
        deviceId: session.deviceId,
        errorCode: null,
        recoveryKeyForDisplay: recovery.encodedPrivateKey,
        confirmationGroup: groupIndex + 1,
      });
    } catch (error) {
      await this.fail(
        error instanceof MatrixSetupStageError
          ? error.code
          : "MATRIX_SETUP_FAILED"
      );
    }
  }

  async beginRecovery(credentials: MatrixCredentials): Promise<void> {
    try {
      const { session } = await this.initialize(credentials);
      this.pendingCredentials = { ...credentials };
      this.set({
        phase: "recovery-key-required",
        profileId: credentials.profileId,
        userId: session.userId,
        deviceId: session.deviceId,
        errorCode: null,
        recoveryKeyForDisplay: null,
        confirmationGroup: null,
      });
    } catch (error) {
      await this.fail(
        error instanceof MatrixSetupStageError
          ? error.code
          : "MATRIX_SETUP_FAILED"
      );
    }
  }

  async confirmRecoveryGroup(value: string): Promise<void> {
    if (
      this.value.phase !== "recovery-confirmation" ||
      this.expectedRecoveryGroup === null ||
      value.trim() !== this.expectedRecoveryGroup
    ) {
      this.set({ ...this.value, errorCode: "RECOVERY_CONFIRMATION_MISMATCH" });
      return;
    }
    await this.client?.recoveryConfirmed();
    await this.client?.joinInvitedWorkspaceRooms?.();
    this.expectedRecoveryGroup = null;
    this.set({
      ...this.value,
      phase: "ready",
      errorCode: null,
      recoveryKeyForDisplay: null,
      confirmationGroup: null,
    });
  }

  async recoverWithKey(recoveryKey: string): Promise<void> {
    if (
      this.value.phase !== "recovery-key-required" ||
      this.pendingCredentials === null ||
      this.client === null
    ) {
      throw new Error("Matrix recovery is not awaiting a key");
    }
    const credentials = this.pendingCredentials;
    this.set({ ...this.value, phase: "recovering-keys", errorCode: null });
    try {
      await this.client.recoverKeys(
        recoveryKey,
        credentials.username,
        credentials.password
      );
      await this.client.joinInvitedWorkspaceRooms?.();
      this.pendingCredentials = null;
      this.set({ ...this.value, phase: "ready", errorCode: null });
    } catch {
      this.secretKeys.clear();
      this.set({
        ...this.value,
        phase: "recovery-key-required",
        errorCode: "RECOVERY_KEY_INVALID",
      });
    }
  }

  async resume(): Promise<boolean> {
    const stored = await this.metadata.latest();
    if (stored === null) return false;
    const profile = await this.profiles.get(stored.profileId);
    if (profile === undefined) return false;
    const accessToken = await this.vault.loadAccessToken(
      stored.profileId,
      stored.userId,
      stored.deviceId
    );
    if (accessToken === undefined) return false;
    const refreshToken = await this.vault.loadRefreshToken(
      stored.profileId,
      stored.userId,
      stored.deviceId
    );
    try {
      this.set({
        ...initialSnapshot(),
        phase: "initializing-crypto",
        profileId: stored.profileId,
      });
      await this.startAuthenticated(profile, {
        accessToken,
        refreshToken,
        userId: stored.userId,
        deviceId: stored.deviceId,
      });
      await this.client?.joinInvitedWorkspaceRooms?.();
      this.set({
        phase: "ready",
        profileId: stored.profileId,
        userId: stored.userId,
        deviceId: stored.deviceId,
        errorCode: null,
        recoveryKeyForDisplay: null,
        confirmationGroup: null,
      });
      return true;
    } catch {
      await this.fail("MATRIX_RESUME_FAILED");
      return false;
    }
  }

  canCreateWorkspace(): boolean {
    return this.value.phase === "ready";
  }

  requireAuthenticatedClient(): MatrixWorkspaceClient {
    if (
      this.value.phase !== "ready" ||
      this.client?.workspaceRooms === undefined
    ) {
      throw new Error("Matrix session is not ready");
    }
    return this.client.workspaceRooms;
  }

  async stop(): Promise<void> {
    this.pendingCredentials = null;
    this.expectedRecoveryGroup = null;
    this.secretKeys.clear();
    this.stopVerificationSubscription?.();
    this.stopVerificationSubscription = null;
    this.setVerification(initialVerification());
    await this.client?.stop();
    this.client = null;
    this.lease?.release();
    this.lease = null;
    this.set(initialSnapshot());
  }

  private async initialize(
    credentials: MatrixCredentials,
    register = false
  ): Promise<{
    client: MatrixAuthenticatedClient;
    session: MatrixLoginResult;
  }> {
    if (this.client !== null || this.lease !== null) {
      await this.stop();
    }
    this.set({
      ...initialSnapshot(),
      phase: "initializing-crypto",
      profileId: credentials.profileId,
    });
    const profile = await this.profiles.get(credentials.profileId);
    if (profile === undefined) throw new Error("Matrix profile not found");
    const session = await stage(
      register ? "MATRIX_REGISTRATION_FAILED" : "MATRIX_LOGIN_FAILED",
      () =>
        register
          ? this.sdk.register(
              profile,
              credentials.username,
              credentials.password
            )
          : this.sdk.login(profile, credentials.username, credentials.password)
    );
    await this.vault.storeSessionTokens(
      profile.id,
      session.userId,
      session.deviceId,
      session
    );
    await this.metadata.persist(profile.id, session.userId, session.deviceId);

    return this.startAuthenticated(profile, session);
  }

  private async startAuthenticated(
    profile: Awaited<ReturnType<ServerProfileRepository["get"]>> & object,
    session: MatrixLoginResult
  ): Promise<{
    client: MatrixAuthenticatedClient;
    session: MatrixLoginResult;
  }> {
    const cryptoPrefix = matrixCryptoDatabasePrefix(
      profile.id,
      session.userId,
      session.deviceId
    );
    this.lease = await stage("MATRIX_LEASE_FAILED", () =>
      this.leases.acquire(cryptoPrefix)
    );
    if (this.lease === null)
      throw new Error("Matrix crypto store is already open");
    const eventStore = await stage("MATRIX_EVENT_STORE_FAILED", () =>
      this.eventStores.create(profile.id, session.userId, session.deviceId)
    );
    const onRefresh = async (refreshToken: string) => {
      const refreshed = await this.sdk.refresh(profile, refreshToken);
      await this.vault.storeSessionTokens(
        profile.id,
        session.userId,
        session.deviceId,
        refreshed
      );
      return refreshed;
    };
    const client = await stage("MATRIX_CLIENT_FAILED", () =>
      this.sdk.createAuthenticated({
        profile,
        session,
        eventStore,
        secretStorageCallbacks: this.secretKeys.callbacks,
        onRefresh,
      })
    );
    this.client = client;
    this.stopVerificationSubscription?.();
    this.stopVerificationSubscription =
      client.subscribeVerification?.((snapshot) =>
        this.setVerification(snapshot)
      ) ?? null;
    await stage("MATRIX_EVENT_STORE_FAILED", () => client.eventStoreStartup());
    await diagnosticStage("MATRIX_RUST_CRYPTO_FAILED", async () =>
      client.initRustCrypto(
        cryptoPrefix,
        await this.vault.getOrCreateCryptoStoreKey(
          profile.id,
          session.userId,
          session.deviceId
        )
      )
    );
    await stage("MATRIX_ISOLATION_FAILED", () =>
      client.setSignedDeviceIsolation()
    );
    await stage("MATRIX_PREPARED_FAILED", () => client.startAndWaitPrepared());
    return { client, session };
  }

  private async fail(errorCode: string): Promise<void> {
    this.pendingCredentials = null;
    this.expectedRecoveryGroup = null;
    await this.client?.stop().catch(() => undefined);
    this.client = null;
    this.lease?.release();
    this.lease = null;
    this.secretKeys.clear();
    this.stopVerificationSubscription?.();
    this.stopVerificationSubscription = null;
    this.setVerification(initialVerification());
    this.set({ ...this.value, phase: "error", errorCode });
  }

  private set(next: MatrixSessionSnapshot): void {
    this.value = { ...next };
    for (const listener of this.listeners) listener(this.snapshot());
  }

  private setVerification(next: MatrixVerificationSnapshot): void {
    this.verification = {
      ...next,
      emojis: [...next.emojis],
      decimals: [...next.decimals],
    };
    for (const listener of this.verificationListeners)
      listener(this.verificationSnapshot());
  }
}
