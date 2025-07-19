import { describe, it, expect, vi } from 'vitest';
import { DateOnly, InvalidDateOnlyError } from '../DateOnly';

describe('DateOnly', () => {
  describe('constructor', () => {
    it('should create DateOnly with valid date string', () => {
      const dateOnly = new DateOnly('2023-12-25');
      
      expect(dateOnly.value).toBe('2023-12-25');
    });

    it('should throw InvalidDateOnlyError for invalid format', () => {
      expect(() => new DateOnly('2023/12/25')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('25-12-2023')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('2023-12-25T10:00:00')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('invalid-date')).toThrow(InvalidDateOnlyError);
    });

    it('should throw InvalidDateOnlyError for empty/null/undefined', () => {
      expect(() => new DateOnly('')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly(null as any)).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly(undefined as any)).toThrow(InvalidDateOnlyError);
    });

    it('should throw InvalidDateOnlyError for invalid dates', () => {
      expect(() => new DateOnly('2023-02-30')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('2023-13-01')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('2023-00-01')).toThrow(InvalidDateOnlyError);
      expect(() => new DateOnly('2023-01-00')).toThrow(InvalidDateOnlyError);
    });

    it('should accept leap year dates', () => {
      expect(() => new DateOnly('2024-02-29')).not.toThrow();
      expect(() => new DateOnly('2023-02-29')).toThrow(InvalidDateOnlyError);
    });
  });

  describe('today', () => {
    it('should create DateOnly for current date', () => {
      const mockDate = new Date('2023-12-25T15:30:00');
      vi.setSystemTime(mockDate);
      
      const today = DateOnly.today();
      
      expect(today.value).toBe('2023-12-25');
      
      vi.useRealTimers();
    });
  });

  describe('fromDate', () => {
    it('should create DateOnly from Date object', () => {
      const date = new Date('2023-12-25T15:30:00');
      const dateOnly = DateOnly.fromDate(date);
      
      expect(dateOnly.value).toBe('2023-12-25');
    });

    it('should handle different timezones correctly', () => {
      const date = new Date('2023-12-25T23:59:59');
      const dateOnly = DateOnly.fromDate(date);
      
      expect(dateOnly.value).toBe('2023-12-25');
    });
  });

  describe('fromString', () => {
    it('should create DateOnly from valid string', () => {
      const dateOnly = DateOnly.fromString('2023-12-25');
      
      expect(dateOnly.value).toBe('2023-12-25');
    });

    it('should throw for invalid string', () => {
      expect(() => DateOnly.fromString('invalid')).toThrow(InvalidDateOnlyError);
    });
  });

  describe('toDate', () => {
    it('should convert to Date object at midnight UTC', () => {
      const dateOnly = new DateOnly('2023-12-25');
      const date = dateOnly.toDate();
      
      expect(date.getUTCFullYear()).toBe(2023);
      expect(date.getUTCMonth()).toBe(11); // December is month 11
      expect(date.getUTCDate()).toBe(25);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('addDays', () => {
    it('should add days correctly', () => {
      const dateOnly = new DateOnly('2023-12-25');
      const newDate = dateOnly.addDays(7);
      
      expect(newDate.value).toBe('2024-01-01');
    });

    it('should handle month boundaries', () => {
      const dateOnly = new DateOnly('2023-01-31');
      const newDate = dateOnly.addDays(1);
      
      expect(newDate.value).toBe('2023-02-01');
    });

    it('should handle year boundaries', () => {
      const dateOnly = new DateOnly('2023-12-31');
      const newDate = dateOnly.addDays(1);
      
      expect(newDate.value).toBe('2024-01-01');
    });
  });

  describe('subtractDays', () => {
    it('should subtract days correctly', () => {
      const dateOnly = new DateOnly('2024-01-01');
      const newDate = dateOnly.subtractDays(7);
      
      expect(newDate.value).toBe('2023-12-25');
    });
  });

  describe('isBefore', () => {
    it('should return true when date is before another', () => {
      const date1 = new DateOnly('2023-12-24');
      const date2 = new DateOnly('2023-12-25');
      
      expect(date1.isBefore(date2)).toBe(true);
      expect(date2.isBefore(date1)).toBe(false);
    });

    it('should return false for same dates', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-25');
      
      expect(date1.isBefore(date2)).toBe(false);
    });
  });

  describe('isAfter', () => {
    it('should return true when date is after another', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-24');
      
      expect(date1.isAfter(date2)).toBe(true);
      expect(date2.isAfter(date1)).toBe(false);
    });

    it('should return false for same dates', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-25');
      
      expect(date1.isAfter(date2)).toBe(false);
    });
  });

  describe('daysDifference', () => {
    it('should calculate days difference correctly', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-31');
      
      expect(date1.daysDifference(date2)).toBe(6);
      expect(date2.daysDifference(date1)).toBe(6);
    });

    it('should return 0 for same dates', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-25');
      
      expect(date1.daysDifference(date2)).toBe(0);
    });
  });

  describe('equals', () => {
    it('should return true for same date values', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-25');
      
      expect(date1.equals(date2)).toBe(true);
    });

    it('should return false for different date values', () => {
      const date1 = new DateOnly('2023-12-25');
      const date2 = new DateOnly('2023-12-26');
      
      expect(date1.equals(date2)).toBe(false);
    });
  });
});