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

// Mock process.env before importing env module
const originalEnv = process.env;
const originalExit = process.exit;

describe('env validation', () => {
  beforeEach(() => {
    // Reset modules to get fresh import
    vi.resetModules();
    // Mock process.exit to prevent test process from exiting
    process.exit = vi.fn() as any;
    // Spy on console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  const createValidEnv = () => ({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    DEVIANTART_CLIENT_ID: 'test-client-id',
    DEVIANTART_CLIENT_SECRET: 'test-client-secret',
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET_NAME: 'test-bucket',
  });

  describe('Required Fields', () => {
    it('should validate with all required fields', async () => {
      process.env = { ...createValidEnv() };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
      expect(result.REDIS_URL).toBe('redis://localhost:6379');
      expect(result.DEVIANTART_CLIENT_ID).toBe('test-client-id');
      expect(result.DEVIANTART_CLIENT_SECRET).toBe('test-client-secret');
      expect(result.R2_ACCOUNT_ID).toBe('test-account-id');
      expect(result.R2_ACCESS_KEY_ID).toBe('test-access-key');
      expect(result.R2_SECRET_ACCESS_KEY).toBe('test-secret-key');
      expect(result.R2_BUCKET_NAME).toBe('test-bucket');
    });

    it('should fail when DATABASE_URL is missing', async () => {
      const env = createValidEnv();
      delete (env as any).DATABASE_URL;
      process.env = env;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalled();
    });

    it('should fail when DATABASE_URL is empty', async () => {
      process.env = { ...createValidEnv(), DATABASE_URL: '' };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail when REDIS_URL is missing', async () => {
      const env = createValidEnv();
      delete (env as any).REDIS_URL;
      process.env = env;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail when DEVIANTART_CLIENT_ID is missing', async () => {
      const env = createValidEnv();
      delete (env as any).DEVIANTART_CLIENT_ID;
      process.env = env;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should fail when R2 credentials are missing', async () => {
      const env = createValidEnv();
      delete (env as any).R2_ACCOUNT_ID;
      process.env = env;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Default Values', () => {
    it('should apply default values for optional fields', async () => {
      process.env = { ...createValidEnv() };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
      expect(result.HEALTH_CHECK_PORT).toBe(4001);
      expect(result.HEALTH_CHECK_ENABLED).toBe(true);
      expect(result.PUBLISHER_CONCURRENCY).toBe(2);
      expect(result.PUBLISHER_MAX_ATTEMPTS).toBe(7);
      expect(result.PUBLISHER_JOB_TIMEOUT_MS).toBe(1200000);
      expect(result.PUBLISHER_STALE_CHECK_INTERVAL_MS).toBe(60000);
      expect(result.PUBLISHER_MAX_STALLED_COUNT).toBe(2);
      expect(result.PUBLISHER_LIMITER_MAX).toBe(2);
      expect(result.RATE_LIMITER_ENABLED).toBe(true);
      expect(result.RATE_LIMITER_BASE_DELAY_MS).toBe(3000);
      expect(result.RATE_LIMITER_MAX_DELAY_MS).toBe(300000);
      expect(result.RATE_LIMITER_JITTER_PERCENT).toBe(20);
      expect(result.RATE_LIMITER_SUCCESS_DECREASE_FACTOR).toBe(0.9);
      expect(result.RATE_LIMITER_FAILURE_INCREASE_FACTOR).toBe(2.0);
      expect(result.CIRCUIT_BREAKER_ENABLED).toBe(true);
      expect(result.CIRCUIT_BREAKER_THRESHOLD).toBe(3);
      expect(result.CIRCUIT_BREAKER_OPEN_DURATION_MS).toBe(300000);
      expect(result.CIRCUIT_BREAKER_PERSIST_TO_REDIS).toBe(true);
      expect(result.CACHE_ENABLED).toBe(true);
      expect(result.CACHE_DEFAULT_TTL).toBe(300);
      expect(result.CACHE_STALE_TTL).toBe(7200);
      expect(result.METRICS_ENABLED).toBe(true);
      expect(result.METRICS_FLUSH_INTERVAL_MS).toBe(60000);
      expect(result.LOG_LEVEL).toBe('info');
      expect(result.EMAIL_FROM).toBe('noreply@isekai.sh');
      expect(result.FRONTEND_URL).toBe('https://isekai.sh');
    });

    it('should allow overriding default values', async () => {
      process.env = {
        ...createValidEnv(),
        NODE_ENV: 'production',
        HEALTH_CHECK_PORT: '5000',
        PUBLISHER_CONCURRENCY: '5',
        LOG_LEVEL: 'debug',
        EMAIL_FROM: 'custom@example.com',
        FRONTEND_URL: 'https://custom.example.com',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.NODE_ENV).toBe('production');
      expect(result.HEALTH_CHECK_PORT).toBe(5000);
      expect(result.PUBLISHER_CONCURRENCY).toBe(5);
      expect(result.LOG_LEVEL).toBe('debug');
      expect(result.EMAIL_FROM).toBe('custom@example.com');
      expect(result.FRONTEND_URL).toBe('https://custom.example.com');
    });
  });

  describe('Type Coercion', () => {
    it('should coerce string numbers to integers', async () => {
      process.env = {
        ...createValidEnv(),
        HEALTH_CHECK_PORT: '8080',
        PUBLISHER_CONCURRENCY: '10',
        PUBLISHER_MAX_ATTEMPTS: '5',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.HEALTH_CHECK_PORT).toBe(8080);
      expect(result.PUBLISHER_CONCURRENCY).toBe(10);
      expect(result.PUBLISHER_MAX_ATTEMPTS).toBe(5);
      expect(typeof result.HEALTH_CHECK_PORT).toBe('number');
    });

    it('should coerce values to booleans (empty string = false, non-empty = true)', async () => {
      process.env = {
        ...createValidEnv(),
        HEALTH_CHECK_ENABLED: 'true',
        CIRCUIT_BREAKER_ENABLED: '1',
        CACHE_ENABLED: 'yes',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.HEALTH_CHECK_ENABLED).toBe(true);
      expect(result.CIRCUIT_BREAKER_ENABLED).toBe(true);
      expect(result.CACHE_ENABLED).toBe(true);
      expect(typeof result.HEALTH_CHECK_ENABLED).toBe('boolean');
    });

    it('should coerce string floats to numbers', async () => {
      process.env = {
        ...createValidEnv(),
        RATE_LIMITER_SUCCESS_DECREASE_FACTOR: '0.8',
        RATE_LIMITER_FAILURE_INCREASE_FACTOR: '3.5',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.RATE_LIMITER_SUCCESS_DECREASE_FACTOR).toBe(0.8);
      expect(result.RATE_LIMITER_FAILURE_INCREASE_FACTOR).toBe(3.5);
    });
  });

  describe('Enum Validation', () => {
    it('should accept valid NODE_ENV values', async () => {
      const validEnvs = ['development', 'production', 'test'];

      for (const nodeEnv of validEnvs) {
        vi.resetModules();
        process.env = { ...createValidEnv(), NODE_ENV: nodeEnv };
        const { validateEnv } = await import('./env.js');

        const result = validateEnv();
        expect(result.NODE_ENV).toBe(nodeEnv);
      }
    });

    it('should reject invalid NODE_ENV', async () => {
      process.env = { ...createValidEnv(), NODE_ENV: 'invalid' };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should accept valid LOG_LEVEL values', async () => {
      const validLevels = ['debug', 'info', 'warn', 'error'];

      for (const logLevel of validLevels) {
        vi.resetModules();
        process.env = { ...createValidEnv(), LOG_LEVEL: logLevel };
        const { validateEnv } = await import('./env.js');

        const result = validateEnv();
        expect(result.LOG_LEVEL).toBe(logLevel);
      }
    });

    it('should reject invalid LOG_LEVEL', async () => {
      process.env = { ...createValidEnv(), LOG_LEVEL: 'trace' };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Format Validation', () => {
    it('should accept valid email for EMAIL_FROM', async () => {
      process.env = {
        ...createValidEnv(),
        EMAIL_FROM: 'valid@example.com',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.EMAIL_FROM).toBe('valid@example.com');
    });

    it('should reject invalid email for EMAIL_FROM', async () => {
      process.env = {
        ...createValidEnv(),
        EMAIL_FROM: 'not-an-email',
      };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should accept valid URL for FRONTEND_URL', async () => {
      process.env = {
        ...createValidEnv(),
        FRONTEND_URL: 'https://example.com',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.FRONTEND_URL).toBe('https://example.com');
    });

    it('should reject invalid URL for FRONTEND_URL', async () => {
      process.env = {
        ...createValidEnv(),
        FRONTEND_URL: 'not-a-url',
      };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Numeric Constraints', () => {
    it('should accept positive integers', async () => {
      process.env = {
        ...createValidEnv(),
        HEALTH_CHECK_PORT: '9000',
        PUBLISHER_CONCURRENCY: '100',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.HEALTH_CHECK_PORT).toBe(9000);
      expect(result.PUBLISHER_CONCURRENCY).toBe(100);
    });

    it('should reject negative numbers for positive constraints', async () => {
      process.env = {
        ...createValidEnv(),
        HEALTH_CHECK_PORT: '-1',
      };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should reject zero for positive constraints', async () => {
      process.env = {
        ...createValidEnv(),
        PUBLISHER_CONCURRENCY: '0',
      };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should accept valid RATE_LIMITER_JITTER_PERCENT (0-100)', async () => {
      process.env = {
        ...createValidEnv(),
        RATE_LIMITER_JITTER_PERCENT: '50',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.RATE_LIMITER_JITTER_PERCENT).toBe(50);
    });

    it('should reject RATE_LIMITER_JITTER_PERCENT > 100', async () => {
      process.env = {
        ...createValidEnv(),
        RATE_LIMITER_JITTER_PERCENT: '101',
      };
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should accept RATE_LIMITER_JITTER_PERCENT = 0', async () => {
      process.env = {
        ...createValidEnv(),
        RATE_LIMITER_JITTER_PERCENT: '0',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.RATE_LIMITER_JITTER_PERCENT).toBe(0);
    });
  });

  describe('Optional Fields', () => {
    it('should allow RESEND_API_KEY to be undefined', async () => {
      process.env = { ...createValidEnv() };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.RESEND_API_KEY).toBeUndefined();
    });

    it('should accept RESEND_API_KEY when provided', async () => {
      process.env = {
        ...createValidEnv(),
        RESEND_API_KEY: 're_test_key_12345',
      };
      const { validateEnv } = await import('./env.js');

      const result = validateEnv();

      expect(result.RESEND_API_KEY).toBe('re_test_key_12345');
    });
  });

  describe('Error Formatting', () => {
    it('should print formatted error messages on validation failure', async () => {
      process.env = {}; // Missing all required fields
      const { validateEnv } = await import('./env.js');

      validateEnv();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('━'));
      expect(console.error).toHaveBeenCalledWith('Environment Variable Validation Failed');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing or invalid'));
    });

    it('should show field-specific errors', async () => {
      const env = createValidEnv();
      delete (env as any).DATABASE_URL;
      delete (env as any).REDIS_URL;
      process.env = env;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      const errorCalls = (console.error as any).mock.calls.map((call: any) => call[0]);
      const errorOutput = errorCalls.join('\n');

      expect(errorOutput).toContain('DATABASE_URL');
      expect(errorOutput).toContain('REDIS_URL');
    });
  });
});
