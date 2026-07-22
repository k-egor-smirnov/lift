import "reflect-metadata";
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

// Mock TaskId
vi.mock("../shared/domain/value-objects/TaskId", () => {
  let counter = 0;
  class InvalidTaskIdError extends Error {
    constructor(value: string) {
      super(`Invalid TaskId: ${value}. Must be a valid ULID.`);
      this.name = "InvalidTaskIdError";
    }
  }

  return {
    InvalidTaskIdError,
    TaskId: class MockTaskId {
      constructor(public value: string) {
        if (
          typeof value !== "string" ||
          !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)
        ) {
          throw new InvalidTaskIdError(String(value));
        }
      }

      equals(other: any) {
        return this.value === (other?.value || other);
      }

      static generate() {
        counter++;
        // Generate unique ULID-like IDs for testing
        // ULID format: 26 characters, base32 encoded
        const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        let result = "";

        // First 10 chars represent timestamp
        const timestamp = Date.now();
        let timestampPart = timestamp;
        for (let i = 0; i < 10; i++) {
          result = chars[timestampPart % 32] + result;
          timestampPart = Math.floor(timestampPart / 32);
        }

        // Last 16 chars represent randomness (using counter for uniqueness)
        let randomPart = counter;
        for (let i = 0; i < 16; i++) {
          result += chars[randomPart % 32];
          randomPart = Math.floor(randomPart / 32);
        }

        return new MockTaskId(result.padEnd(26, "0"));
      }

      static fromString(value: string) {
        return new MockTaskId(value);
      }

      getTimestamp() {
        const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        let timestamp = 0;
        for (const char of this.value.slice(0, 10)) {
          timestamp = timestamp * 32 + chars.indexOf(char);
        }
        return new Date(timestamp);
      }

      toString() {
        return this.value;
      }
    },
  };
});

// Mock NonEmptyTitle
vi.mock("../shared/domain/value-objects/NonEmptyTitle", () => {
  class InvalidTitleError extends Error {
    constructor(value: string) {
      super(
        `Invalid title: "${value}". Title cannot be empty or contain only whitespace.`
      );
      this.name = "InvalidTitleError";
    }
  }

  return {
    InvalidTitleError,
    NonEmptyTitle: class MockNonEmptyTitle {
      constructor(public value: string) {
        if (typeof value !== "string" || value.trim().length === 0) {
          throw new InvalidTitleError(value);
        }
        this.value = value.trim();
      }

      equals(other: any) {
        return this.value === (other?.value || other);
      }

      static fromString(value: string) {
        return new MockNonEmptyTitle(value);
      }

      get length() {
        return this.value.length;
      }

      contains(substring: string) {
        return this.value.toLowerCase().includes(substring.toLowerCase());
      }

      toUpperCase() {
        return this.value.toUpperCase();
      }

      toLowerCase() {
        return this.value.toLowerCase();
      }

      truncate(maxLength: number) {
        return this.value.length <= maxLength
          ? this.value
          : `${this.value.substring(0, maxLength - 3)}...`;
      }

      toString() {
        return this.value;
      }
    },
  };
});

