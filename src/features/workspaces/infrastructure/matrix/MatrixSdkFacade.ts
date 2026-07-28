import type { ServerProfile } from "../../domain/ServerProfile";
import type { SecretStorageCallbacks } from "./SecretStorageKeyCache";
import type { MatrixVerificationSnapshot } from "../../application/ports/MatrixSession";

export interface MatrixLoginResult {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly userId: string;
  readonly deviceId: string;
}

export interface MatrixRefreshResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiry?: Date;
}

export interface MatrixAuthenticatedClient {
  readonly workspaceRooms?: MatrixWorkspaceClient;
  eventStoreStartup(): Promise<void>;
  initRustCrypto(
    cryptoDatabasePrefix: string,
    storageKey: Uint8Array
  ): Promise<void>;
  setSignedDeviceIsolation(): Promise<void>;
  startAndWaitPrepared(): Promise<void>;
  hasExistingSecureSetup(): Promise<boolean>;
  joinInvitedWorkspaceRooms?(): Promise<void>;
  bootstrapCrossSigning(username: string, password: string): Promise<void>;
  createRecoveryKey(): Promise<{
    readonly encodedPrivateKey: string;
    readonly generated: unknown;
  }>;
  bootstrapSecretStorage(generated: unknown): Promise<void>;
  recoverKeys(
    recoveryKey: string,
    username: string,
    password: string
  ): Promise<void>;
  recoveryConfirmed(): Promise<void>;
  verificationSnapshot?(): MatrixVerificationSnapshot;
  subscribeVerification?(
    listener: (snapshot: MatrixVerificationSnapshot) => void
  ): () => void;
  requestDeviceVerification?(): Promise<void>;
  acceptDeviceVerification?(): Promise<void>;
  startSasVerification?(): Promise<void>;
  confirmDeviceVerification?(): Promise<void>;
  rejectDeviceVerification?(): Promise<void>;
  logout?(): Promise<void>;
  stop(): Promise<void>;
}

export interface MatrixWorkspaceClient {
  syncState?(): string;
  workspaceIdentity?(): { readonly userId: string; readonly deviceId: string };
  createEncryptedWorkspaceRoom(ownerUserId: string): Promise<string>;
  ownDeviceKeys(): Promise<{
    readonly ed25519: string;
    readonly curve25519: string;
  }>;
  sendEncryptedWorkspaceEvent(
    roomId: string,
    eventType: string,
    content: Readonly<Record<string, unknown>>,
    transactionId: string
  ): Promise<string>;
  readWorkspaceEvent(
    roomId: string,
    eventId: string
  ): Promise<{
    readonly wireType: string;
    readonly clearType: string;
    readonly content: unknown;
  }>;
  publishWorkspaceState(
    roomId: string,
    eventType: string,
    content: Readonly<Record<string, unknown>>
  ): Promise<string>;
  readWorkspaceState?(
    roomId: string,
    eventType: string
  ): Promise<{
    readonly eventId: string;
    readonly content: Readonly<Record<string, unknown>>;
  }>;
  applyWorkspaceAccess?(
    roomId: string,
    userPowerLevels: Readonly<Record<string, number>>,
    invitedUserIds: readonly string[],
    removedUserIds: readonly string[]
  ): Promise<void>;
  forceDiscardWorkspaceSession?(roomId: string): Promise<void>;
  signWorkspaceContent(
    content: Readonly<Record<string, unknown>>
  ): Promise<Readonly<Record<string, unknown>>>;
  subscribeWorkspaceEvents(
    listener: (event: MatrixWorkspaceWireEvent) => void | Promise<void>
  ): () => void;
  workspaceMembership?(roomId: string): string | null;
  subscribeWorkspaceMembership?(
    listener: (event: MatrixWorkspaceMembershipEvent) => void | Promise<void>
  ): () => void;
  listWorkspaceWireEvents(): readonly MatrixWorkspaceWireEvent[];
  decryptWorkspaceEvent(
    event: MatrixWorkspaceWireEvent
  ): Promise<DecryptedMatrixWorkspaceEvent>;
}

export interface MatrixWorkspaceWireEvent {
  readonly eventId: string;
  readonly roomId: string;
  readonly wireType: string;
  readonly wireEvent: string;
}

export interface MatrixWorkspaceMembershipEvent {
  readonly roomId: string;
  readonly membership: string;
}

export interface DecryptedMatrixWorkspaceEvent {
  readonly eventId: string;
  readonly roomId: string;
  readonly clearType: string;
  readonly content: unknown;
  readonly senderUserId: string;
  readonly senderDeviceId: string | null;
  readonly senderCurve25519Key: string | null;
  readonly claimedEd25519Key: string | null;
  readonly deviceCrossSigned: boolean;
  readonly shield: "none" | "grey" | "red" | "missing";
  readonly applicationSignatureVerified: boolean;
  readonly verified: boolean;
}

export interface MatrixSdkFacade {
  register(
    profile: ServerProfile,
    username: string,
    password: string
  ): Promise<MatrixLoginResult>;
  login(
    profile: ServerProfile,
    username: string,
    password: string
  ): Promise<MatrixLoginResult>;
  refresh(
    profile: ServerProfile,
    refreshToken: string
  ): Promise<MatrixRefreshResult>;
  createAuthenticated(options: {
    readonly profile: ServerProfile;
    readonly session: MatrixLoginResult;
    readonly eventStore: unknown;
    readonly secretStorageCallbacks: SecretStorageCallbacks;
    readonly onRefresh: (refreshToken: string) => Promise<MatrixRefreshResult>;
  }): Promise<MatrixAuthenticatedClient>;
}
