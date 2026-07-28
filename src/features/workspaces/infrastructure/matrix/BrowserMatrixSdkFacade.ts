import type { MatrixClient } from "matrix-js-sdk/lib/client.js";
import {
  EventStatus,
  type MatrixEvent,
} from "matrix-js-sdk/lib/models/event.js";
import { RoomEvent, type Room } from "matrix-js-sdk/lib/models/room.js";
import type { IndexedDBStore } from "matrix-js-sdk/lib/store/indexeddb.js";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification.js";

import type { ServerProfile } from "../../domain/ServerProfile";
import type { MatrixVerificationSnapshot } from "../../application/ports/MatrixSession";
import type { SecretStorageKeyCache } from "./SecretStorageKeyCache";
import {
  stripMatrixSignatures,
  verifyMatrixDeviceSignature,
} from "../crypto/MatrixSigningJson";
import type {
  MatrixAuthenticatedClient,
  MatrixLoginResult,
  MatrixRefreshResult,
  MatrixSdkFacade,
  MatrixWorkspaceClient,
  MatrixWorkspaceMembershipEvent,
  MatrixWorkspaceWireEvent,
  DecryptedMatrixWorkspaceEvent,
} from "./MatrixSdkFacade";
import { MatrixInviteAutoJoiner } from "./MatrixInviteAutoJoiner";
import { isDeviceSignedByOwner } from "./MatrixDeviceTrust";
import { readRemoteWorkspaceEvent } from "./MatrixRemoteReadback";

type BrowserSdk = typeof import("matrix-js-sdk/lib/browser-index.js");

const browserSdk = (): Promise<BrowserSdk> =>
  import("matrix-js-sdk/lib/browser-index.js");

const safeUia =
  (
    username: string,
    password: string
  ): ((
    request: (auth: Record<string, unknown> | null) => Promise<void>
  ) => Promise<void>) =>
  async (request) => {
    try {
      await request(null);
    } catch (error) {
      const session = (error as { data?: { session?: unknown } }).data?.session;
      if (typeof session !== "string") throw error;
      await request({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: username },
        password,
        session,
      });
    }
  };

