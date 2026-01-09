/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalLogLevel: string | undefined;

  beforeEach(() => {
    // Save original LOG_LEVEL
    originalLogLevel = process.env.LOG_LEVEL;

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original LOG_LEVEL
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('debug', () => {
    it('should log debug messages when LOG_LEVEL is debug', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('Test debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Test debug message')
      );
    });

    it('should not log debug messages when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;

      logger.debug('Test debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log debug messages when LOG_LEVEL is info', () => {
      process.env.LOG_LEVEL = 'info';

      logger.debug('Test debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should include context in debug messages', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('Test debug', { userId: '123', action: 'test' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/DEBUG: Test debug.*userId.*123/)
      );
    });

    it('should format timestamp in ISO format', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('Test debug');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Test info message')
      );
    });

    it('should include context in info messages', () => {
      logger.info('User action', { userId: '456', action: 'login' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/INFO: User action.*userId.*456/)
      );
    });

    it('should log info regardless of LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'error';

      logger.info('Test info');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('should format timestamp in ISO format', () => {
      logger.info('Test info');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });

  describe('warn', () => {
    it('should log warn messages', () => {
      logger.warn('Test warning');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN: Test warning'));
    });

    it('should include context in warn messages', () => {
      logger.warn('Deprecated API', { api: '/old-endpoint', version: 'v1' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/WARN: Deprecated API.*api.*old-endpoint/)
      );
    });

    it('should use console.warn', () => {
      logger.warn('Test warning');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should format timestamp in ISO format', () => {
      logger.warn('Test warning');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR: Test error'));
    });

    it('should include context in error messages', () => {
      logger.error('Database error', {
        query: 'SELECT * FROM users',
        error: 'Connection timeout',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR: Database error.*query.*SELECT/)
      );
    });

    it('should use console.error', () => {
      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should format timestamp in ISO format', () => {
      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });
  });

  describe('message formatting', () => {
    it('should format messages without context', () => {
      logger.info('Simple message');

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO: Simple message$/);
    });

    it('should format messages with context', () => {
      logger.info('Message with context', { key: 'value' });

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO: Message with context');
      expect(call).toContain('"key":"value"');
    });

    it('should handle empty context object', () => {
      logger.info('Message', {});

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO: Message');
      expect(call).toContain('{}');
    });

    it('should handle nested context objects', () => {
      logger.info('Nested', {
        user: { id: '123', name: 'Alice' },
        metadata: { timestamp: 1234567890 },
      });

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO: Nested');
      expect(call).toContain('"user"');
      expect(call).toContain('"id":"123"');
    });

    it('should handle context with special characters', () => {
      logger.info('Special chars', { message: 'Hello "world"\nNew line\tTab' });

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO: Special chars');
      // JSON.stringify will escape special characters
      expect(call).toMatch(/"message":"Hello \\"world\\"\\nNew line\\tTab"/);
    });

    it('should uppercase log levels', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('INFO:'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('WARN:'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('ERROR:'));
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages', () => {
      logger.info('');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/INFO: $/));
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);

      logger.info(longMessage);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(longMessage));
    });

    it('should handle context with circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // JSON.stringify will throw on circular references
      expect(() => logger.info('Circular', circular)).toThrow();
    });

    it('should handle null context (treated as no context)', () => {
      logger.info('Null context', null as any);

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO: Null context');
      // null is falsy, so it's treated as no context
      expect(call).toMatch(/INFO: Null context$/);
    });

    it('should handle undefined context (same as no context)', () => {
      logger.info('Undefined context', undefined);

      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toMatch(/INFO: Undefined context$/);
      expect(call).not.toContain('undefined');
    });
  });
});
