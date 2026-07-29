export interface MatrixDeviceVerificationEvidence {
  readonly signedByOwner: boolean;
  readonly crossSigningVerified: boolean;
  readonly localVerified: boolean;
}

/**
 * Matches Matrix OnlySignedDevicesIsolationMode: workspace key delivery is
 * restricted to devices signed by their owner's cross-signing identity.
 * Whether another user has interactively verified that identity is a separate
 * signal and may remain false while SAS/QR is deferred.
 */
export const isDeviceSignedByOwner = (
  status: MatrixDeviceVerificationEvidence | null
): boolean => status?.signedByOwner === true;
