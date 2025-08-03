import { describe, it, expect } from "vitest";
import { NonEmptyTitle, InvalidTitleError } from "../NonEmptyTitle";

describe("NonEmptyTitle", () => {
  describe("constructor", () => {
    it("should create NonEmptyTitle with valid string", () => {
      const title = new NonEmptyTitle("Valid Task Title");

      expect(title.value).toBe("Valid Task Title");
    });

    it("should trim whitespace from title", () => {
      const title = new NonEmptyTitle("  Trimmed Title  ");

      expect(title.value).toBe("Trimmed Title");
    });

    it("should throw InvalidTitleError for empty string", () => {
      expect(() => new NonEmptyTitle("")).toThrow(InvalidTitleError);
    });

    it("should throw InvalidTitleError for whitespace-only string", () => {
      expect(() => new NonEmptyTitle("   ")).toThrow(InvalidTitleError);
      expect(() => new NonEmptyTitle("\t\n  ")).toThrow(InvalidTitleError);
    });

    it("should throw InvalidTitleError for non-string values", () => {
      expect(() => new NonEmptyTitle(null as any)).toThrow(InvalidTitleError);
      expect(() => new NonEmptyTitle(undefined as any)).toThrow(
        InvalidTitleError
      );
      expect(() => new NonEmptyTitle(123 as any)).toThrow(InvalidTitleError);
      expect(() => new NonEmptyTitle({} as any)).toThrow(InvalidTitleError);
    });

    it("should accept single character after trimming", () => {
      const title = new NonEmptyTitle(" a ");

      expect(title.value).toBe("a");
    });
  });

  describe("fromString", () => {
    it("should create NonEmptyTitle from valid string", () => {
      const title = NonEmptyTitle.fromString("Task Title");

      expect(title.value).toBe("Task Title");
    });

    it("should throw for invalid string", () => {
      expect(() => NonEmptyTitle.fromString("")).toThrow(InvalidTitleError);
    });
  });

  describe("length", () => {
    it("should return the length of the title", () => {
      const title = new NonEmptyTitle("Hello World");

      expect(title.length).toBe(11);
    });

    it("should return length after trimming", () => {
      const title = new NonEmptyTitle("  Hello  ");

      expect(title.length).toBe(5);
    });
  });

  describe("contains", () => {
    it("should return true when title contains substring (case-insensitive)", () => {
      const title = new NonEmptyTitle("Complete the Project");

      expect(title.contains("project")).toBe(true);
      expect(title.contains("PROJECT")).toBe(true);
      expect(title.contains("the")).toBe(true);
      expect(title.contains("Complete")).toBe(true);
    });

    it("should return false when title does not contain substring", () => {
      const title = new NonEmptyTitle("Complete the Project");

      expect(title.contains("missing")).toBe(false);
      expect(title.contains("xyz")).toBe(false);
    });

    it("should handle empty substring", () => {
      const title = new NonEmptyTitle("Any Title");

      expect(title.contains("")).toBe(true);
    });
  });

  describe("toUpperCase", () => {
    it("should return title in uppercase", () => {
      const title = new NonEmptyTitle("Hello World");

      expect(title.toUpperCase()).toBe("HELLO WORLD");
    });
  });

  describe("toLowerCase", () => {
    it("should return title in lowercase", () => {
      const title = new NonEmptyTitle("Hello World");

      expect(title.toLowerCase()).toBe("hello world");
    });
  });

  describe("truncate", () => {
    it("should return original title when shorter than max length", () => {
      const title = new NonEmptyTitle("Short");

      expect(title.truncate(10)).toBe("Short");
    });

    it("should truncate and add ellipsis when longer than max length", () => {
      const title = new NonEmptyTitle(
        "This is a very long title that needs truncation"
      );

      expect(title.truncate(20)).toBe("This is a very lo...");
    });

    it("should handle edge case where max length is 3", () => {
      const title = new NonEmptyTitle("Long title");

      expect(title.truncate(3)).toBe("...");
    });

    it("should handle max length equal to title length", () => {
      const title = new NonEmptyTitle("Exact");

      expect(title.truncate(5)).toBe("Exact");
    });
  });

  describe("equals", () => {
    it("should return true for titles with same value", () => {
      const title1 = new NonEmptyTitle("Same Title");
      const title2 = new NonEmptyTitle("Same Title");

      expect(title1.equals(title2)).toBe(true);
    });

    it("should return true for titles with same value after trimming", () => {
      const title1 = new NonEmptyTitle("  Same Title  ");
      const title2 = new NonEmptyTitle("Same Title");

      expect(title1.equals(title2)).toBe(true);
    });

    it("should return false for titles with different values", () => {
      const title1 = new NonEmptyTitle("Title One");
      const title2 = new NonEmptyTitle("Title Two");

      expect(title1.equals(title2)).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return the title string", () => {
      const title = new NonEmptyTitle("Task Title");

      expect(title.toString()).toBe("Task Title");
    });
  });
});