class BrowserAuthenticatedClient
  implements MatrixAuthenticatedClient, MatrixWorkspaceClient
{
  readonly workspaceRooms: MatrixWorkspaceClient = this;
  private verification: MatrixVerificationSnapshot = {
    phase: "idle",
    otherUserId: null,
    otherDeviceId: null,
    initiatedByMe: false,
    emojis: [],
    decimals: [],
  };
  private readonly verificationListeners = new Set<
    (snapshot: MatrixVerificationSnapshot) => void
  >();
  private verificationRequest: VerificationRequest | null = null;
  private sasCallbacks: ShowSasCallbacks | null = null;
  private readonly activeVerifiers = new WeakSet<object>();
  private readonly inviteAutoJoiner: MatrixInviteAutoJoiner;
  private onlineRetryTimer: number | null = null;
  private readonly retrySyncOnline = () => {
    this.clearOnlineRetry();
    let attempts = 0;
    const retry = () => {
      this.client.retryImmediately();
      attempts += 1;
      if (attempts >= 45) this.clearOnlineRetry();
    };
    retry();
    this.onlineRetryTimer = window.setInterval(retry, 1_000);
  };
  private readonly syncRecovered = (state: string) => {
    if (state === "PREPARED" || state === "SYNCING") this.clearOnlineRetry();
  };

  private async ensureWorkspaceRoomEncryption(roomId: string): Promise<void> {
    const matrixCrypto = this.requireCrypto();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const room = this.client.getRoom(roomId);
      const encryptionEvent = room?.currentState.getStateEvents(
        "m.room.encryption",
        ""
      );
      if (
        room !== null &&
        room !== undefined &&
        encryptionEvent !== null &&
        encryptionEvent !== undefined &&
        encryptionEvent.getContent().algorithm === "m.megolm.v1.aes-sha2"
      ) {
        if (!(await matrixCrypto.isEncryptionEnabledInRoom(roomId))) {
          const cryptoEventConsumer = matrixCrypto as unknown as {
            onCryptoEvent(room: Room, event: MatrixEvent): Promise<void>;
          };
          await cryptoEventConsumer.onCryptoEvent(room, encryptionEvent);
        }
        if (
          room.hasEncryptionStateEvent() &&
          (await matrixCrypto.isEncryptionEnabledInRoom(roomId))
        ) {
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error(
      "Matrix workspace encryption state is not ready; refusing plaintext send"
    );
  }

  private async confirmEncryptedDelivery(
    roomId: string,
    eventId: string
  ): Promise<string> {
    const remote = await this.client.fetchRoomEvent(roomId, eventId);
    if (remote.event_id !== eventId || remote.type !== "m.room.encrypted") {
      throw new Error(
        "Matrix homeserver did not confirm an encrypted workspace event"
      );
    }
    return eventId;
  }

  constructor(
    private readonly client: MatrixClient,
    private readonly eventStore: IndexedDBStore,
    private readonly secretKeys: SecretStorageKeyCache
  ) {
    window.addEventListener("online", this.retrySyncOnline);
    const syncEmitter = this.client as unknown as {
      on(event: "sync", listener: (state: string) => void): void;
      off(event: "sync", listener: (state: string) => void): void;
    };
    syncEmitter.on("sync", this.syncRecovered);
    this.inviteAutoJoiner = new MatrixInviteAutoJoiner(syncEmitter, () =>
      this.joinInvitedWorkspaceRooms()
    );
    this.inviteAutoJoiner.start();
  }

  async eventStoreStartup(): Promise<void> {
    await this.eventStore.startup();
  }

  syncState(): string {
    return String(this.client.getSyncState() ?? "STOPPED");
  }

  workspaceIdentity(): { readonly userId: string; readonly deviceId: string } {
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    if (userId === null || deviceId === null)
      throw new Error("Matrix workspace identity is unavailable");
    return { userId, deviceId };
  }

  async initRustCrypto(
    cryptoDatabasePrefix: string,
    storageKey: Uint8Array
  ): Promise<void> {
    await this.client.initRustCrypto({
      useIndexedDB: true,
      cryptoDatabasePrefix,
      storageKey,
    });
    this.client.on(
      CryptoEvent.VerificationRequestReceived,
      this.onVerificationRequest
    );
  }

  verificationSnapshot(): MatrixVerificationSnapshot {
    return {
      ...this.verification,
      emojis: [...this.verification.emojis],
      decimals: [...this.verification.decimals],
    };
  }

  subscribeVerification(
    listener: (snapshot: MatrixVerificationSnapshot) => void
  ): () => void {
    this.verificationListeners.add(listener);
    listener(this.verificationSnapshot());
    return () => this.verificationListeners.delete(listener);
  }

  async requestDeviceVerification(): Promise<void> {
    this.attachVerificationRequest(
      await this.requireCrypto().requestOwnUserVerification()
    );
  }

  async acceptDeviceVerification(): Promise<void> {
    if (this.verificationRequest === null)
      throw new Error("No Matrix verification request");
    await this.verificationRequest.accept();
    this.syncVerificationRequest();
  }

  async startSasVerification(): Promise<void> {
    if (this.verificationRequest === null)
      throw new Error("No Matrix verification request");
    this.bindVerifier(
      await this.verificationRequest.startVerification("m.sas.v1")
    );
  }

  async confirmDeviceVerification(): Promise<void> {
    if (this.sasCallbacks === null) throw new Error("SAS is not ready");
    await this.sasCallbacks.confirm();
    this.sasCallbacks = null;
  }

  async rejectDeviceVerification(): Promise<void> {
    if (this.sasCallbacks !== null) this.sasCallbacks.mismatch();
    else await this.verificationRequest?.cancel();
    this.sasCallbacks = null;
  }

  async logout(): Promise<void> {
    await this.client.logout(false);
  }

  private readonly onVerificationRequest = (request: VerificationRequest) => {
    if (!request.isSelfVerification || !request.pending) return;
    this.attachVerificationRequest(request);
  };

  private attachVerificationRequest(request: VerificationRequest): void {
    if (this.verificationRequest !== null) {
      this.verificationRequest.off(
        VerificationRequestEvent.Change,
        this.syncVerificationRequest
      );
    }
    this.verificationRequest = request;
    request.on(VerificationRequestEvent.Change, this.syncVerificationRequest);
    this.syncVerificationRequest();
  }

  private readonly syncVerificationRequest = () => {
    const request = this.verificationRequest;
    if (request === null) return;
    const phase =
      request.phase === VerificationPhase.Requested
        ? "requested"
        : request.phase === VerificationPhase.Ready
          ? "ready"
          : request.phase === VerificationPhase.Started
            ? "verifying"
            : request.phase === VerificationPhase.Done
              ? "done"
              : request.phase === VerificationPhase.Cancelled
                ? "cancelled"
                : "requested";
    this.setVerification({
      phase,
      otherUserId: request.otherUserId,
      otherDeviceId: request.otherDeviceId ?? null,
      initiatedByMe: request.initiatedByMe,
      emojis: [],
      decimals: [],
    });
    if (request.verifier !== undefined) this.bindVerifier(request.verifier);
  };

  private bindVerifier(verifier: Verifier): void {
    if (this.activeVerifiers.has(verifier)) return;
    this.activeVerifiers.add(verifier);
    const showSas = (sas: ShowSasCallbacks) => {
      this.sasCallbacks = sas;
      this.setVerification({
        ...this.verification,
        phase: "sas",
        emojis: (sas.sas.emoji ?? []).map(([symbol, label]) => ({
          symbol,
          label,
        })),
        decimals: [...(sas.sas.decimal ?? [])],
      });
    };
    verifier.on(VerifierEvent.ShowSas, showSas);
    const existing = verifier.getShowSasCallbacks();
    if (existing !== null) showSas(existing);
    void verifier.verify().catch(() => {
      if (this.verification.phase !== "cancelled")
        this.setVerification({ ...this.verification, phase: "error" });
    });
  }

  private setVerification(snapshot: MatrixVerificationSnapshot): void {
    this.verification = snapshot;
    for (const listener of this.verificationListeners)
      listener(this.verificationSnapshot());
  }

  async setSignedDeviceIsolation(): Promise<void> {
    const { OnlySignedDevicesIsolationMode } =
      await import("matrix-js-sdk/lib/crypto-api/index.js");
    const matrixCrypto = this.requireCrypto();
    matrixCrypto.setDeviceIsolationMode(new OnlySignedDevicesIsolationMode());
    matrixCrypto.globalBlacklistUnverifiedDevices = true;
  }

  async startAndWaitPrepared(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const syncEvents = this.client as unknown as {
        on(event: "sync", listener: (state: string) => void): void;
        off(event: "sync", listener: (state: string) => void): void;
      };
      const timeout = window.setTimeout(() => {
        syncEvents.off("sync", onSync);
        reject(new Error("Matrix initial sync timeout"));
      }, 30_000);
      const onSync = (state: string) => {
        if (state !== "PREPARED") return;
        window.clearTimeout(timeout);
        syncEvents.off("sync", onSync);
        resolve();
      };
      syncEvents.on("sync", onSync);
      void this.client.startClient({ initialSyncLimit: 20 }).catch((error) => {
        window.clearTimeout(timeout);
        syncEvents.off("sync", onSync);
        reject(error);
      });
    });
  }

  async hasExistingSecureSetup(): Promise<boolean> {
    const [crossSigning, secretStorageKey] = await Promise.all([
      this.requireCrypto().getCrossSigningStatus(),
      this.client.secretStorage.getKey(),
    ]);
    return crossSigning.publicKeysOnDevice || secretStorageKey !== null;
  }

  async joinInvitedWorkspaceRooms(): Promise<void> {
    for (const room of this.client.getRooms()) {
      if (room.getMyMembership() === "invite") {
        await this.client.joinRoom(room.roomId);
      }
    }
  }

  async bootstrapCrossSigning(
    username: string,
    password: string
  ): Promise<void> {
    await this.requireCrypto().bootstrapCrossSigning({
      authUploadDeviceSigningKeys: safeUia(username, password),
    });
  }

  async createRecoveryKey(): Promise<{
    encodedPrivateKey: string;
    generated: unknown;
  }> {
    const generated =
      await this.requireCrypto().createRecoveryKeyFromPassphrase();
    if (generated.encodedPrivateKey === undefined) {
      throw new Error("Matrix did not encode the recovery key");
    }
    return { encodedPrivateKey: generated.encodedPrivateKey, generated };
  }

  async bootstrapSecretStorage(generated: unknown): Promise<void> {
    await this.requireCrypto().bootstrapSecretStorage({
      setupNewSecretStorage: true,
      setupNewKeyBackup: true,
      createSecretStorageKey: async () => generated as never,
    });
  }

  async recoverKeys(
    recoveryKey: string,
    username: string,
    password: string
  ): Promise<void> {
    const { decodeRecoveryKey } =
      await import("matrix-js-sdk/lib/crypto-api/recovery-key.js");
    const decoded = decodeRecoveryKey(recoveryKey);
    const storedKey = await this.client.secretStorage.getKey();
    if (storedKey === null)
      throw new Error("Matrix secret storage is not configured");
    const [keyId, keyInfo] = storedKey;
    if (
      !(await this.client.secretStorage.checkKey(decoded, keyInfo as never))
    ) {
      throw new Error("Recovery key does not match secret storage");
    }
    this.secretKeys.set(keyId, decoded);
    try {
      const cryptoApi = this.requireCrypto();
      await cryptoApi.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: safeUia(username, password),
      });
      await cryptoApi.loadSessionBackupPrivateKeyFromSecretStorage();
      await cryptoApi.checkKeyBackupAndEnable();
      await cryptoApi.restoreKeyBackup();
    } catch (error) {
      this.secretKeys.clear();
      throw error;
    }
  }

  async recoveryConfirmed(): Promise<void> {}

  async createEncryptedWorkspaceRoom(ownerUserId: string): Promise<string> {
    if (this.client.getUserId() !== ownerUserId) {
      throw new Error("Matrix room owner does not match the active session");
    }
    const { room_id: roomId } = await this.client.createRoom({
      visibility: "private" as never,
      preset: "private_chat" as never,
      // Room v12 gives the creator immutable, implicit infinite power. That
      // makes a real Lift ownership transfer impossible, because the former
      // Owner could never be demoted at the Matrix enforcement layer. Room
      // v11 keeps the explicit Owner=100 mapping transferable.
      room_version: "11",
      name: crypto.randomUUID(),
      power_level_content_override: {
        users: { [ownerUserId]: 100 },
        users_default: 0,
        events_default: 50,
        state_default: 75,
        invite: 75,
        kick: 75,
        ban: 75,
        redact: 75,
        events: { "m.room.power_levels": 75, "m.room.encryption": 100 },
      },
      initial_state: [
        {
          type: "m.room.encryption",
          state_key: "",
          content: {
            algorithm: "m.megolm.v1.aes-sha2",
            rotation_period_ms: 86_400_000,
            rotation_period_msgs: 100,
          },
        },
      ],
    });
    // A newly-created room can arrive in the same /sync response that raced
    // with createRoom(). The same fail-closed gate is also used after reloads.
    await this.ensureWorkspaceRoomEncryption(roomId);
    return roomId;
  }

  async ownDeviceKeys(): Promise<{
    readonly ed25519: string;
    readonly curve25519: string;
  }> {
    return this.requireCrypto().getOwnDeviceKeys();
  }

  async sendEncryptedWorkspaceEvent(
    roomId: string,
    eventType: string,
    content: Readonly<Record<string, unknown>>,
    transactionId: string
  ): Promise<string> {
    await this.ensureWorkspaceRoomEncryption(roomId);
    const room = this.client.getRoom(roomId);
    const existing =
      room?.findEventById(`~${roomId}:${transactionId}`) ??
      room
        ?.getLiveTimeline()
        .getEvents()
        .find((event) => event.getTxnId() === transactionId);
    if (existing !== undefined) {
      if (room === null)
        throw new Error("Matrix pending event room is missing");
      const eventId = existing.getId();
      if (
        (existing.status === null || existing.status === undefined) &&
        eventId?.startsWith("$")
      ) {
        // IndexedDB can restore a detached local echo with an event-shaped ID
        // after a crash/offline reload. A local timeline entry alone is not a
        // delivery acknowledgement: verify that the homeserver can return the
        // exact event before allowing the durable outbox row to become acked.
        try {
          return await this.confirmEncryptedDelivery(roomId, eventId);
        } catch {
          // A missing or currently unreachable remote echo is not an ack. The
          // same Matrix transaction ID makes this retry server-idempotent.
        }
        const retried = await this.client.sendEvent(
          roomId,
          eventType as never,
          content as never,
          transactionId
        );
        return this.confirmEncryptedDelivery(roomId, retried.event_id);
      }
      if (existing.status !== EventStatus.NOT_SENT) {
        throw new Error(
          `Matrix transaction ${transactionId} is already ${existing.status ?? "pending"}`
        );
      }
      const retried = await this.client.resendEvent(existing, room);
      return this.confirmEncryptedDelivery(roomId, retried.event_id);
    }
    const result = await this.client.sendEvent(
      roomId,
      eventType as never,
      content as never,
      transactionId
    );
    return this.confirmEncryptedDelivery(roomId, result.event_id);
  }

  async readWorkspaceEvent(
    roomId: string,
    eventId: string
  ): Promise<{
    readonly wireType: string;
    readonly clearType: string;
    readonly content: unknown;
  }> {
    return readRemoteWorkspaceEvent(this.client, roomId, eventId);
  }

  async publishWorkspaceState(
    roomId: string,
    eventType: string,
    content: Readonly<Record<string, unknown>>
  ): Promise<string> {
    const result = await this.client.sendStateEvent(
      roomId,
      eventType as never,
      content as never,
      ""
    );
    return result.event_id;
  }

  async readWorkspaceState(
    roomId: string,
    eventType: string
  ): Promise<{
    readonly eventId: string;
    readonly content: Readonly<Record<string, unknown>>;
  }> {
    const event = this.client
      .getRoom(roomId)
      ?.currentState.getStateEvents(eventType, "");
    const eventId = event?.getId();
    if (event === null || event === undefined || eventId === undefined)
      throw new Error(`Matrix state ${eventType} is unavailable`);
    return {
      eventId,
      content: event.getContent() as Readonly<Record<string, unknown>>,
    };
  }

  async applyWorkspaceAccess(
    roomId: string,
    userPowerLevels: Readonly<Record<string, number>>,
    invitedUserIds: readonly string[],
    removedUserIds: readonly string[]
  ): Promise<void> {
    const room = this.client.getRoom(roomId);
    if (room === null) throw new Error("Matrix workspace room is unavailable");
    for (const userId of invitedUserIds) {
      const membership = room.getMember(userId)?.membership;
      if (membership !== "join" && membership !== "invite")
        await this.client.invite(roomId, userId);
    }
    await this.client.sendStateEvent(
      roomId,
      "m.room.power_levels" as never,
      {
        users: { ...userPowerLevels },
        users_default: 0,
        events_default: 50,
        state_default: 75,
        invite: 75,
        kick: 75,
        ban: 75,
        redact: 75,
        events: { "m.room.power_levels": 75, "m.room.encryption": 100 },
      } as never,
      ""
    );
    for (const userId of removedUserIds) {
      const membership = room.getMember(userId)?.membership;
      if (membership === "join" || membership === "invite")
        await this.client.kick(roomId, userId, "Lift workspace access revoked");
    }
  }

  async forceDiscardWorkspaceSession(roomId: string): Promise<void> {
    await this.requireCrypto().forceDiscardSession(roomId);
  }

  async signWorkspaceContent(
    content: Readonly<Record<string, unknown>>
  ): Promise<Readonly<Record<string, unknown>>> {
    const signed = structuredClone(content) as Record<string, unknown>;
    const cryptoWithSigning = this.requireCrypto() as unknown as {
      signObject(value: Record<string, unknown>): Promise<void>;
    };
    await cryptoWithSigning.signObject(signed);
    return signed;
  }

  subscribeWorkspaceEvents(
    listener: (event: MatrixWorkspaceWireEvent) => void | Promise<void>
  ): () => void {
    const emitter = this.client as unknown as {
      on(event: "event", listener: (event: MatrixEvent) => void): void;
      off(event: "event", listener: (event: MatrixEvent) => void): void;
    };
    const onEvent = (event: MatrixEvent) => {
      const serialized = this.serializeWireEvent(event);
      if (serialized !== null) void listener(serialized);
    };
    emitter.on("event", onEvent);
    return () => emitter.off("event", onEvent);
  }

  workspaceMembership(roomId: string): string | null {
    return this.client.getRoom(roomId)?.getMyMembership() ?? null;
  }

  subscribeWorkspaceMembership(
    listener: (event: MatrixWorkspaceMembershipEvent) => void | Promise<void>
  ): () => void {
    const emitter = this.client as unknown as {
      on(
        event: RoomEvent.MyMembership,
        listener: (room: Room, membership: string) => void
      ): void;
      off(
        event: RoomEvent.MyMembership,
        listener: (room: Room, membership: string) => void
      ): void;
    };
    const onMembership = (room: Room, membership: string) => {
      void listener({ roomId: room.roomId, membership });
    };
    emitter.on(RoomEvent.MyMembership, onMembership);
    return () => emitter.off(RoomEvent.MyMembership, onMembership);
  }

  listWorkspaceWireEvents(): readonly MatrixWorkspaceWireEvent[] {
    return this.client
      .getRooms()
      .flatMap((room) => room.getLiveTimeline().getEvents())
      .map((event) => this.serializeWireEvent(event))
      .filter((event): event is MatrixWorkspaceWireEvent => event !== null);
  }

  async decryptWorkspaceEvent(
    input: MatrixWorkspaceWireEvent
  ): Promise<DecryptedMatrixWorkspaceEvent> {
    const sdk = await browserSdk();
    const event = new sdk.MatrixEvent(JSON.parse(input.wireEvent));
    if (event.getWireType() !== "m.room.encrypted")
      throw new Error("Matrix workspace event is not encrypted");
    await this.client.decryptEventIfNeeded(event);
    // matrix-js-sdk represents a missing Megolm session as an m.room.message
    // placeholder instead of always rejecting decryptEventIfNeeded(). Treat it
    // as retryable key unavailability; it is not authenticated clear content.
    if (event.isDecryptionFailure())
      throw new Error("Matrix room key is not available yet");
    const senderUserId = event.getSender();
    if (senderUserId === undefined)
      throw new Error("Matrix event sender is missing");
    const senderCurve25519Key = event.getSenderKey();
    const claimedEd25519Key = event.getClaimedEd25519Key();
    const matrixCrypto = this.requireCrypto();
    const encryption = await matrixCrypto.getEncryptionInfoForEvent(event);
    let senderDeviceId: string | null = null;
    let deviceSignedByOwner = false;
    let crossUserVerified = false;
    const devices = (
      await matrixCrypto.getUserDeviceInfo([senderUserId], true)
    ).get(senderUserId);
    for (const device of devices?.values() ?? []) {
      if (
        device.getIdentityKey() === senderCurve25519Key &&
        device.getFingerprint() === claimedEd25519Key
      ) {
        senderDeviceId = device.deviceId;
        const status = await matrixCrypto.getDeviceVerificationStatus(
          senderUserId,
          device.deviceId
        );
        deviceSignedByOwner = isDeviceSignedByOwner(status);
        crossUserVerified = status?.crossSigningVerified === true;
        break;
      }
    }
    const clearContent = event.getContent() as Readonly<
      Record<string, unknown>
    >;
    const applicationSignatureVerified =
      senderDeviceId !== null && claimedEd25519Key !== null
        ? await verifyMatrixDeviceSignature({
            value: clearContent,
            userId: senderUserId,
            deviceId: senderDeviceId,
            ed25519Key: claimedEd25519Key,
          })
        : false;
    return {
      eventId: input.eventId,
      roomId: input.roomId,
      clearType: event.getType(),
      content: stripMatrixSignatures(clearContent),
      senderUserId,
      senderDeviceId,
      senderCurve25519Key,
      claimedEd25519Key,
      deviceCrossSigned: deviceSignedByOwner,
      shield:
        encryption === null
          ? "missing"
          : encryption.shieldColour === 0
            ? "none"
            : encryption.shieldColour === 1
              ? "grey"
              : "red",
      applicationSignatureVerified,
      verified: encryption?.shieldColour === 0 && crossUserVerified,
    };
  }

  async stop(): Promise<void> {
    window.removeEventListener("online", this.retrySyncOnline);
    this.clearOnlineRetry();
    this.inviteAutoJoiner.stop();
    (
      this.client as unknown as {
        off(event: "sync", listener: (state: string) => void): void;
      }
    ).off("sync", this.syncRecovered);
    this.client.off(
      CryptoEvent.VerificationRequestReceived,
      this.onVerificationRequest
    );
    this.verificationRequest?.off(
      VerificationRequestEvent.Change,
      this.syncVerificationRequest
    );
    this.client.stopClient();
  }

  private clearOnlineRetry(): void {
    if (this.onlineRetryTimer !== null)
      window.clearInterval(this.onlineRetryTimer);
    this.onlineRetryTimer = null;
  }

  private serializeWireEvent(
    event: MatrixEvent
  ): MatrixWorkspaceWireEvent | null {
    const eventId = event.getId();
    const roomId = event.getRoomId();
    const wireType = event.getWireType();
    if (
      eventId === undefined ||
      roomId === undefined ||
      wireType !== "m.room.encrypted"
    ) {
      return null;
    }
    return {
      eventId,
      roomId,
      wireType,
      wireEvent: JSON.stringify(event.event),
    };
  }

  private requireCrypto() {
    const value = this.client.getCrypto();
    if (value === undefined)
      throw new Error("Matrix Rust crypto did not initialize");
    return value;
  }
}

