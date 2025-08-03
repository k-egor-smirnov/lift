import { describe, it, expect } from "vitest";
import { ValueObject } from "../value-objects/ValueObject";

// Test implementation of ValueObject
class TestStringValue extends ValueObject<string> {
  protected validate(value: string): void {
    if (!value || value.trim().length === 0) {
      throw new Error("Value cannot be empty");
    }
  }
}

class TestNumberValue extends ValueObject<number> {
  protected validate(value: number): void {
    if (value < 0) {
      throw new Error("Value must be non-negative");
    }
  }
}

describe("ValueObject", () => {
  describe("construction and validation", () => {
    it("should create a valid value object", () => {
      const value = new TestStringValue("test");
      expect(value.value).toBe("test");
    });

    it("should throw error for invalid value", () => {
      expect(() => new TestStringValue("")).toThrow("Value cannot be empty");
      expect(() => new TestNumberValue(-1)).toThrow(
        "Value must be non-negative"
      );
    });
  });

  describe("equality", () => {
    it("should be equal when values are the same", () => {
      const value1 = new TestStringValue("test");
      const value2 = new TestStringValue("test");

      expect(value1.equals(value2)).toBe(true);
    });

    it("should not be equal when values are different", () => {
      const value1 = new TestStringValue("test1");
      const value2 = new TestStringValue("test2");

      expect(value1.equals(value2)).toBe(false);
    });

    it("should not be equal when types are different", () => {
      const stringValue = new TestStringValue("1");
      const numberValue = new TestNumberValue(1);

      expect(stringValue.equals(numberValue as any)).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return string representation of value", () => {
      const stringValue = new TestStringValue("test");
      const numberValue = new TestNumberValue(42);

      expect(stringValue.toString()).toBe("test");
      expect(numberValue.toString()).toBe("42");
    });
  });
});
