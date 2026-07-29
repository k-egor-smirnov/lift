export interface EncryptedTransport {
  send(input: {
    readonly roomId: string;
    readonly innerType: "dev.lift.crdt.change.v1" | "dev.lift.checkpoint.v1";
    readonly content: Readonly<Record<string, unknown>>;
    readonly transactionId: string;
  }): Promise<{ readonly eventId: string }>;
}

export class EncryptedTransportError extends Error {
  constructor(readonly kind: "transient" | "authentication" | "permanent") {
    super(`Encrypted transport ${kind} error`);
    this.name = "EncryptedTransportError";
  }
}