export class BrowserMatrixSdkFacade implements MatrixSdkFacade {
  constructor(private readonly secretKeys: SecretStorageKeyCache) {}

  async register(
    profile: ServerProfile,
    username: string,
    password: string
  ): Promise<MatrixLoginResult> {
    const sdk = await browserSdk();
    const client = sdk.createClient({ baseUrl: profile.baseUrl });
    const request = {
      username,
      password,
      refresh_token: true,
      initial_device_display_name: "Lift secure device",
    };
    let result;
    try {
      result = await client.registerRequest(request);
    } catch (error) {
      const data = (
        error as {
          data?: {
            session?: unknown;
            flows?: readonly { stages?: readonly string[] }[];
          };
        }
      ).data;
      const supportsDummy = data?.flows?.some(
        (flow) =>
          flow.stages?.length === 1 && flow.stages[0] === "m.login.dummy"
      );
      if (typeof data?.session !== "string" || !supportsDummy) throw error;
      result = await client.registerRequest({
        ...request,
        auth: { type: "m.login.dummy", session: data.session },
      });
    }
    if (result.access_token === undefined || result.device_id === undefined) {
      throw new Error("Matrix registration did not create a logged-in device");
    }
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id,
      deviceId: result.device_id,
    };
  }

  async login(
    profile: ServerProfile,
    username: string,
    password: string
  ): Promise<MatrixLoginResult> {
    const sdk = await browserSdk();
    const client = sdk.createClient({ baseUrl: profile.baseUrl });
    const result = await client.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: username },
      password,
      initial_device_display_name: "Lift secure device",
      refresh_token: true,
    });
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id,
      deviceId: result.device_id,
    };
  }

  async refresh(
    profile: ServerProfile,
    refreshToken: string
  ): Promise<MatrixRefreshResult> {
    const sdk = await browserSdk();
    const result = await sdk
      .createClient({ baseUrl: profile.baseUrl })
      .refreshToken(refreshToken);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiry: new Date(Date.now() + result.expires_in_ms),
    };
  }

  async createAuthenticated(options: {
    profile: ServerProfile;
    session: MatrixLoginResult;
    eventStore: unknown;
    secretStorageCallbacks: SecretStorageKeyCache["callbacks"];
    onRefresh: (refreshToken: string) => Promise<MatrixRefreshResult>;
  }): Promise<MatrixAuthenticatedClient> {
    const sdk = await browserSdk();
    const client = sdk.createClient({
      baseUrl: options.profile.baseUrl,
      accessToken: options.session.accessToken,
      refreshToken: options.session.refreshToken,
      userId: options.session.userId,
      deviceId: options.session.deviceId,
      store: options.eventStore as IndexedDBStore,
      timelineSupport: true,
      verificationMethods: [
        "m.sas.v1",
        "m.qr_code.show.v1",
        "m.qr_code.scan.v1",
      ],
      cryptoCallbacks: options.secretStorageCallbacks,
      tokenRefreshFunction: options.onRefresh,
    });
    return new BrowserAuthenticatedClient(
      client,
      options.eventStore as IndexedDBStore,
      this.secretKeys
    );
  }
}
