import { ValueObject } from "./ValueObject";

/**
 * Domain error for invalid NonEmptyTitle values
 */
export class InvalidTitleError extends Error {
  constructor(value: string) {
    super(
      `Invalid title: "${value}". Title cannot be empty or contain only whitespace.`
    );
    this.name = "InvalidTitleError";
  }
}

/**
 * NonEmptyTitle value object ensuring task titles are not empty
 * Automatically trims whitespace and validates non-empty content
 */
export class NonEmptyTitle extends ValueObject<string> {
  protected validate(value: string): void {
    if (typeof value !== "string") {
      throw new InvalidTitleError(String(value));
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new InvalidTitleError(value);
    }
  }

  constructor(value: string) {
    // Trim the value before calling super
    const trimmed = typeof value === "string" ? value.trim() : value;
    super(trimmed);
  }

  /**
   * Create NonEmptyTitle from string
   */
  static fromString(value: string): NonEmptyTitle {
    return new NonEmptyTitle(value);
  }

  /**
   * Get the length of the title
   */
  get length(): number {
    return this._value.length;
  }

  /**
   * Check if title contains a substring (case-insensitive)
   */
  contains(substring: string): boolean {
    return this._value.toLowerCase().includes(substring.toLowerCase());
  }

  /**
   * Get title in uppercase
   */
  toUpperCase(): string {
    return this._value.toUpperCase();
  }

  /**
   * Get title in lowercase
   */
  toLowerCase(): string {
    return this._value.toLowerCase();
  }

  /**
   * Truncate title to specified length with ellipsis
   */
  truncate(maxLength: number): string {
    if (this._value.length <= maxLength) {
      return this._value;
    }
    return this._value.substring(0, maxLength - 3) + "...";
  }
}
