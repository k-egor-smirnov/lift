/**
 * Product-level switchboard for Matrix account and key-recovery flows.
 *
 * The Matrix SDK adapter keeps SAS support so it can be completed later
 * without redesigning the transport. Until its lifecycle and E2E coverage are
 * complete, the presentation layer must not expose or react to emoji
 * verification requests.
 */
export const MATRIX_AUTHENTICATION_CAPABILITIES = {
  password: true,
  recoveryKey: true,
  sasEmojiVerification: false,
} as const;
