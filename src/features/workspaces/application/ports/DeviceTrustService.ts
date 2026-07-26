export interface VerifiedMatrixDevice {
  readonly userId: string;
  readonly deviceId: string;
}

export interface DeviceTrustService {
  requireReadyOwnDevice(): Promise<VerifiedMatrixDevice>;
}
