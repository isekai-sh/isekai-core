/**
 * Structured Logger with Correlation IDs
 *
 * Provides structured JSON logging with correlation IDs for request tracing
 * across distributed workers and async operations.
 */

import type { Job } from 'bullmq';
import { randomUUID } from 'crypto';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogContext {
  correlationId: string;
  jobId?: string;
  deviationId?: string;
  userId?: string;
  attemptNumber?: number;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId: string;
  context?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Structured Logger
 *
 * Provides JSON-structured logging with automatic correlation ID tracking
 */
export class StructuredLogger {
  private context: LogContext;
  private minLevel: LogLevel;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      correlationId: context.correlationId || this.generateCorrelationId(),
      ...context,
    };
    this.minLevel = this.getMinLogLevel();
  }

  /**
   * Create a logger for a BullMQ job
   */
  static createJobLogger(job: Job): StructuredLogger {
    return new StructuredLogger({
      correlationId: `job-${job.id}`,
      jobId: job.id,
      deviationId: job.data.deviationId,
      userId: job.data.userId,
      attemptNumber: job.attemptsMade + 1,
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Record<string, any>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message with optional error object
   */
  error(message: string, error?: any, context?: Record<string, any>): void {
    const errorContext = error
      ? {
          ...context,
          error: {
            message: error.message || 'Unknown error',
            stack: error.stack,
            code: error.code,
            status: error.status || error.statusCode,
          },
        }
      : context;

    this.log(LogLevel.ERROR, message, errorContext);
  }

  /**
   * Start a timer for an operation
   * Returns a function that logs the elapsed time when called
   */
  startTimer(operation: string): () => void {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      this.info(`${operation} completed`, { durationMs: duration });
    };
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.context.correlationId,
    };

    // Merge context with logger context
    const mergedContext = {
      ...this.getSafeContext(this.context),
      ...(context ? this.getSafeContext(context) : {}),
    };

    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext;
    }

    // Extract error if present in context
    if (context?.error) {
      entry.error = context.error;
      delete mergedContext.error;
    }

    // Output to console as JSON
    const logLine = JSON.stringify(entry);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logLine);
        break;
      case LogLevel.INFO:
        console.log(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.ERROR:
        console.error(logLine);
        break;
    }
  }

  /**
   * Check if a log level should be logged based on minimum level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(level);
    const minIndex = levels.indexOf(this.minLevel);

    return currentIndex >= minIndex;
  }

  /**
   * Get sanitized context (remove sensitive data, correlationId already in root)
   */
  private getSafeContext(context: Record<string, any>): Record<string, any> {
    const safe: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip correlationId as it's already in root
      if (key === 'correlationId') {
        continue;
      }

      // Redact sensitive fields
      if (this.isSensitiveField(key)) {
        safe[key] = '[REDACTED]';
        continue;
      }

      // Handle special types
      if (value instanceof Date) {
        safe[key] = value.toISOString();
      } else if (value instanceof Error) {
        safe[key] = {
          message: value.message,
          stack: value.stack,
        };
      } else if (typeof value === 'object' && value !== null) {
        // Shallow copy objects, don't deep traverse
        safe[key] = this.truncateIfNeeded(value);
      } else {
        safe[key] = value;
      }
    }

    return safe;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitive = [
      'password',
      'token',
      'accesstoken',
      'refreshtoken',
      'secret',
      'apikey',
      'authorization',
      'cookie',
      'session',
    ];

    return sensitive.some((s) => fieldName.toLowerCase().includes(s));
  }

  /**
   * Truncate large objects to prevent excessive log size
   */
  private truncateIfNeeded(value: any): any {
    const json = JSON.stringify(value);
    if (json.length > 1000) {
      return `[Object too large: ${json.length} chars]`;
    }
    return value;
  }

  /**
   * Generate a correlation ID
   */
  private generateCorrelationId(): string {
    return `pub-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Get minimum log level from environment
   */
  private getMinLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();

    switch (envLevel) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Get correlation ID for external use
   */
  getCorrelationId(): string {
    return this.context.correlationId;
  }

  /**
   * Get full context
   */
  getContext(): LogContext {
    return { ...this.context };
  }
}

/**
 * Create a global logger for non-job contexts
 */
export function createLogger(context?: Partial<LogContext>): StructuredLogger {
  return new StructuredLogger(context);
}

/**
 * Legacy console.log wrapper for gradual migration
 * Formats old-style logs with a prefix
 */
export function legacyLog(prefix: string, ...args: any[]): void {
  const logger = new StructuredLogger();
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');

  logger.info(`[${prefix}] ${message}`);
}
