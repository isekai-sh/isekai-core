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

/**
 * Error Categorization System
 *
 * Intelligently categorizes errors and determines retry strategies.
 * This enables smart error handling with appropriate retry behavior for each error type.
 */

export enum ErrorCategory {
  RATE_LIMIT = 'RATE_LIMIT', // 429 - Use circuit breaker + adaptive backoff
  AUTH_ERROR = 'AUTH_ERROR', // 401, 403 - Refresh token, then retry
  NETWORK_ERROR = 'NETWORK_ERROR', // Timeout, connection errors
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 400 - No retry, move to DLQ
  SERVER_ERROR = 'SERVER_ERROR', // 500-504 - Retry with backoff
  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // Token refresh needed
  REFRESH_TOKEN_EXPIRED = 'REFRESH_TOKEN_EXPIRED', // Refresh token expired - user must re-auth
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED', // API quota exhausted
  UNKNOWN = 'UNKNOWN', // Unknown error - conservative retry
}

export interface RetryStrategy {
  shouldRetry: boolean;
  maxAttempts: number;
  backoffMs: number[];
  useCircuitBreaker: boolean;
  requiresTokenRefresh: boolean;
}

export interface ErrorContext {
  category: ErrorCategory;
  message: string;
  status?: number;
  retryAfter?: string;
  headers?: Record<string, string>;
  stack?: string;
  timestamp: Date;
}

export interface CategorizedError {
  category: ErrorCategory;
  isRetryable: boolean;
  retryStrategy: RetryStrategy;
  errorContext: ErrorContext;
}

/**
 * Error Categorizer
 *
 * Analyzes errors and provides intelligent retry strategies
 */
export class ErrorCategorizer {
  /**
   * Instance method for categorizing errors
   * Delegates to static method for backward compatibility
   */
  categorize(error: any): CategorizedError {
    return ErrorCategorizer.categorize(error);
  }

  /**
   * Categorize an error and determine retry strategy
   */
  static categorize(error: any): CategorizedError {
    const category = this.determineCategory(error);
    const retryStrategy = this.getRetryStrategy(category);
    const errorContext = this.buildErrorContext(error, category);

    return {
      category,
      isRetryable: retryStrategy.shouldRetry,
      retryStrategy,
      errorContext,
    };
  }

  /**
   * Determine error category from error details
   */
  private static determineCategory(error: any): ErrorCategory {
    if (!error) return ErrorCategory.UNKNOWN;

    // Check for refresh token expiry FIRST (before status codes)
    if (error.code === 'REFRESH_TOKEN_EXPIRED') {
      return ErrorCategory.REFRESH_TOKEN_EXPIRED;
    }

    // Check status code first
    const status = error.status || error.statusCode;

    if (status === 429) {
      return ErrorCategory.RATE_LIMIT;
    }

    if (status === 401) {
      // Check if refresh token expired specifically
      const message = error.message?.toLowerCase() || '';
      if (
        message.includes('refresh token') &&
        (message.includes('expired') || message.includes('invalid'))
      ) {
        return ErrorCategory.REFRESH_TOKEN_EXPIRED;
      }
      // Check if access token expired
      if (
        message.includes('token') &&
        (message.includes('expired') || message.includes('invalid'))
      ) {
        return ErrorCategory.TOKEN_EXPIRED;
      }
      return ErrorCategory.AUTH_ERROR;
    }

    if (status === 403) {
      return ErrorCategory.AUTH_ERROR;
    }

    if (status === 400) {
      return ErrorCategory.VALIDATION_ERROR;
    }

    if (status >= 500 && status <= 504) {
      return ErrorCategory.SERVER_ERROR;
    }

    // Check error message patterns
    const message = error.message?.toLowerCase() || '';

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }

    if (message.includes('quota') && message.includes('exceeded')) {
      return ErrorCategory.QUOTA_EXCEEDED;
    }

    if (message.includes('token') && (message.includes('expired') || message.includes('invalid'))) {
      return ErrorCategory.TOKEN_EXPIRED;
    }

