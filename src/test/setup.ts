import "reflect-metadata";
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

// Mock TaskId
vi.mock("../shared/domain/value-objects/TaskId", () => {
  let counter = 0;

  return {
    TaskId: class MockTaskId {
      constructor(public value: string) {}

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
        // Simple validation - check if it looks like a ULID
        if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)) {
          throw new Error("Invalid task ID format");
        }
        return new MockTaskId(value);
      }
    },
  };
});

// Mock NonEmptyTitle
vi.mock("../shared/domain/value-objects/NonEmptyTitle", () => {
  return {
    NonEmptyTitle: class MockNonEmptyTitle {
      constructor(public value: string) {
        if (!value || value.trim().length === 0) {
          throw new Error("Title cannot be empty");
        }
      }

      equals(other: any) {
        return this.value === (other?.value || other);
      }

      static fromString(value: string) {
        return new MockNonEmptyTitle(value);
      }
    },
  };
});

// Mock DateOnly
vi.mock("../shared/domain/value-objects/DateOnly", () => {
  const mockDate = new Date("2023-12-01T12:00:00Z");
  const mockDateString = "2023-12-01";
  const mockYesterdayString = "2023-11-30";

  return {
    DateOnly: class MockDateOnly {
      constructor(value: string) {
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
        return new MockDateOnly(mockDateString);
      }

      static yesterday() {
        return new MockDateOnly(mockYesterdayString);
      }

      getCurrentDate() {
        return mockDate;
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
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
          throw new Error("Invalid date format");
        }
        return new MockDateOnly(dateString);
      };
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
        "taskCard.minutesAgo": `${options?.count || 0}m ago`,
        "taskCard.hoursAgo": `${options?.count || 0}h ago`,
        "taskCard.daysAgo": `${options?.count || 0}d ago`,

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
