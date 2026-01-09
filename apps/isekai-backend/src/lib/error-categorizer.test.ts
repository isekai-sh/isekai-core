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

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCategorizer, ErrorCategory, type CategorizedError } from './error-categorizer.js';

describe('ErrorCategorizer', () => {
  describe('determineCategory - by HTTP status code', () => {
    it('should categorize 429 as RATE_LIMIT', () => {
      const error = { status: 429, message: 'Too many requests' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.isRetryable).toBe(true);
      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
    });

    it('should categorize 401 as AUTH_ERROR by default', () => {
      const error = { status: 401, message: 'Unauthorized' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize 401 as TOKEN_EXPIRED when message contains token expired', () => {
      const error = { status: 401, message: 'Access token has expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
      expect(result.retryStrategy.requiresTokenRefresh).toBe(true);
    });

    it('should categorize 401 as TOKEN_EXPIRED when message contains token invalid', () => {
      const error = { status: 401, message: 'Token is invalid' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
    });

    it('should categorize 401 as REFRESH_TOKEN_EXPIRED when refresh token expired', () => {
      const error = { status: 401, message: 'Refresh token has expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
      expect(result.isRetryable).toBe(false);
    });

    it('should categorize 401 as REFRESH_TOKEN_EXPIRED when refresh token invalid', () => {
      const error = { status: 401, message: 'Refresh token is invalid' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should categorize 403 as AUTH_ERROR', () => {
      const error = { status: 403, message: 'Forbidden' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should categorize 400 as VALIDATION_ERROR', () => {
      const error = { status: 400, message: 'Bad request' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
      expect(result.isRetryable).toBe(false);
    });

    it('should categorize 500 as SERVER_ERROR', () => {
      const error = { status: 500, message: 'Internal server error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize 502 as SERVER_ERROR', () => {
      const error = { status: 502 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should categorize 503 as SERVER_ERROR', () => {
      const error = { status: 503 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should categorize 504 as SERVER_ERROR', () => {
      const error = { status: 504 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should use statusCode field if status is not present', () => {
      const error = { statusCode: 429 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });
  });

  describe('determineCategory - by error code', () => {
    it('should categorize REFRESH_TOKEN_EXPIRED code before checking status', () => {
      const error = {
        code: 'REFRESH_TOKEN_EXPIRED',
        status: 401,
        message: 'Token error',
      };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should categorize ETIMEDOUT as NETWORK_ERROR', () => {
      const error = { code: 'ETIMEDOUT', message: 'Request timed out' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ECONNRESET as NETWORK_ERROR', () => {
      const error = { code: 'ECONNRESET' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ECONNREFUSED as NETWORK_ERROR', () => {
      const error = { code: 'ECONNREFUSED' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ENETUNREACH as NETWORK_ERROR', () => {
      const error = { code: 'ENETUNREACH' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });
  });

  describe('determineCategory - by error message patterns', () => {
    it('should detect rate limit from message', () => {
      const error = { message: 'Rate limit exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should detect rate limit from "too many requests" message', () => {
      const error = { message: 'Too many requests, slow down' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should detect quota exceeded', () => {
      const error = { message: 'API quota exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.QUOTA_EXCEEDED);
      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
    });

    it('should detect token expiration from message', () => {
      const error = { message: 'Token expired, please refresh' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
    });

    it('should detect invalid token from message', () => {
      const error = { message: 'Token is invalid' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
    });

    it('should detect timeout from message', () => {
      const error = { message: 'Request timeout after 30s' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect econnreset from lowercase message', () => {
      const error = { message: 'Socket connection econnreset' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect econnrefused from message', () => {
      const error = { message: 'Connection econnrefused to host' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect network error from generic message', () => {
      const error = { message: 'Network error occurred' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect validation error from message', () => {
      const error = { message: 'Validation failed for field' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect validation error from "invalid" message', () => {
      const error = { message: 'Invalid input provided' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect validation error from "required" message', () => {
      const error = { message: 'Field is required' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect auth error from "authentication" message', () => {
      const error = { message: 'Authentication failed' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should detect auth error from "unauthorized" message', () => {
      const error = { message: 'Unauthorized access' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should detect auth error from "forbidden" message', () => {
      const error = { message: 'Access forbidden' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should be case-insensitive for message matching', () => {
      const error = { message: 'RATE LIMIT EXCEEDED' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });
  });

  describe('determineCategory - edge cases', () => {
    it('should return UNKNOWN for error with no recognizable patterns', () => {
      const error = { message: 'Something went wrong' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
    });

    it('should return UNKNOWN for error with only a number status not in ranges', () => {
      const error = { status: 418 }; // I'm a teapot
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
    });

    it('should handle error with no message field', () => {
      const error = { status: 500 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(result.errorContext.message).toBe('Unknown error');
    });
  });

  describe('retry strategies', () => {
    it('should configure RATE_LIMIT with circuit breaker', () => {
      const error = { status: 429 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
      expect(result.retryStrategy.maxAttempts).toBe(7);
      expect(result.retryStrategy.backoffMs).toEqual([
        5000, 10000, 20000, 40000, 80000, 160000, 300000,
      ]);
      expect(result.retryStrategy.shouldRetry).toBe(true);
      expect(result.retryStrategy.requiresTokenRefresh).toBe(false);
    });

    it('should configure AUTH_ERROR with 3 attempts', () => {
      const error = { status: 403 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.maxAttempts).toBe(3);
      expect(result.retryStrategy.backoffMs).toEqual([2000, 5000, 10000]);
      expect(result.retryStrategy.useCircuitBreaker).toBe(false);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should configure TOKEN_EXPIRED with token refresh requirement', () => {
      const error = { status: 401, message: 'Token expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.requiresTokenRefresh).toBe(true);
      expect(result.retryStrategy.maxAttempts).toBe(2);
      expect(result.retryStrategy.backoffMs).toEqual([1000, 3000]);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should configure REFRESH_TOKEN_EXPIRED as non-retryable', () => {
      const error = { code: 'REFRESH_TOKEN_EXPIRED' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.shouldRetry).toBe(false);
      expect(result.retryStrategy.maxAttempts).toBe(0);
      expect(result.retryStrategy.backoffMs).toEqual([]);
      expect(result.isRetryable).toBe(false);
    });

    it('should configure NETWORK_ERROR with 5 attempts', () => {
      const error = { code: 'ETIMEDOUT' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.maxAttempts).toBe(5);
      expect(result.retryStrategy.backoffMs).toEqual([2000, 4000, 8000, 16000, 32000]);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should configure SERVER_ERROR with 5 attempts', () => {
      const error = { status: 500 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.maxAttempts).toBe(5);
      expect(result.retryStrategy.backoffMs).toEqual([3000, 6000, 12000, 24000, 48000]);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should configure QUOTA_EXCEEDED with circuit breaker and long delays', () => {
      const error = { message: 'API quota exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
      expect(result.retryStrategy.maxAttempts).toBe(3);
      expect(result.retryStrategy.backoffMs).toEqual([60000, 120000, 180000]);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should configure VALIDATION_ERROR as non-retryable', () => {
      const error = { status: 400 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.shouldRetry).toBe(false);
      expect(result.retryStrategy.maxAttempts).toBe(0);
      expect(result.retryStrategy.backoffMs).toEqual([]);
      expect(result.isRetryable).toBe(false);
    });

    it('should configure UNKNOWN with conservative retry', () => {
      const error = { message: 'Unknown issue' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy.shouldRetry).toBe(true);
      expect(result.retryStrategy.maxAttempts).toBe(3);
      expect(result.retryStrategy.backoffMs).toEqual([5000, 15000, 30000]);
    });
  });

  describe('shouldRetry', () => {
    it('should allow retry when attempts < maxAttempts', () => {
      const error = { status: 429 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 3)).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 6)).toBe(true);
    });

    it('should not retry when attempts >= maxAttempts', () => {
      const error = { status: 429 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 7)).toBe(false);
      expect(ErrorCategorizer.shouldRetry(categorized, 10)).toBe(false);
    });

    it('should not retry non-retryable errors regardless of attempts', () => {
      const error = { status: 400 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(false);
      expect(ErrorCategorizer.shouldRetry(categorized, 1)).toBe(false);
    });

    it('should not retry REFRESH_TOKEN_EXPIRED', () => {
      const error = { code: 'REFRESH_TOKEN_EXPIRED' };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(false);
    });
  });

  describe('getBackoffDelay', () => {
    it('should return correct delay for attempt number', () => {
      const error = { status: 429 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(5000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 1)).toBe(10000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 2)).toBe(20000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 3)).toBe(40000);
    });

    it('should use last delay when attempts exceed array length', () => {
      const error = { status: 429 };
      const categorized = ErrorCategorizer.categorize(error);
      const delays = categorized.retryStrategy.backoffMs;
      const lastDelay = delays[delays.length - 1];

      expect(ErrorCategorizer.getBackoffDelay(categorized, 100)).toBe(lastDelay);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 7)).toBe(lastDelay);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 10)).toBe(lastDelay);
    });

    it('should fallback to 60000ms if no delays defined and attempt exceeds length', () => {
      const error = { status: 400 }; // VALIDATION_ERROR has empty backoffMs
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(60000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 10)).toBe(60000);
    });

    it('should fallback to 5000ms if attempt is within bounds but no value defined', () => {
      // This tests the || 5000 fallback in the code
      const categorized: CategorizedError = {
        category: ErrorCategory.UNKNOWN,
        isRetryable: true,
        retryStrategy: {
          shouldRetry: true,
          maxAttempts: 3,
          backoffMs: [null as any, null as any, null as any], // Simulate missing values
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        },
        errorContext: {
          category: ErrorCategory.UNKNOWN,
          message: 'Test',
          timestamp: new Date(),
        },
      };

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(5000);
    });
  });

  describe('addJitter', () => {
    it('should add jitter within specified percentage', () => {
      const baseDelay = 10000;
      const jitterPercent = 20;

      // Run multiple times to test randomness
      const results = Array.from({ length: 100 }, () =>
        ErrorCategorizer.addJitter(baseDelay, jitterPercent)
      );

      results.forEach((result) => {
        expect(result).toBeGreaterThanOrEqual(8000); // -20%
        expect(result).toBeLessThanOrEqual(12000); // +20%
      });
    });

    it('should enforce minimum delay of 1000ms', () => {
      const result = ErrorCategorizer.addJitter(500, 50);
      expect(result).toBeGreaterThanOrEqual(1000);
    });

    it('should use default 20% jitter when not specified', () => {
      const baseDelay = 10000;
      const results = Array.from({ length: 100 }, () => ErrorCategorizer.addJitter(baseDelay));

      results.forEach((result) => {
        expect(result).toBeGreaterThanOrEqual(8000);
        expect(result).toBeLessThanOrEqual(12000);
      });
    });

    it('should return an integer', () => {
      const result = ErrorCategorizer.addJitter(10000, 20);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should handle large delays', () => {
      const result = ErrorCategorizer.addJitter(300000, 20); // 5 minutes
      expect(result).toBeGreaterThanOrEqual(240000); // -20%
      expect(result).toBeLessThanOrEqual(360000); // +20%
    });

    it('should handle small delays with minimum enforcement', () => {
      const result = ErrorCategorizer.addJitter(100, 20);
      expect(result).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('formatError', () => {
    it('should format error with all fields', () => {
      const error = {
        status: 429,
        message: 'Rate limit exceeded',
        retryAfter: '120',
      };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toContain('[RATE_LIMIT]');
      expect(formatted).toContain('Rate limit exceeded');
      expect(formatted).toContain('(HTTP 429)');
      expect(formatted).toContain('Retry after: 120');
    });

    it('should format error without status', () => {
      const error = { message: 'Network timeout' };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toContain('[NETWORK_ERROR]');
      expect(formatted).toContain('Network timeout');
      expect(formatted).not.toContain('HTTP');
    });

    it('should format error without retryAfter', () => {
      const error = { status: 500, message: 'Server error' };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toContain('[SERVER_ERROR]');
      expect(formatted).toContain('Server error');
      expect(formatted).toContain('(HTTP 500)');
      expect(formatted).not.toContain('Retry after');
    });

    it('should format error with unknown message', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toContain('Unknown error');
    });

    it('should include category name in brackets', () => {
      const error = { status: 400 };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toMatch(/^\[VALIDATION_ERROR\]/);
    });
  });

  describe('errorContext', () => {
    it('should include error details in context', () => {
      const error = {
        status: 429,
        message: 'Too many requests',
        retryAfter: '60',
        headers: { 'x-custom': 'value' },
        stack: 'Error stack trace',
      };
      const categorized = ErrorCategorizer.categorize(error);

      expect(categorized.errorContext.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(categorized.errorContext.message).toBe('Too many requests');
      expect(categorized.errorContext.status).toBe(429);
      expect(categorized.errorContext.retryAfter).toBe('60');
      expect(categorized.errorContext.headers).toEqual({ 'x-custom': 'value' });
      expect(categorized.errorContext.stack).toBe('Error stack trace');
      expect(categorized.errorContext.timestamp).toBeInstanceOf(Date);
    });

    it('should use "Unknown error" when no message provided', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(categorized.errorContext.message).toBe('Unknown error');
    });

    it('should include timestamp', () => {
      const before = new Date();
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);
      const after = new Date();

      expect(categorized.errorContext.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(categorized.errorContext.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('instance method', () => {
    it('should work with instance method', () => {
      const instance = new ErrorCategorizer();
      const error = { status: 429 };
      const result = instance.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should delegate to static method', () => {
      const instance = new ErrorCategorizer();
      const error = { status: 400 };
      const result = instance.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete error workflow for retryable error', () => {
      const error = { status: 429, message: 'Rate limit exceeded' };
      const categorized = ErrorCategorizer.categorize(error);

      expect(categorized.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(categorized.isRetryable).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(true);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(5000);

      const formatted = ErrorCategorizer.formatError(categorized);
      expect(formatted).toContain('RATE_LIMIT');
    });

    it('should handle complete error workflow for non-retryable error', () => {
      const error = { status: 400, message: 'Invalid input' };
      const categorized = ErrorCategorizer.categorize(error);

      expect(categorized.category).toBe(ErrorCategory.VALIDATION_ERROR);
      expect(categorized.isRetryable).toBe(false);
      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(false);
    });

    it('should handle token refresh workflow', () => {
      const error = { status: 401, message: 'Access token expired' };
      const categorized = ErrorCategorizer.categorize(error);

      expect(categorized.category).toBe(ErrorCategory.TOKEN_EXPIRED);
      expect(categorized.retryStrategy.requiresTokenRefresh).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 2)).toBe(false);
    });
  });
});
