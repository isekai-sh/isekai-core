import { describe, it, expect, vi } from 'vitest';
import { safeJsonParse, safeJsonParseWithLog } from './safe-json-parse.js';

describe('safeJsonParse', () => {
  describe('valid JSON', () => {
    it('should parse valid JSON string', () => {
      const result = safeJsonParse('{"name": "test"}', {});
      expect(result).toEqual({ name: 'test' });
    });

    it('should parse JSON arrays', () => {
      const result = safeJsonParse('[1, 2, 3]', []);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse primitive values', () => {
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('42', 0)).toBe(42);
      expect(safeJsonParse('"hello"', '')).toBe('hello');
    });

    it('should preserve type with generics', () => {
      interface User {
        name: string;
        age: number;
      }
      const result = safeJsonParse<User>('{"name": "Alice", "age": 30}', { name: '', age: 0 });
      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);
    });
  });

  describe('invalid JSON', () => {
    it('should return fallback for invalid JSON', () => {
      const fallback = { error: true };
      const result = safeJsonParse('{ invalid json }', fallback);
      expect(result).toEqual(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { default: 'value' };
      const result = safeJsonParse('', fallback);
      expect(result).toEqual(fallback);
    });

    it('should return fallback for malformed JSON', () => {
      const result = safeJsonParse('{"incomplete":', null);
      expect(result).toBe(null);
    });

    it('should not throw errors', () => {
      expect(() => safeJsonParse('garbage', {})).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle null fallback', () => {
      const result = safeJsonParse('invalid', null);
      expect(result).toBe(null);
    });

    it('should handle undefined fallback', () => {
      const result = safeJsonParse('invalid', undefined);
      expect(result).toBe(undefined);
    });

    it('should handle nested objects', () => {
      const json = '{"user": {"profile": {"name": "test"}}}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ user: { profile: { name: 'test' } } });
    });
  });
});

describe('safeJsonParseWithLog', () => {
  it('should parse valid JSON without logging', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = safeJsonParseWithLog('{"test": true}', {});

    expect(result).toEqual({ test: true });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should log error and return fallback for invalid JSON', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fallback = { failed: true };
    const result = safeJsonParseWithLog('invalid json', fallback, 'Test Context');

    expect(result).toEqual(fallback);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[JSON Parse Error] Test Context'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should use default context when not provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    safeJsonParseWithLog('bad', null);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown context'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should handle empty context string', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    safeJsonParseWithLog('invalid', {}, '');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[JSON Parse Error] '),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
