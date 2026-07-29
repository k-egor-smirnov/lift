import type { SyncInbox } from "../../application/ports/SyncInbox";
import type { ProcessInboxUseCase } from "../../application/use-cases/ProcessInboxUseCase";
import type { MatrixWorkspaceClient } from "../matrix/MatrixSdkFacade";

export class InboxWorker {
  private running: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private keyRetryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly inFlightIngestions = new Set<Promise<void>>();

  constructor(
    private readonly inbox: SyncInbox,
    private readonly process: ProcessInboxUseCase,
    private readonly matrix: MatrixWorkspaceClient,
    private readonly now: () => number = () => Date.now()
  ) {}

  async start(): Promise<void> {
    if (this.stopped || this.unsubscribe !== null) return;
    this.unsubscribe = this.matrix.subscribeWorkspaceEvents((event) =>
      this.trackIngestion(event)
    );
    this.keyRetryTimer ??= setInterval(() => {
      void this.retryMissingKeys();
    }, 2_000);
    try {
      for (const event of this.matrix.listWorkspaceWireEvents()) {
        await this.ingest(event);
      }
    } finally {
      // A malformed/unsupported cached timeline entry must not prevent durable
      // rows already persisted before the crash from being resumed.
      await this.wake();
    }
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.keyRetryTimer !== null) {
      clearInterval(this.keyRetryTimer);
      this.keyRetryTimer = null;
    }
  }

  async pauseAndDrain(): Promise<void> {
    this.stop();
    await Promise.all([...this.inFlightIngestions]);
    await this.running;
  }

  private async retryMissingKeys(): Promise<void> {
    if (this.stopped) return;
    if ((await this.inbox.retryWaitingForKeys()) > 0) await this.wake();
  }

  wake(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running !== null) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async ingest(event: {
    readonly eventId: string;
    readonly roomId: string;
    readonly wireEvent: string;
  }): Promise<void> {
    await this.inbox.persist(event, this.now());
    await this.wake();
  }

  private trackIngestion(event: {
    readonly eventId: string;
    readonly roomId: string;
    readonly wireEvent: string;
  }): Promise<void> {
    const ingestion = this.ingest(event);
    this.inFlightIngestions.add(ingestion);
    void ingestion.then(
      () => this.inFlightIngestions.delete(ingestion),
      () => this.inFlightIngestions.delete(ingestion)
    );
    return ingestion;
  }

  private async drain(): Promise<void> {
    while (!this.stopped && (await this.process.runOnce())) {
      // Persist-before-process plus idempotent apply makes this crash safe.
    }
  }
}
