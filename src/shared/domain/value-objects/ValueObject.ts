/**
 * Base class for Value Objects following DDD principles
 * Value Objects are immutable and equality is based on their value, not identity
 */
export abstract class ValueObject<T> {
  protected readonly _value: T;

  constructor(value: T) {
    this.validate(value);
    this._value = value;
  }

  /**
   * Get the underlying value
   */
  get value(): T {
    return this._value;
  }

  /**
   * Validate the value - override in subclasses
   */
  protected abstract validate(value: T): void;

  /**
   * Check equality with another ValueObject
   */
  equals(other: ValueObject<T>): boolean {
    if (this.constructor !== other.constructor) {
      return false;
    }
    return this.isEqual(this._value, other._value);
  }

  /**
   * Deep equality check for complex values
   */
  private isEqual(a: T, b: T): boolean {
    if (a === b) return true;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (
      typeof a === "object" &&
      typeof b === "object" &&
      a !== null &&
      b !== null
    ) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(
        (key) =>
          keysB.includes(key) && this.isEqual((a as any)[key], (b as any)[key])
      );
    }

    return false;
  }

  /**
   * String representation
   */
  toString(): string {
    return String(this._value);
  }
}
