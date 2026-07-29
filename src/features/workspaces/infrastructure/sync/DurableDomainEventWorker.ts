import type { DurableDomainEventDispatcher } from "../../application/services/DurableDomainEventDispatcher";

export class DurableDomainEventWorker {
  private running: Promise<void> | null = null;
  private stopped = false;
  private timer: number | null = null;

  constructor(private readonly dispatcher: DurableDomainEventDispatcher) {}

  start(): void {
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
      while (!this.stopped && (await this.dispatcher.dispatchOnce())) {
        // The durable store determines the next aggregate-safe event.
      }
    } catch {
      // retryOrDeadLetter already released the lease and recorded a safe code.
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
