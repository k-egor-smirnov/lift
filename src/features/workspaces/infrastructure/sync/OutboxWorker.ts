import type { ProcessOutboxUseCase } from "../../application/use-cases/ProcessOutboxUseCase";

export class OutboxWorker {
  private running: Promise<void> | null = null;
  private paused = true;
  private disposed = false;
  private timer: number | null = null;

  constructor(private readonly process: ProcessOutboxUseCase) {}

  start(): void {
    if (this.disposed) return;
    this.paused = false;
    void this.wake();
  }

  wake(): Promise<void> {
    if (this.disposed || this.paused) return Promise.resolve();
    if (this.running !== null) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  pause(): void {
    this.paused = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  async pauseAndDrain(): Promise<void> {
    this.pause();
    await this.running;
  }

  stop(): void {
    this.disposed = true;
    this.pause();
  }

  private async drain(): Promise<void> {
    try {
      while (!this.disposed && !this.paused && (await this.process.runOnce())) {
        // The durable query is the source of truth; keep draining due rows.
      }
    } finally {
      if (!this.disposed && !this.paused && this.timer === null) {
        this.timer = window.setTimeout(() => {
          this.timer = null;
          void this.wake();
        }, 1_000);
      }
    }
  }
}
