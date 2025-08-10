import { DomainEvent } from "../domain/events/DomainEvent";
import { Result } from "../domain/Result";

/**
 * Interface for domain event handlers
 */
export interface DomainEventHandler {
  /**
   * Determines if this handler can handle the given event
   */
  canHandle(event: DomainEvent): boolean;

  /**
   * Handles the domain event
   */
  handle(event: DomainEvent): Promise<Result<void, Error>>;
}
