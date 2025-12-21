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

import { describe, it, expect, vi } from 'vitest';
import { ErrorCategorizer, ErrorCategory } from './error-categorizer';

describe('ErrorCategorizer', () => {
  describe('instance categorize method', () => {
    it('should delegate to static method', () => {
      const categorizer = new ErrorCategorizer();
      const error = { status: 429, message: 'Too many requests' };
      const result = categorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });
  });

  describe('categorize - Status Code Detection', () => {
    it('should categorize 429 as RATE_LIMIT', () => {
      const error = { status: 429, message: 'Too many requests' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.isRetryable).toBe(true);
      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
    });

    it('should categorize 401 as TOKEN_EXPIRED when message contains token expired', () => {
      const error = { status: 401, message: 'Access token expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
      expect(result.retryStrategy.requiresTokenRefresh).toBe(true);
    });

    it('should categorize 401 as REFRESH_TOKEN_EXPIRED when message mentions refresh token expired', () => {
      const error = { status: 401, message: 'Refresh token has expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
      expect(result.retryStrategy.shouldRetry).toBe(false);
    });

    it('should categorize 401 as AUTH_ERROR without token mention', () => {
      const error = { status: 401, message: 'Unauthorized access' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
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
      expect(result.retryStrategy.shouldRetry).toBe(false);
    });

    it('should categorize 500 as SERVER_ERROR', () => {
      const error = { status: 500, message: 'Internal server error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(result.retryStrategy.shouldRetry).toBe(true);
    });

    it('should categorize 502 as SERVER_ERROR', () => {
      const error = { status: 502, message: 'Bad gateway' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should categorize 503 as SERVER_ERROR', () => {
      const error = { status: 503, message: 'Service unavailable' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should categorize 504 as SERVER_ERROR', () => {
      const error = { status: 504, message: 'Gateway timeout' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
    });

    it('should handle statusCode property', () => {
      const error = { statusCode: 500, message: 'Server error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(result.errorContext.status).toBe(500);
    });
  });

  describe('categorize - Error Code Detection', () => {
    it('should categorize REFRESH_TOKEN_EXPIRED code', () => {
      const error = { code: 'REFRESH_TOKEN_EXPIRED', message: 'Token expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should categorize ETIMEDOUT as NETWORK_ERROR', () => {
      const error = { code: 'ETIMEDOUT', message: 'Connection timeout' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ECONNRESET as NETWORK_ERROR', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ECONNREFUSED as NETWORK_ERROR', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize ENETUNREACH as NETWORK_ERROR', () => {
      const error = { code: 'ENETUNREACH', message: 'Network unreachable' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });
  });

  describe('categorize - Message Pattern Detection', () => {
    it('should detect rate limit in message', () => {
      const error = { message: 'Rate limit exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should detect too many requests in message', () => {
      const error = { message: 'Too many requests, please slow down' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should detect quota exceeded in message', () => {
      const error = { message: 'API quota exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.QUOTA_EXCEEDED);
      expect(result.retryStrategy.useCircuitBreaker).toBe(true);
    });

    it('should detect refresh token expired in message', () => {
      const error = { message: 'Your refresh token has expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should detect refresh token invalid in message', () => {
      const error = { message: 'Invalid refresh token provided' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should detect token expired in message', () => {
      const error = { message: 'Your token is expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
    });

    it('should detect token invalid in message', () => {
      const error = { message: 'Invalid token supplied' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.TOKEN_EXPIRED);
    });

    it('should detect timeout in message', () => {
      const error = { message: 'Request timeout' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect econnreset in message', () => {
      const error = { message: 'Error: ECONNRESET - connection was forcibly closed' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect econnrefused in message', () => {
      const error = { message: 'ECONNREFUSED: Connection refused by server' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect network in message', () => {
      const error = { message: 'Network error occurred' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should detect validation in message', () => {
      const error = { message: 'Validation failed for input' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect invalid in message', () => {
      const error = { message: 'Invalid parameter supplied' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect required in message', () => {
      const error = { message: 'Required field is missing' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should detect authentication in message', () => {
      const error = { message: 'Authentication failed' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should detect unauthorized in message', () => {
      const error = { message: 'Unauthorized access attempt' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should detect forbidden in message', () => {
      const error = { message: 'Forbidden resource' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.AUTH_ERROR);
    });

    it('should handle case insensitive matching', () => {
      const error = { message: 'RATE LIMIT EXCEEDED' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    });
  });

  describe('categorize - Edge Cases', () => {
    it('should categorize empty error object as UNKNOWN', () => {
      const result = ErrorCategorizer.categorize({});

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
    });

    it('should categorize error without message as UNKNOWN', () => {
      const error = { status: 999 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.errorContext.message).toBe('Unknown error');
    });

    it('should handle error with only a message', () => {
      const error = { message: 'Unexpected error occurred' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.errorContext.message).toBe('Unexpected error occurred');
    });
  });

  describe('categorize - Priority Order', () => {
    it('should prioritize error code over status code', () => {
      const error = { code: 'REFRESH_TOKEN_EXPIRED', status: 500, message: 'Error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });

    it('should prioritize status code over message', () => {
      const error = { status: 400, message: 'timeout error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
    });

    it('should prioritize specific token messages over general patterns', () => {
      const error = { status: 401, message: 'Refresh token expired - validation failed' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.category).toBe(ErrorCategory.REFRESH_TOKEN_EXPIRED);
    });
  });

  describe('Retry Strategies', () => {
    it('should return correct strategy for RATE_LIMIT', () => {
      const error = { status: 429 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 7,
        backoffMs: [5000, 10000, 20000, 40000, 80000, 160000, 300000],
        useCircuitBreaker: true,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for AUTH_ERROR', () => {
      const error = { status: 403 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 3,
        backoffMs: [2000, 5000, 10000],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for TOKEN_EXPIRED', () => {
      const error = { message: 'Token expired' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 2,
        backoffMs: [1000, 3000],
        useCircuitBreaker: false,
        requiresTokenRefresh: true,
      });
    });

    it('should return correct strategy for REFRESH_TOKEN_EXPIRED', () => {
      const error = { code: 'REFRESH_TOKEN_EXPIRED' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: false,
        maxAttempts: 0,
        backoffMs: [],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for NETWORK_ERROR', () => {
      const error = { code: 'ETIMEDOUT' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 5,
        backoffMs: [2000, 4000, 8000, 16000, 32000],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for SERVER_ERROR', () => {
      const error = { status: 500 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 5,
        backoffMs: [3000, 6000, 12000, 24000, 48000],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for QUOTA_EXCEEDED', () => {
      const error = { message: 'Quota exceeded' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 3,
        backoffMs: [60000, 120000, 180000],
        useCircuitBreaker: true,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for VALIDATION_ERROR', () => {
      const error = { status: 400 };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: false,
        maxAttempts: 0,
        backoffMs: [],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });

    it('should return correct strategy for UNKNOWN', () => {
      const error = { message: 'Some random error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.retryStrategy).toEqual({
        shouldRetry: true,
        maxAttempts: 3,
        backoffMs: [5000, 15000, 30000],
        useCircuitBreaker: false,
        requiresTokenRefresh: false,
      });
    });
  });

  describe('Error Context', () => {
    it('should build error context with all fields', () => {
      const error = {
        status: 429,
        message: 'Too many requests',
        retryAfter: '60',
        headers: { 'x-rate-limit': '100' },
        stack: 'Error: Too many requests\n    at ...',
      };

      const result = ErrorCategorizer.categorize(error);

      expect(result.errorContext.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.errorContext.message).toBe('Too many requests');
      expect(result.errorContext.status).toBe(429);
      expect(result.errorContext.retryAfter).toBe('60');
      expect(result.errorContext.headers).toEqual({ 'x-rate-limit': '100' });
      expect(result.errorContext.stack).toContain('Error: Too many requests');
      expect(result.errorContext.timestamp).toBeInstanceOf(Date);
    });

    it('should handle missing optional fields', () => {
      const error = { message: 'Simple error' };
      const result = ErrorCategorizer.categorize(error);

      expect(result.errorContext.message).toBe('Simple error');
      expect(result.errorContext.status).toBeUndefined();
      expect(result.errorContext.retryAfter).toBeUndefined();
      expect(result.errorContext.headers).toBeUndefined();
      expect(result.errorContext.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('shouldRetry', () => {
    it('should return false for non-retryable errors', () => {
      const error = { status: 400 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(false);
      expect(ErrorCategorizer.shouldRetry(categorized, 1)).toBe(false);
    });

    it('should return true when attempt is less than maxAttempts', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 0)).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 1)).toBe(true);
      expect(ErrorCategorizer.shouldRetry(categorized, 4)).toBe(true);
    });

    it('should return false when attempt equals maxAttempts', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 5)).toBe(false);
    });

    it('should return false when attempt exceeds maxAttempts', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.shouldRetry(categorized, 6)).toBe(false);
      expect(ErrorCategorizer.shouldRetry(categorized, 10)).toBe(false);
    });
  });

  describe('getBackoffDelay', () => {
    it('should return correct delay for first attempt', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(3000);
    });

    it('should return correct delay for middle attempts', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 1)).toBe(6000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 2)).toBe(12000);
    });

    it('should return last delay when attempt exceeds backoff array', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 5)).toBe(48000);
      expect(ErrorCategorizer.getBackoffDelay(categorized, 10)).toBe(48000);
    });

    it('should return default 60s when backoff array is empty', () => {
      const error = { status: 400 };
      const categorized = ErrorCategorizer.categorize(error);

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(60000);
    });

    it('should return default 5s when delay is undefined', () => {
      const error = { status: 500 };
      const categorized = ErrorCategorizer.categorize(error);
      // Manually set backoffMs to have undefined at index 0
      categorized.retryStrategy.backoffMs = [undefined as any];

      expect(ErrorCategorizer.getBackoffDelay(categorized, 0)).toBe(5000);
    });
  });

  describe('addJitter', () => {
    it('should return value within jitter range (default 20%)', () => {
      const delayMs = 10000;
      const results = Array.from({ length: 100 }, () => ErrorCategorizer.addJitter(delayMs));

      results.forEach(result => {
        expect(result).toBeGreaterThanOrEqual(8000); // 10000 - 20%
        expect(result).toBeLessThanOrEqual(12000); // 10000 + 20%
      });
    });

    it('should return value within custom jitter range', () => {
      const delayMs = 10000;
      const jitterPercent = 50;
      const results = Array.from({ length: 100 }, () =>
        ErrorCategorizer.addJitter(delayMs, jitterPercent)
      );

      results.forEach(result => {
        expect(result).toBeGreaterThanOrEqual(5000); // 10000 - 50%
        expect(result).toBeLessThanOrEqual(15000); // 10000 + 50%
      });
    });

    it('should never return less than 1000ms', () => {
      const results = Array.from({ length: 100 }, () =>
        ErrorCategorizer.addJitter(100, 90)
      );

      results.forEach(result => {
        expect(result).toBeGreaterThanOrEqual(1000);
      });
    });

    it('should return integer values', () => {
      const results = Array.from({ length: 100 }, () =>
        ErrorCategorizer.addJitter(5555)
      );

      results.forEach(result => {
        expect(Number.isInteger(result)).toBe(true);
      });
    });

    it('should produce different values across calls (randomness)', () => {
      const results = Array.from({ length: 50 }, () =>
        ErrorCategorizer.addJitter(10000)
      );

      const uniqueValues = new Set(results);
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
  });

  describe('formatError', () => {
    it('should format error with all fields', () => {
      const error = {
        status: 429,
        message: 'Too many requests',
        retryAfter: '60',
      };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toBe('[RATE_LIMIT] Too many requests (HTTP 429) - Retry after: 60');
    });

    it('should format error without status', () => {
      const error = { message: 'Network timeout' };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toBe('[NETWORK_ERROR] Network timeout');
    });

    it('should format error without retryAfter', () => {
      const error = { status: 500, message: 'Internal server error' };
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toBe('[SERVER_ERROR] Internal server error (HTTP 500)');
    });

    it('should format minimal error', () => {
      const error = {};
      const categorized = ErrorCategorizer.categorize(error);
      const formatted = ErrorCategorizer.formatError(categorized);

      expect(formatted).toBe('[UNKNOWN] Unknown error');
    });
  });
});
