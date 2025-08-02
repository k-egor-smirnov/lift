import { TaskEvent, TaskEventType, AnyTaskEvent } from '../../domain/events/TaskEvent';

/**
 * Event listener function type
 */
export type TaskEventListener = (event: AnyTaskEvent) => void | Promise<void>;

/**
 * Task event bus for managing task-related events
 */
export class TaskEventBus {
  private listeners: Map<TaskEventType | 'all', Array<(event: AnyTaskEvent) => void | Promise<void>>> = new Map();

  /**
   * Subscribe to a specific event type
   */
  subscribe<T extends TaskEventType>(
    eventType: T,
    listener: (event: Extract<AnyTaskEvent, { type: T }>) => void | Promise<void>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    
    const listeners = this.listeners.get(eventType)!;
    listeners.push(listener as (event: AnyTaskEvent) => void | Promise<void>);
    
    // Return unsubscribe function
    return () => {
      const index = listeners.indexOf(listener as (event: AnyTaskEvent) => void | Promise<void>);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to all events
   */
  subscribeToAll(listener: (event: AnyTaskEvent) => void | Promise<void>): () => void {
    if (!this.listeners.has('all')) {
      this.listeners.set('all', []);
    }
    
    const listeners = this.listeners.get('all')!;
    listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  async emit(event: AnyTaskEvent): Promise<void> {
    // Emit to specific event type listeners
    const specificListeners = this.listeners.get(event.type) || [];
    const allListeners = this.listeners.get('all') || [];
    
    const allPromises = [...specificListeners, ...allListeners].map(listener => {
      try {
        return Promise.resolve(listener(event));
      } catch (error) {
        console.error('Error in event listener:', error);
        return Promise.resolve();
      }
    });
    
    await Promise.all(allPromises);
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get the number of listeners for debugging
   */
  getListenerCount(eventType?: TaskEventType | 'all'): number {
    if (eventType) {
      return this.listeners.get(eventType)?.length || 0;
    }
    
    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.length;
    }
    return total;
  }

  /**
   * Alias for subscribe - for compatibility
   */
  on<T extends TaskEventType>(
    eventType: T,
    listener: (event: Extract<AnyTaskEvent, { type: T }>) => void | Promise<void>
  ): () => void {
    return this.subscribe(eventType, listener);
  }

  /**
   * Remove event listener - for compatibility
   */
  off<T extends TaskEventType>(
    eventType: T,
    listener: (event: Extract<AnyTaskEvent, { type: T }>) => void | Promise<void>
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener as (event: AnyTaskEvent) => void | Promise<void>);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
}

/**
 * Global task event bus instance
 */
export const taskEventBus = new TaskEventBus();