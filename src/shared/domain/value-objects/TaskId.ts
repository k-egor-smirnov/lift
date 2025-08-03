import { ulid } from "ulid";
import { ValueObject } from "./ValueObject";

/**
 * Domain error for invalid TaskId values
 */
export class InvalidTaskIdError extends Error {
  constructor(value: string) {
    super(`Invalid TaskId: ${value}. Must be a valid ULID.`);
    this.name = "InvalidTaskIdError";
  }
}

/**
 * TaskId value object using ULID format
 * Provides unique, sortable identifiers for tasks
 */
export class TaskId extends ValueObject<string> {
  private static readonly ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  protected validate(value: string): void {
    if (!value || typeof value !== "string") {
      throw new InvalidTaskIdError(value);
    }

    if (!TaskId.ULID_REGEX.test(value)) {
      throw new InvalidTaskIdError(value);
    }
  }

  /**
   * Generate a new TaskId
   */
  static generate(): TaskId {
    return new TaskId(ulid());
  }

  /**
   * Create TaskId from existing ULID string
   */
  static fromString(value: string): TaskId {
    return new TaskId(value);
  }

  /**
   * Get the timestamp from the ULID
   */
  getTimestamp(): Date {
    // ULID first 10 characters represent timestamp in Crockford's Base32
    const timestampPart = this._value.substring(0, 10);

    // Convert from Crockford's Base32 to decimal
    const base32Chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let timestamp = 0;

    for (let i = 0; i < timestampPart.length; i++) {
      const char = timestampPart[i];
      const value = base32Chars.indexOf(char);
      if (value === -1) {
        throw new InvalidTaskIdError(this._value);
      }
      timestamp = timestamp * 32 + value;
    }

    return new Date(timestamp);
  }
}