    // Network errors
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('network') ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENETUNREACH'
    ) {
      return ErrorCategory.NETWORK_ERROR;
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return ErrorCategory.VALIDATION_ERROR;
    }

    // Authentication errors
    if (
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return ErrorCategory.AUTH_ERROR;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Get retry strategy for a given error category
   */
  private static getRetryStrategy(category: ErrorCategory): RetryStrategy {
    switch (category) {
      case ErrorCategory.RATE_LIMIT:
        return {
          shouldRetry: true,
          maxAttempts: 7,
          backoffMs: [5000, 10000, 20000, 40000, 80000, 160000, 300000], // Up to 5 minutes
          useCircuitBreaker: true,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.AUTH_ERROR:
        return {
          shouldRetry: true,
          maxAttempts: 3,
          backoffMs: [2000, 5000, 10000],
          useCircuitBreaker: false,
          requiresTokenRefresh: false, // Will be handled by refresh logic
        };

      case ErrorCategory.TOKEN_EXPIRED:
        return {
          shouldRetry: true,
          maxAttempts: 2,
          backoffMs: [1000, 3000],
          useCircuitBreaker: false,
          requiresTokenRefresh: true,
        };

      case ErrorCategory.REFRESH_TOKEN_EXPIRED:
        return {
          shouldRetry: false, // User must re-authenticate
          maxAttempts: 0,
          backoffMs: [],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.NETWORK_ERROR:
        return {
          shouldRetry: true,
          maxAttempts: 5,
          backoffMs: [2000, 4000, 8000, 16000, 32000],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.SERVER_ERROR:
        return {
          shouldRetry: true,
          maxAttempts: 5,
          backoffMs: [3000, 6000, 12000, 24000, 48000],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.QUOTA_EXCEEDED:
        return {
          shouldRetry: true,
          maxAttempts: 3,
          backoffMs: [60000, 120000, 180000], // 1, 2, 3 minutes
          useCircuitBreaker: true,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.VALIDATION_ERROR:
        return {
          shouldRetry: false,
          maxAttempts: 0,
          backoffMs: [],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };

      case ErrorCategory.UNKNOWN:
        return {
          shouldRetry: true,
          maxAttempts: 3,
          backoffMs: [5000, 15000, 30000],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };

      default:
        return {
          shouldRetry: false,
          maxAttempts: 0,
          backoffMs: [],
          useCircuitBreaker: false,
          requiresTokenRefresh: false,
        };
    }
  }

  /**
   * Build error context for logging and debugging
   */
  private static buildErrorContext(error: any, category: ErrorCategory): ErrorContext {
    return {
      category,
      message: error.message || 'Unknown error',
      status: error.status || error.statusCode,
      retryAfter: error.retryAfter,
      headers: error.headers,
      stack: error.stack,
      timestamp: new Date(),
    };
  }

  /**
   * Check if error should be retried based on attempt number
   */
  static shouldRetry(categorized: CategorizedError, attemptNumber: number): boolean {
    if (!categorized.isRetryable) {
      return false;
    }

    return attemptNumber < categorized.retryStrategy.maxAttempts;
  }

  /**
   * Get backoff delay for a specific attempt
   */
  static getBackoffDelay(categorized: CategorizedError, attemptNumber: number): number {
    const { backoffMs } = categorized.retryStrategy;

    if (attemptNumber >= backoffMs.length) {
      // Use last delay if we've exceeded defined backoffs
      return backoffMs[backoffMs.length - 1] || 60000;
    }

    return backoffMs[attemptNumber] || 5000;
  }

  /**
   * Add jitter to a delay to prevent thundering herd
   *
   * @param delayMs - Base delay in milliseconds
   * @param jitterPercent - Jitter as percentage (default 20%)
   */
  static addJitter(delayMs: number, jitterPercent: number = 20): number {
    const jitter = delayMs * (jitterPercent / 100) * (Math.random() * 2 - 1);
    return Math.max(1000, Math.round(delayMs + jitter));
  }

  /**
   * Format error for logging
   */
  static formatError(categorized: CategorizedError): string {
    const { category, errorContext } = categorized;
    const parts = [`[${category}]`, errorContext.message];

    if (errorContext.status) {
      parts.push(`(HTTP ${errorContext.status})`);
    }

    if (errorContext.retryAfter) {
      parts.push(`- Retry after: ${errorContext.retryAfter}`);
    }

    return parts.join(' ');
  }
}
