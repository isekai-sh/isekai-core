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
import { StructuredLogger, LogLevel, createLogger, legacyLog } from './structured-logger';

describe('StructuredLogger', () => {
  let consoleSpy: {
    debug: any;
    log: any;
    warn: any;
    error: any;
  };
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create logger with generated correlation ID', () => {
      const logger = new StructuredLogger();

      expect(logger.getCorrelationId()).toMatch(/^pub-[a-f0-9]{8}$/);
    });

    it('should create logger with provided correlation ID', () => {
      const logger = new StructuredLogger({ correlationId: 'test-123' });

      expect(logger.getCorrelationId()).toBe('test-123');
    });

    it('should create logger with additional context', () => {
      const logger = new StructuredLogger({
        correlationId: 'test-456',
        userId: 'user-123',
        deviationId: 'dev-456',
      });

      const context = logger.getContext();
      expect(context.userId).toBe('user-123');
      expect(context.deviationId).toBe('dev-456');
    });
  });

  describe('createJobLogger', () => {
    it('should create logger from BullMQ job', () => {
      const job: any = {
        id: 'job-123',
        attemptsMade: 2,
        data: {
          deviationId: 'dev-789',
          userId: 'user-456',
        },
      };

      const logger = StructuredLogger.createJobLogger(job);

      expect(logger.getCorrelationId()).toBe('job-job-123');
      const context = logger.getContext();
      expect(context.jobId).toBe('job-123');
      expect(context.deviationId).toBe('dev-789');
      expect(context.userId).toBe('user-456');
      expect(context.attemptNumber).toBe(3);
    });
  });

  describe('child', () => {
    it('should create child logger with inherited and additional context', () => {
      const parent = new StructuredLogger({
        correlationId: 'parent-123',
        userId: 'user-1',
      });

      const child = parent.child({ operation: 'upload' });

      expect(child.getCorrelationId()).toBe('parent-123');
      const context = child.getContext();
      expect(context.userId).toBe('user-1');
      expect(context.operation).toBe('upload');
    });
  });

  describe('Log Level Filtering', () => {
    it('should respect DEBUG log level', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new StructuredLogger();

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should respect INFO log level (default)', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = new StructuredLogger();

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should respect WARN log level', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = new StructuredLogger();

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should respect ERROR log level', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = new StructuredLogger();

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should default to INFO level when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      const logger = new StructuredLogger();

      logger.debug('Debug');
      logger.info('Info');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    it('should log debug message with JSON structure', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new StructuredLogger({ correlationId: 'test-123' });

      logger.debug('Test debug message', { extra: 'data' });

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('"level":"debug"')
      );
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test debug message"')
      );
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('"correlationId":"test-123"')
      );
    });

    it('should log info message', () => {
      const logger = new StructuredLogger();

      logger.info('Test info');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
    });

    it('should log warn message', () => {
      const logger = new StructuredLogger();

      logger.warn('Test warning');

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('"level":"warn"')
      );
    });

    it('should log error message without error object', () => {
      const logger = new StructuredLogger();

      logger.error('Test error');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
    });

    it('should log error message with error object', () => {
      const logger = new StructuredLogger();
      const error = new Error('Something went wrong');

      logger.error('Error occurred', error);

      const loggedData = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.message).toBe('Error occurred');
      expect(parsed.error.message).toBe('Something went wrong');
      expect(parsed.error.stack).toBeDefined();
    });

    it('should include timestamp in log entry', () => {
      const logger = new StructuredLogger();

      logger.info('Test');

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Context Sanitization', () => {
    it('should redact sensitive fields', () => {
      const logger = new StructuredLogger();

      logger.info('Test', {
        password: 'secret123',
        token: 'abc123',
        apiKey: 'key123',
        normalField: 'visible',
      });

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.context.password).toBe('[REDACTED]');
      expect(parsed.context.token).toBe('[REDACTED]');
      expect(parsed.context.apiKey).toBe('[REDACTED]');
      expect(parsed.context.normalField).toBe('visible');
    });

    it('should handle Date objects', () => {
      const logger = new StructuredLogger();
      const date = new Date('2025-01-01T00:00:00Z');

      logger.info('Test', { createdAt: date });

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.context.createdAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle Error objects in context', () => {
      const logger = new StructuredLogger();
      const error = new Error('Test error');

      logger.info('Test', { someError: error });

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.context.someError.message).toBe('Test error');
      expect(parsed.context.someError.stack).toBeDefined();
    });

    it('should truncate large objects', () => {
      const logger = new StructuredLogger();
      const largeObject = { data: 'a'.repeat(2000) };

      logger.info('Test', { largeObject });

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.context.largeObject).toMatch(/\[Object too large: \d+ chars\]/);
    });

    it('should exclude correlationId from context (already in root)', () => {
      const logger = new StructuredLogger({ correlationId: 'test-123' });

      logger.info('Test', { correlationId: 'should-not-appear' });

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.correlationId).toBe('test-123');
      expect(parsed.context?.correlationId).toBeUndefined();
    });
  });

  describe('startTimer', () => {
    it('should measure and log operation duration', async () => {
      const logger = new StructuredLogger();

      const endTimer = logger.startTimer('Test operation');
      await new Promise(resolve => setTimeout(resolve, 15));
      endTimer();

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.message).toBe('Test operation completed');
      // Use >= 5ms to account for timer variance on CI runners
      expect(parsed.context.durationMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe('getContext', () => {
    it('should return copy of context', () => {
      const logger = new StructuredLogger({
        correlationId: 'test-123',
        userId: 'user-1',
      });

      const context1 = logger.getContext();
      const context2 = logger.getContext();

      expect(context1).toEqual(context2);
      expect(context1).not.toBe(context2); // Different object
    });
  });

  describe('createLogger', () => {
    it('should create logger with context', () => {
      const logger = createLogger({ userId: 'user-123' });

      const context = logger.getContext();
      expect(context.userId).toBe('user-123');
      expect(logger.getCorrelationId()).toMatch(/^pub-/);
    });

    it('should create logger without context', () => {
      const logger = createLogger();

      expect(logger.getCorrelationId()).toMatch(/^pub-/);
    });
  });

  describe('legacyLog', () => {
    it('should log with prefix', () => {
      legacyLog('TEST', 'message');

      expect(consoleSpy.log).toHaveBeenCalled();
      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.message).toBe('[TEST] message');
    });

    it('should handle multiple arguments', () => {
      legacyLog('PREFIX', 'arg1', 'arg2', 'arg3');

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.message).toBe('[PREFIX] arg1 arg2 arg3');
    });

    it('should stringify objects', () => {
      legacyLog('TEST', { key: 'value' }, 123);

      const loggedData = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.message).toContain('{"key":"value"}');
      expect(parsed.message).toContain('123');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined context', () => {
      const logger = new StructuredLogger();

      logger.info('Test', undefined);

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should handle null context', () => {
      const logger = new StructuredLogger();

      logger.info('Test', null as any);

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should handle error with code and status', () => {
      const logger = new StructuredLogger();
      const error: any = new Error('API error');
      error.code = 'ECONNREFUSED';
      error.status = 500;

      logger.error('API call failed', error);

      const loggedData = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.error.code).toBe('ECONNREFUSED');
      expect(parsed.error.status).toBe(500);
    });

    it('should handle error without message', () => {
      const logger = new StructuredLogger();

      logger.error('Error occurred', { some: 'error' });

      const loggedData = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(loggedData);

      expect(parsed.error.message).toBe('Unknown error');
    });
  });
});