// Mock DateOnly
vi.mock("../shared/domain/value-objects/DateOnly", () => {
  class InvalidDateOnlyError extends Error {
    constructor(value: string) {
      super(`Invalid DateOnly: ${value}. Must be in YYYY-MM-DD format.`);
      this.name = "InvalidDateOnlyError";
    }
  }

  return {
    InvalidDateOnlyError,
    DateOnly: class MockDateOnly {
      constructor(value: string) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new InvalidDateOnlyError(String(value));
        }
        const date = new Date(`${value}T00:00:00.000Z`);
        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          throw new InvalidDateOnlyError(value);
        }
        this.value = value;
      }

      value: string;

      equals(other: any) {
        return this.value === (other?.value || other);
      }

      daysDifference(other: any) {
        const thisDate = new Date(this.value);
        const otherDate = new Date(other?.value || other);
        const diffTime = Math.abs(otherDate.getTime() - thisDate.getTime());
        const days = diffTime / (1000 * 60 * 60 * 24);
        return days === 0 ? 0 : Math.ceil(days);
      }

      static today() {
        return MockDateOnly.fromDate(MockDateOnly.getCurrentDate());
      }

      static yesterday() {
        return MockDateOnly.today().subtractDays(1);
      }

      static getCurrentDate() {
        return new Date();
      }

      static fromDate = (date: Date) => {
        // Use local date formatting to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const localDateString = `${year}-${month}-${day}`;
        return new MockDateOnly(localDateString);
      };

      static fromString = (dateString: string) => {
        return new MockDateOnly(dateString);
      };

      toDate() {
        return new Date(`${this.value}T00:00:00.000Z`);
      }

      addDays(days: number) {
        const date = this.toDate();
        date.setUTCDate(date.getUTCDate() + days);
        return MockDateOnly.fromDate(date);
      }

      subtractDays(days: number) {
        return this.addDays(-days);
      }

      isBefore(other: any) {
        return this.value < (other?.value || other);
      }

      isAfter(other: any) {
        return this.value > (other?.value || other);
      }

      toString() {
        return this.value;
      }
    },
  };
});

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      // Simple key-to-text mapping for tests
      const translations: Record<string, string> = {
        // Categories
        "categories.simple": "Simple",
        "categories.focus": "Focus",
        "categories.inbox": "Inbox",
        "categories.deferred": "Deferred",

        // TaskCard translations
        "taskCard.justNow": "Just now",
        "taskCard.justNowShort": "Just now",
        "taskCard.touchHelp": "Touch help",
        "taskCard.overdue": "⚠️ Overdue",
        "taskCard.save": "Save",
        "taskCard.cancel": "Cancel",
        "taskCard.removeFromToday": "Remove from Today",
        "taskCard.addToToday": "Add to Today",
        "taskCard.removeTaskFromToday": "Remove task from today",
        "taskCard.addTaskToToday": "Add task to today",
        "taskCard.taskActions": "Task actions",
        "taskCard.completeTask": "✅ Complete",
        "taskCard.revertTask": "↩️ Revert",
        "taskCard.moreActions": "More actions",
        "taskCard.deferTask": "Defer Task",
        "taskCard.deleteTask": "Delete Task",
        "taskCard.lastLog": "Last log",
        "taskCard.noLogsYet": "No logs yet",
        "taskCard.logHistory": "Log History",
        "taskCard.hideLogHistory": "Hide",
        "taskCard.addNewLogPlaceholder": "Add new log...",
        "taskCard.saveLog": "Save log",
        "taskCard.loadingLogs": "Loading logs...",
        "taskCard.taskLogEntries": "Task log entries",
        "taskCard.noLogsFound": "No logs found",
        "taskCard.editTask": "Edit Task",
        "taskCard.markTaskAsComplete": "Mark task as complete",
        "taskCard.showLogHistory": "Show Log History",
        "taskCard.addLog": "Add Log",
        "taskCard.addFirstLog": "Add First Log",

        // Time formatting
        "time.justNow": "Just now",
        "time.secondsAgo": `${options?.count || 0}s ago`,
        "time.minutesAgo": `${options?.count || 0}m ago`,
        "time.hoursAgo": `${options?.count || 0}h ago`,
        "time.daysAgo": `${options?.count || 0}d ago`,

        // Navigation translations
        "navigation.today": "Today",

        // TodayView translations
        "todayView.title": "Today",
        "todayView.noTasksSelected": "No tasks selected for today",
        "todayView.startByAdding":
          "Start by adding tasks to your daily selection",
        "todayView.tip": "Tip",
        "todayView.dailySelectionResets":
          "Your daily selection resets every day",
        "todayView.completedTasks": "Completed Tasks",
        "todayView.progress": "Progress",
        "todayView.complete": "complete",

        // Common translations
        "common.today": "Today",
        "common.loading": "Loading...",
        "common.error": "Error",
        "common.cancel": "Cancel",
        "common.save": "Save",
      };

      return translations[key] || key;
    },
    i18n: {
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));
