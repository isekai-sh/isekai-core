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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

// Valid base environment for testing
const validEnv = {
  DATABASE_URL: 'postgresql://localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  DEVIANTART_CLIENT_ID: 'test_client_id',
  DEVIANTART_CLIENT_SECRET: 'test_client_secret',
  DEVIANTART_REDIRECT_URI: 'https://example.com/callback',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test_key',
  S3_SECRET_ACCESS_KEY: 'test_secret',
  S3_BUCKET_NAME: 'test_bucket',
  S3_PUBLIC_URL: 'http://localhost:9000/test_bucket',
  S3_FORCE_PATH_STYLE: 'true',
  SESSION_SECRET: 'test_session_secret',
  FRONTEND_URL: 'https://example.com',
};

describe('validateEnv', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.exit to prevent actual exit
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Set valid environment
    process.env = { ...validEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore console and process
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clear module cache to allow re-importing
    vi.resetModules();
  });

  describe('required fields', () => {
    it('should validate when all required fields are present', async () => {
      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.DATABASE_URL).toBe('postgresql://localhost:5432/test');
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should fail when DATABASE_URL is missing', async () => {
      delete process.env.DATABASE_URL;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should fail when REDIS_URL is missing', async () => {
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should fail when DEVIANTART_CLIENT_ID is missing', async () => {
      delete process.env.DEVIANTART_CLIENT_ID;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should fail when SESSION_SECRET is missing', async () => {
      delete process.env.SESSION_SECRET;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('URL validation', () => {
    it('should accept valid DEVIANTART_REDIRECT_URI', async () => {
      process.env.DEVIANTART_REDIRECT_URI = 'https://example.com/callback';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.DEVIANTART_REDIRECT_URI).toBe('https://example.com/callback');
    });

    it('should reject invalid DEVIANTART_REDIRECT_URI', async () => {
      process.env.DEVIANTART_REDIRECT_URI = 'not-a-url';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should accept valid S3_PUBLIC_URL', async () => {
      process.env.S3_PUBLIC_URL = 'https://cdn.example.com';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.S3_PUBLIC_URL).toBe('https://cdn.example.com');
    });

    it('should reject invalid S3_PUBLIC_URL', async () => {
      process.env.S3_PUBLIC_URL = 'invalid-url';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should accept valid FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'https://app.example.com';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.FRONTEND_URL).toBe('https://app.example.com');
    });

    it('should reject invalid FRONTEND_URL', async () => {
      process.env.FRONTEND_URL = 'not-a-url';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('number coercion', () => {
    it('should coerce PORT from string to number', async () => {
      process.env.PORT = '3000';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.PORT).toBe(3000);
      expect(typeof result.PORT).toBe('number');
    });

    it('should use default PORT if not provided', async () => {
      delete process.env.PORT;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.PORT).toBe(4000);
    });

    it('should coerce SESSION_MAX_AGE_DAYS from string to number', async () => {
      process.env.SESSION_MAX_AGE_DAYS = '30';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.SESSION_MAX_AGE_DAYS).toBe(30);
    });

    it('should use default SESSION_MAX_AGE_DAYS if not provided', async () => {
      delete process.env.SESSION_MAX_AGE_DAYS;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.SESSION_MAX_AGE_DAYS).toBe(7);
    });

    it('should reject negative PORT', async () => {
      process.env.PORT = '-100';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should reject non-integer PORT', async () => {
      process.env.PORT = '3.14';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('boolean coercion', () => {
    it('should coerce CACHE_ENABLED from string "true" to boolean', async () => {
      process.env.CACHE_ENABLED = 'true';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.CACHE_ENABLED).toBe(true);
      expect(typeof result.CACHE_ENABLED).toBe('boolean');
    });

    it('should coerce CACHE_ENABLED from empty string to false', async () => {
      process.env.CACHE_ENABLED = '';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.CACHE_ENABLED).toBe(false);
    });

    it('should use default CACHE_ENABLED if not provided', async () => {
      delete process.env.CACHE_ENABLED;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.CACHE_ENABLED).toBe(true);
    });

    it('should coerce CIRCUIT_BREAKER_ENABLED from empty string to false', async () => {
      process.env.CIRCUIT_BREAKER_ENABLED = '';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.CIRCUIT_BREAKER_ENABLED).toBe(false);
    });
  });

  describe('enum validation', () => {
    it('should accept valid NODE_ENV values', async () => {
      const validValues = ['development', 'production', 'test'];

      for (const value of validValues) {
        vi.resetModules();
        process.env = { ...validEnv, NODE_ENV: value };

        const { validateEnv } = await import('./env.js');
        const result = validateEnv();

        expect(result.NODE_ENV).toBe(value);
      }
    });

    it('should use default NODE_ENV if not provided', async () => {
      delete process.env.NODE_ENV;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
    });

    it('should reject invalid NODE_ENV', async () => {
      process.env.NODE_ENV = 'invalid';

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should accept valid LOG_LEVEL values', async () => {
      const validValues = ['debug', 'info', 'warn', 'error'];

      for (const value of validValues) {
        vi.resetModules();
        process.env = { ...validEnv, LOG_LEVEL: value };

        const { validateEnv } = await import('./env.js');
        const result = validateEnv();

        expect(result.LOG_LEVEL).toBe(value);
      }
    });

    it('should use default LOG_LEVEL if not provided', async () => {
      delete process.env.LOG_LEVEL;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.LOG_LEVEL).toBe('info');
    });
  });

  describe('optional fields', () => {
    it('should allow COOKIE_DOMAIN to be undefined', async () => {
      delete process.env.COOKIE_DOMAIN;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.COOKIE_DOMAIN).toBeUndefined();
    });

    it('should accept COOKIE_DOMAIN when provided', async () => {
      process.env.COOKIE_DOMAIN = '.example.com';

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.COOKIE_DOMAIN).toBe('.example.com');
    });

    it('should allow SESSION_STORE to be undefined', async () => {
      delete process.env.SESSION_STORE;

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.SESSION_STORE).toBeUndefined();
    });

    it('should accept valid SESSION_STORE values', async () => {
      process.env.SESSION_STORE = 'redis';

      const { validateEnv } = await import('./env.js');
      let result = validateEnv();

      expect(result.SESSION_STORE).toBe('redis');

      vi.resetModules();
      process.env = { ...validEnv, SESSION_STORE: 'postgres' };

      const { validateEnv: validateEnv2 } = await import('./env.js');
      result = validateEnv2();

      expect(result.SESSION_STORE).toBe('postgres');
    });

    it('should validate ENCRYPTION_KEY length when provided', async () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.ENCRYPTION_KEY).toBe('a'.repeat(64));
    });

    it('should reject ENCRYPTION_KEY with wrong length', async () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(32); // Wrong length

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('default values', () => {
    it('should use all defaults when optional fields are not provided', async () => {
      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.PORT).toBe(4000);
      expect(result.NODE_ENV).toBe('development');
      expect(result.SESSION_MAX_AGE_DAYS).toBe(7);
      expect(result.REFRESH_TOKEN_EXPIRY_DAYS).toBe(90);
      expect(result.CACHE_ENABLED).toBe(true);
      expect(result.CACHE_DEFAULT_TTL).toBe(300);
      expect(result.CACHE_STALE_TTL).toBe(7200);
      expect(result.CIRCUIT_BREAKER_ENABLED).toBe(true);
      expect(result.CIRCUIT_BREAKER_THRESHOLD).toBe(3);
      expect(result.RATE_LIMITER_ENABLED).toBe(true);
      expect(result.METRICS_ENABLED).toBe(true);
      expect(result.LOG_LEVEL).toBe('info');
    });
  });

  describe('error reporting', () => {
    it('should log validation errors to console', async () => {
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment Variable Validation Failed')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should display field-specific errors', async () => {
      delete process.env.DATABASE_URL;

      const { validateEnv } = await import('./env.js');
      validateEnv();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL')
      );
    });
  });

  describe('complex scenarios', () => {
    it('should handle all configuration options at once', async () => {
      process.env = {
        ...validEnv,
        PORT: '8080',
        NODE_ENV: 'production',
        SESSION_MAX_AGE_DAYS: '30',
        LOG_LEVEL: 'debug',
        COOKIE_DOMAIN: '.example.com',
        SESSION_STORE: 'redis',
        ENCRYPTION_KEY: 'a'.repeat(64),
      };

      const { validateEnv } = await import('./env.js');
      const result = validateEnv();

      expect(result.PORT).toBe(8080);
      expect(result.NODE_ENV).toBe('production');
      expect(result.SESSION_MAX_AGE_DAYS).toBe(30);
      expect(result.LOG_LEVEL).toBe('debug');
      expect(result.COOKIE_DOMAIN).toBe('.example.com');
      expect(result.SESSION_STORE).toBe('redis');
      expect(result.ENCRYPTION_KEY).toBe('a'.repeat(64));
    });
  });
});
