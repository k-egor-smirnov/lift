export type MatrixSessionPhase =
  | "signed-out"
  | "initializing-crypto"
  | "recovery-key-required"
  | "recovery-confirmation"
  | "waiting-verification"
  | "recovering-keys"
  | "ready"
  | "error";

export interface MatrixSessionSnapshot {
  readonly phase: MatrixSessionPhase;
  readonly profileId: string | null;
  readonly userId: string | null;
  readonly deviceId: string | null;
  readonly errorCode: string | null;
  readonly recoveryKeyForDisplay: string | null;
  readonly confirmationGroup: number | null;
}

export interface MatrixCredentials {
  readonly profileId: string;
  readonly username: string;
  readonly password: string;
}

export type MatrixVerificationPhase =
  | "idle"
  | "requested"
  | "ready"
  | "verifying"
  | "sas"
  | "done"
  | "cancelled"
  | "error";

export interface MatrixVerificationSnapshot {
  readonly phase: MatrixVerificationPhase;
  readonly otherUserId: string | null;
  readonly otherDeviceId: string | null;
  readonly initiatedByMe: boolean;
  readonly emojis: readonly {
    readonly symbol: string;
    readonly label: string;
  }[];
  readonly decimals: readonly number[];
}

export interface MatrixSession {
  snapshot(): MatrixSessionSnapshot;
  subscribe(listener: (snapshot: MatrixSessionSnapshot) => void): () => void;
  verificationSnapshot(): MatrixVerificationSnapshot;
  subscribeVerification(
    listener: (snapshot: MatrixVerificationSnapshot) => void
  ): () => void;
  beginFirstDevice(credentials: MatrixCredentials): Promise<void>;
  registerFirstDevice(credentials: MatrixCredentials): Promise<void>;
  beginRecovery(credentials: MatrixCredentials): Promise<void>;
  confirmRecoveryGroup(value: string): Promise<void>;
  recoverWithKey(recoveryKey: string): Promise<void>;
  requestDeviceVerification(): Promise<void>;
  acceptDeviceVerification(): Promise<void>;
  startSasVerification(): Promise<void>;
  confirmDeviceVerification(): Promise<void>;
  rejectDeviceVerification(): Promise<void>;
  logout(): Promise<void>;
  resume(): Promise<boolean>;
  canCreateWorkspace(): boolean;
  stop(): Promise<void>;
}
