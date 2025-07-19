import { ValueObject } from './ValueObject';

/**
 * Domain error for invalid DateOnly values
 */
export class InvalidDateOnlyError extends Error {
  constructor(value: string) {
    super(`Invalid DateOnly: ${value}. Must be in YYYY-MM-DD format.`);
    this.name = 'InvalidDateOnlyError';
  }
}

/**
 * DateOnly value object representing a date without time
 * Format: YYYY-MM-DD
 */
export class DateOnly extends ValueObject<string> {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  protected validate(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new InvalidDateOnlyError(value);
    }

    if (!DateOnly.DATE_REGEX.test(value)) {
      throw new InvalidDateOnlyError(value);
    }

    // Validate that it's a real date
    const date = new Date(value + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      throw new InvalidDateOnlyError(value);
    }

    // Ensure the parsed date matches the input (catches invalid dates like 2023-02-30)
    const [year, month, day] = value.split('-').map(Number);
    if (date.getUTCFullYear() !== year || 
        date.getUTCMonth() !== month - 1 || 
        date.getUTCDate() !== day) {
      throw new InvalidDateOnlyError(value);
    }
  }

  /**
   * Create DateOnly from today's date
   */
  static today(): DateOnly {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return new DateOnly(`${year}-${month}-${day}`);
  }

  /**
   * Create DateOnly from yesterday's date
   */
  static yesterday(): DateOnly {
    return DateOnly.today().subtractDays(1);
  }

  /**
   * Create DateOnly from Date object
   */
  static fromDate(date: Date): DateOnly {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return new DateOnly(`${year}-${month}-${day}`);
  }

  /**
   * Create DateOnly from string
   */
  static fromString(value: string): DateOnly {
    return new DateOnly(value);
  }

  /**
   * Convert to Date object (at midnight UTC)
   */
  toDate(): Date {
    return new Date(this._value + 'T00:00:00.000Z');
  }

  /**
   * Add days to this date
   */
  addDays(days: number): DateOnly {
    const date = this.toDate();
    date.setUTCDate(date.getUTCDate() + days);
    return DateOnly.fromDate(date);
  }

  /**
   * Subtract days from this date
   */
  subtractDays(days: number): DateOnly {
    return this.addDays(-days);
  }

  /**
   * Check if this date is before another date
   */
  isBefore(other: DateOnly): boolean {
    return this._value < other._value;
  }

  /**
   * Check if this date is after another date
   */
  isAfter(other: DateOnly): boolean {
    return this._value > other._value;
  }

  /**
   * Get difference in days between this date and another
   */
  daysDifference(other: DateOnly): number {
    const thisDate = this.toDate();
    const otherDate = other.toDate();
    const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}