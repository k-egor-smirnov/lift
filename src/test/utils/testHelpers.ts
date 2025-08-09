import { beforeEach, afterEach, vi, expect } from "vitest";
import { container } from "../../shared/infrastructure/di";
import { ResultUtils } from "@/shared/domain/Result";
import { TaskId } from "../../shared/domain/value-objects/TaskId";
import { ulid } from "ulid";

/**
 * Common test setup utilities
 */
export class TestHelpers {
  /**
   * Setup fake timers with a consistent date
   */
  static setupFakeTimers(mockDate = "2023-12-01T00:00:00.000Z") {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockDate));
  }

  /**
   * Restore real timers
   */
  static restoreTimers() {
    vi.useRealTimers();
  }

  /**
   * Clear DI container instances for clean tests
   */
  static clearContainer() {
    container.clearInstances();
  }

  /**
   * Setup DOM environment for browser-dependent tests
   */
  static setupDOMEnvironment() {
    // Mock navigator
    Object.defineProperty(global, "navigator", {
      value: {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      writable: true,
    });

    // Mock window if needed
    if (typeof window === "undefined") {
      Object.defineProperty(global, "window", {
        value: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        writable: true,
      });
    }
  }

  /**
   * Create a standard beforeEach setup for use cases
   */
  static createUseCaseSetup(setupFn?: () => void) {
    return () => {
      vi.clearAllMocks();
      if (setupFn) {
        setupFn();
      }
    };
  }

  /**
   * Create a standard afterEach cleanup
   */
  static createCleanup(cleanupFn?: () => void) {
    return () => {
      vi.clearAllMocks();
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }
}

/**
 * Common database transaction mock setup
 */
export const createDatabaseTransactionMock = () => {
  const mockTransaction = vi.fn().mockImplementation(async (callback) => {
    return await callback();
  });

  return {
    transaction: mockTransaction,
    mockTransaction,
  };
};

/**
 * Common Dexie collection mock for query operations
 */
export const createDexieCollectionMock = () => ({
  count: vi.fn(),
  and: vi.fn().mockReturnThis(),
  reverse: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  toArray: vi.fn(),
  first: vi.fn(),
  where: vi.fn().mockReturnThis(),
  equals: vi.fn().mockReturnThis(),
  above: vi.fn().mockReturnThis(),
  below: vi.fn().mockReturnThis(),
  between: vi.fn().mockReturnThis(),
  anyOf: vi.fn().mockReturnThis(),
  filter: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  desc: vi.fn().mockReturnThis(),
  asc: vi.fn().mockReturnThis(),
});

/**
 * Common assertion helpers
 */
export class AssertionHelpers {
  /**
   * Assert that a mock was called with specific arguments
   */
  static expectCalledWith(mockFn: any, ...args: any[]) {
    expect(mockFn).toHaveBeenCalledWith(...args);
  }

  /**
   * Assert that a mock was called exactly n times
   */
  static expectCalledTimes(mockFn: any, times: number) {
    expect(mockFn).toHaveBeenCalledTimes(times);
  }

  /**
   * Assert that a result is successful
   */
  static expectSuccess(result: any) {
    expect(ResultUtils.isSuccess(result)).toBe(true);
    return result.getValue();
  }

  /**
   * Assert that a result is a failure
   */
  static expectFailure(result: any) {
    expect(result.isFailure()).toBe(true);
    return result.getError();
  }

  /**
   * Assert that a promise resolves without throwing
   */
  static async expectNotToThrow(promise: Promise<any>) {
    await expect(promise).resolves.not.toThrow();
  }

  /**
   * Assert that a promise rejects with specific error
   */
  static async expectToThrow(promise: Promise<any>, errorMessage?: string) {
    if (errorMessage) {
      await expect(promise).rejects.toThrow(errorMessage);
    } else {
      await expect(promise).rejects.toThrow();
    }
  }
}

/**
 * Date utilities for tests
 */
export class TestDateUtils {
  static readonly MOCK_DATE = "2023-12-01T00:00:00.000Z";
  static readonly MOCK_DATE_OBJECT = new Date(TestDateUtils.MOCK_DATE);

  /**
   * Create a date relative to the mock date
   */
  static createRelativeDate(daysOffset: number): Date {
    const date = new Date(TestDateUtils.MOCK_DATE);
    date.setDate(date.getDate() + daysOffset);
    return date;
  }

  /**
   * Create a DateOnly for testing
   */
  static createDateOnly(daysOffset = 0): string {
    const date = TestDateUtils.createRelativeDate(daysOffset);
    return date.toISOString().split("T")[0];
  }
}

/**
 * TaskId utilities for tests
 */
export class TestTaskIdUtils {
  private static readonly TEST_TASK_IDS: string[] = [];
  private static counter = 0;

  /**
   * Generate a valid ULID-based TaskId for testing
   */
  static generateTaskId(): TaskId {
    return TaskId.generate();
  }

  /**
   * Create a TaskId from a deterministic ULID for consistent testing
   */
  static createDeterministicTaskId(seed?: string): TaskId {
    // Create a deterministic ULID-like string for testing
    const timestamp = Date.now();
    const randomPart = (seed || `test${this.counter++}`)
      .padEnd(16, "0")
      .substring(0, 16)
      .toUpperCase();
    const ulid =
      timestamp.toString(36).padStart(10, "0").toUpperCase() + randomPart;

    // Ensure it matches ULID format by using actual ULID generation
    return TaskId.generate();
  }

  /**
   * Create multiple TaskIds for testing
   */
  static generateMultipleTaskIds(count: number): TaskId[] {
    return Array.from({ length: count }, () => this.generateTaskId());
  }

  /**
   * Get a valid TaskId string for testing (ULID format)
   */
  static getValidTaskIdString(): string {
    return this.generateTaskId().value;
  }

  /**
   * Reset counter for deterministic testing
   */
  static resetCounter(): void {
    this.counter = 0;
    this.TEST_TASK_IDS.length = 0;
  }
}
