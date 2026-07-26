import type { ProcessOutboxUseCase } from "../../application/use-cases/ProcessOutboxUseCase";

export class OutboxWorker {
  private running: Promise<void> | null = null;
  private stopped = false;
  private timer: number | null = null;

  constructor(private readonly process: ProcessOutboxUseCase) {}

  start(): void {
    if (this.stopped) return;
    void this.wake();
  }

  wake(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running !== null) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    try {
      while (!this.stopped && (await this.process.runOnce())) {
        // The durable query is the source of truth; keep draining due rows.
      }
    } finally {
      if (!this.stopped && this.timer === null) {
        this.timer = window.setTimeout(() => {
          this.timer = null;
          void this.wake();
        }, 1_000);
      }
    }
  }
}
