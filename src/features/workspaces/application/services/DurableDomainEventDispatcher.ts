import type {
  DomainEventStore,
  DurableDomainEvent,
} from "../ports/DomainEventStore";

export interface DurableDomainEventHandler {
  readonly id: string;
  readonly eventTypes?: readonly string[];
  handle(event: DurableDomainEvent): Promise<void>;
}

export interface DomainEventDispatcherClock {
  now(): number;
}

const safeErrorCode = (error: unknown): string => {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) ? name : "UnknownError";
};

export class DurableDomainEventDispatcher {
  constructor(
    private readonly store: DomainEventStore,
    private readonly handlers: readonly DurableDomainEventHandler[],
    private readonly clock: DomainEventDispatcherClock,
    private readonly retryDelay: (attempt: number) => number = (attempt) =>
      Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 8)),
    private readonly maximumAttempts = 8,
    private readonly leaseDurationMs = 30_000
  ) {}

  async dispatchOnce(
    options: { readonly crashAfterHandler?: boolean } = {}
  ): Promise<boolean> {
    const event = await this.store.claimNext(
      this.clock.now(),
      this.leaseDurationMs
    );
    if (event === null) return false;
    try {
      for (const handler of this.handlers) {
        if (
          handler.eventTypes !== undefined &&
          !handler.eventTypes.includes(event.eventType)
        ) {
          continue;
        }
        if (await this.store.hasHandled(event.id, handler.id)) continue;
        await handler.handle(event);
        if (options.crashAfterHandler === true)
          throw new SimulatedPostHandlerCrashError();
        await this.store.markHandled(event.id, handler.id, this.clock.now());
      }
      await this.store.markDone(event.id);
      return true;
    } catch (error) {
      if (error instanceof SimulatedPostHandlerCrashError) throw error;
      await this.store.retryOrDeadLetter(event.id, {
        now: this.clock.now(),
        nextAttemptAt: this.clock.now() + this.retryDelay(event.attemptCount),
        maximumAttempts: this.maximumAttempts,
        errorCode: safeErrorCode(error),
      });
      throw error;
    }
  }
}

class SimulatedPostHandlerCrashError extends Error {
  constructor() {
    super("Simulated process crash after handler side effect");
    this.name = "SimulatedPostHandlerCrashError";
  }
}
