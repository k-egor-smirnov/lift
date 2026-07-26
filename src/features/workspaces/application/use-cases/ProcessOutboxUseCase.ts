import {
  EncryptedTransportError,
  type EncryptedTransport,
} from "../ports/EncryptedTransport";
import type {
  ClaimedOutboxItem,
  OutboxFragment,
  SyncOutbox,
} from "../ports/SyncOutbox";

export interface ChangePayloadFragmenter {
  split(bytes: Uint8Array): Promise<readonly OutboxFragment[]>;
}

export interface ProcessOutboxClock {
  now(): number;
}

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const commonEnvelope = (item: ClaimedOutboxItem) => ({
  type: "dev.lift.crdt.change.v1" as const,
  schemaVersion: 1 as const,
  workspaceId: item.workspaceId,
  authEpoch: item.authEpoch,
  changeHash: item.changeHash,
  dependencies: [...item.dependencies].sort(),
});

export class ProcessOutboxUseCase {
  constructor(
    private readonly outbox: SyncOutbox,
    private readonly transport: EncryptedTransport,
    private readonly fragmenter: ChangePayloadFragmenter,
    private readonly clock: ProcessOutboxClock,
    private readonly retryDelay: (attempt: number) => number
  ) {}

  async runOnce(): Promise<boolean> {
    const item = await this.outbox.claimNext(this.clock.now());
    if (item === null) return false;
    const fragments = await this.fragmenter.split(item.bytes);
    await this.outbox.persistFragments(item, fragments);
    try {
      if (fragments.length === 0) {
        const response = await this.transport.send({
          roomId: item.roomId,
          innerType: "dev.lift.crdt.change.v1",
          content: {
            ...commonEnvelope(item),
            payload: { mode: "inline", bytes: base64Url(item.bytes) },
          },
          transactionId: `lift.c1.${item.changeHash}.0`,
        });
        await this.outbox.markFragmentSent(item.id, response.eventId, 1, true);
        return true;
      }

      for (
        let index = item.nextFragmentIndex;
        index < fragments.length;
        index += 1
      ) {
        const fragment = fragments[index];
        if (fragment === undefined) throw new Error("Missing payload fragment");
        const response = await this.transport.send({
          roomId: item.roomId,
          innerType: "dev.lift.crdt.change.v1",
          content: {
            ...commonEnvelope(item),
            payload: {
              mode: "fragment",
              transferId: item.changeHash,
              index: fragment.index,
              count: fragment.count,
              fragmentHash: fragment.fragmentHash,
              bytes: base64Url(fragment.bytes),
            },
          },
          transactionId: `lift.c1.${item.changeHash}.${fragment.index}`,
        });
        await this.outbox.markFragmentSent(
          item.id,
          response.eventId,
          index + 1,
          index + 1 === fragments.length
        );
      }
      return true;
    } catch (error) {
      if (error instanceof EncryptedTransportError) {
        if (error.kind === "authentication") {
          await this.outbox.pause(item.id, "auth");
          return true;
        }
        if (error.kind === "permanent") {
          await this.outbox.pause(item.id, "permanent");
          return true;
        }
      }
      const attempt = item.attemptCount + 1;
      await this.outbox.retry(
        item.id,
        attempt,
        this.clock.now() + this.retryDelay(item.attemptCount)
      );
      return true;
    }
  }
}
