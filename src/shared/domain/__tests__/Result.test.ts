import { describe, it, expect } from 'vitest';
import { ResultUtils } from '../Result';

describe('Result', () => {
  describe('factory methods', () => {
    it('should create successful result', () => {
      const result = ResultUtils.ok('success');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
    });

    it('should create failure result', () => {
      const error = new Error('failure');
      const result = ResultUtils.error(error);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('type guards', () => {
    it('should identify successful results', () => {
      const success = ResultUtils.ok('data');
      const failure = ResultUtils.error('error');
      
      expect(ResultUtils.isSuccess(success)).toBe(true);
      expect(ResultUtils.isSuccess(failure)).toBe(false);
    });

    it('should identify failure results', () => {
      const success = ResultUtils.ok('data');
      const failure = ResultUtils.error('error');
      
      expect(ResultUtils.isFailure(success)).toBe(false);
      expect(ResultUtils.isFailure(failure)).toBe(true);
    });
  });

  describe('map operations', () => {
    it('should map successful values', () => {
      const result = ResultUtils.ok(5);
      const mapped = ResultUtils.map(result, x => x * 2);
      
      expect(ResultUtils.isSuccess(mapped)).toBe(true);
      if (ResultUtils.isSuccess(mapped)) {
        expect(mapped.data).toBe(10);
      }
    });

    it('should not map failure values', () => {
      const result = ResultUtils.error('error');
      const mapped = ResultUtils.map(result, (x: number) => x * 2);
      
      expect(ResultUtils.isFailure(mapped)).toBe(true);
      if (ResultUtils.isFailure(mapped)) {
        expect(mapped.error).toBe('error');
      }
    });

    it('should map error values', () => {
      const result = ResultUtils.error('original error');
      const mapped = ResultUtils.mapError(result, err => `mapped: ${err}`);
      
      expect(ResultUtils.isFailure(mapped)).toBe(true);
      if (ResultUtils.isFailure(mapped)) {
        expect(mapped.error).toBe('mapped: original error');
      }
    });
  });

  describe('flatMap', () => {
    it('should chain successful operations', () => {
      const result = ResultUtils.ok(5);
      const chained = ResultUtils.flatMap(result, x => ResultUtils.ok(x * 2));
      
      expect(ResultUtils.isSuccess(chained)).toBe(true);
      if (ResultUtils.isSuccess(chained)) {
        expect(chained.data).toBe(10);
      }
    });

    it('should not chain on failure', () => {
      const result = ResultUtils.error('error');
      const chained = ResultUtils.flatMap(result, (x: number) => ResultUtils.ok(x * 2));
      
      expect(ResultUtils.isFailure(chained)).toBe(true);
      if (ResultUtils.isFailure(chained)) {
        expect(chained.error).toBe('error');
      }
    });
  });

  describe('unwrap operations', () => {
    it('should unwrap successful values', () => {
      const result = ResultUtils.ok('success');
      const value = ResultUtils.unwrap(result);
      
      expect(value).toBe('success');
    });

    it('should throw on unwrap failure', () => {
      const error = new Error('failure');
      const result = ResultUtils.error(error);
      
      expect(() => ResultUtils.unwrap(result)).toThrow(error);
    });

    it('should return value or default', () => {
      const success = ResultUtils.ok('success');
      const failure = ResultUtils.error('error');
      
      expect(ResultUtils.unwrapOr(success, 'default')).toBe('success');
      expect(ResultUtils.unwrapOr(failure, 'default')).toBe('default');
    });
  });
});