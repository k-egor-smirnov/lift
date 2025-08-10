/**
 * Result type for functional error handling
 * Represents either a successful result with data or a failure with an error
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly success: true;
  readonly data: T;
  isSuccess(): this is Success<T>;
  isFailure(): this is Failure<any>;
}

export interface Failure<E> {
  readonly success: false;
  readonly error: E;
  isSuccess(): this is Success<any>;
  isFailure(): this is Failure<E>;
}

/**
 * Result utility class with factory methods
 */
export class ResultUtils {
  /**
   * Create a successful result
   */
  static ok<T>(data: T): Success<T> {
    return {
      success: true,
      data,
      isSuccess(): this is Success<T> {
        return true;
      },
      isFailure(): this is Failure<any> {
        return false;
      },
    };
  }

  /**
   * Create a failure result
   */
  static error<E>(error: E): Failure<E> {
    return {
      success: false,
      error,
      isSuccess(): this is Success<any> {
        return false;
      },
      isFailure(): this is Failure<E> {
        return true;
      },
    };
  }

  /**
   * Check if result is successful
   */
  static isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
    return result.success === true;
  }

  /**
   * Check if result is a failure
   */
  static isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
    return result.success === false;
  }

  /**
   * Map the success value to a new type
   */
  static map<T, U, E>(
    result: Result<T, E>,
    mapper: (value: T) => U
  ): Result<U, E> {
    if (ResultUtils.isSuccess(result)) {
      return ResultUtils.ok(mapper(result.data));
    }
    return result;
  }

  /**
   * Map the error to a new type
   */
  static mapError<T, E, F>(
    result: Result<T, E>,
    mapper: (error: E) => F
  ): Result<T, F> {
    if (ResultUtils.isFailure(result)) {
      return ResultUtils.error(mapper(result.error));
    }
    return result;
  }

  /**
   * Chain operations that return Results
   */
  static flatMap<T, U, E>(
    result: Result<T, E>,
    mapper: (value: T) => Result<U, E>
  ): Result<U, E> {
    if (ResultUtils.isSuccess(result)) {
      return mapper(result.data);
    }
    return result;
  }

  /**
   * Get the value or throw the error
   */
  static unwrap<T, E>(result: Result<T, E>): T {
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }
    throw result.error;
  }

  /**
   * Get the value or return a default
   */
  static unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    if (ResultUtils.isSuccess(result)) {
      return result.data;
    }
    return defaultValue;
  }
}

/**
 * Result factory class with factory methods for backward compatibility
 */
export class ResultFactory {
  /**
   * Create a successful result
   */
  static success<T>(data: T): Success<T> {
    return ResultUtils.ok(data);
  }

  /**
   * Create a failure result
   */
  static failure<E>(error: E): Failure<E> {
    return ResultUtils.error(error);
  }
}
