import { describe, it, expect } from "vitest";
import { TaskId, InvalidTaskIdError } from "../TaskId";
import { ulid } from "ulid";

describe("TaskId", () => {
  describe("constructor", () => {
    it("should create TaskId with valid ULID", () => {
      const validUlid = ulid();
      const taskId = new TaskId(validUlid);

      expect(taskId.value).toBe(validUlid);
    });

    it("should throw InvalidTaskIdError for empty string", () => {
      expect(() => new TaskId("")).toThrow(InvalidTaskIdError);
    });

    it("should throw InvalidTaskIdError for null/undefined", () => {
      expect(() => new TaskId(null as any)).toThrow(InvalidTaskIdError);
      expect(() => new TaskId(undefined as any)).toThrow(InvalidTaskIdError);
    });

    it("should throw InvalidTaskIdError for invalid ULID format", () => {
      expect(() => new TaskId("invalid-ulid")).toThrow(InvalidTaskIdError);
      expect(() => new TaskId("123")).toThrow(InvalidTaskIdError);
      expect(() => new TaskId("01ARZ3NDEKTSV4RRFFQ69G5FA")).toThrow(
        InvalidTaskIdError
      ); // too short
    });

    it("should throw InvalidTaskIdError for non-string values", () => {
      expect(() => new TaskId(123 as any)).toThrow(InvalidTaskIdError);
      expect(() => new TaskId({} as any)).toThrow(InvalidTaskIdError);
    });
  });

  describe("generate", () => {
    it("should generate valid TaskId", () => {
      const taskId = TaskId.generate();

      expect(taskId).toBeInstanceOf(TaskId);
      expect(taskId.value).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it("should generate unique TaskIds", () => {
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();

      expect(taskId1.value).not.toBe(taskId2.value);
    });
  });

  describe("fromString", () => {
    it("should create TaskId from valid ULID string", () => {
      const validUlid = ulid();
      const taskId = TaskId.fromString(validUlid);

      expect(taskId.value).toBe(validUlid);
    });

    it("should throw for invalid ULID string", () => {
      expect(() => TaskId.fromString("invalid")).toThrow(InvalidTaskIdError);
    });
  });

  describe("getTimestamp", () => {
    it("should extract timestamp from ULID", () => {
      const beforeGeneration = Date.now();
      const taskId = TaskId.generate();
      const afterGeneration = Date.now();

      const timestamp = taskId.getTimestamp();

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeGeneration);
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterGeneration);
    });
  });

  describe("equals", () => {
    it("should return true for TaskIds with same value", () => {
      const ulid1 = ulid();
      const taskId1 = new TaskId(ulid1);
      const taskId2 = new TaskId(ulid1);

      expect(taskId1.equals(taskId2)).toBe(true);
    });

    it("should return false for TaskIds with different values", () => {
      const taskId1 = TaskId.generate();
      const taskId2 = TaskId.generate();

      expect(taskId1.equals(taskId2)).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return the ULID string", () => {
      const validUlid = ulid();
      const taskId = new TaskId(validUlid);

      expect(taskId.toString()).toBe(validUlid);
    });
  });
});
