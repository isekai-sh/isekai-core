/*
 * Copyright (C) 2026 Isekai
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
import {
  getDatabaseConfig,
  getRedisConfig,
  getDeviantArtConfig,
  getS3StorageConfig,
  getSecurityConfig,
  getAppConfig,
  getSessionConfig,
  getCacheConfig,
  getCircuitBreakerConfig,
  getPublisherConfig,
  getRateLimiterConfig,
  getMetricsConfig,
  getHealthCheckConfig,
  getConfig,
} from './config.js';

describe('Configuration Module', () => {
  beforeEach(() => {
    // Set required env vars for tests
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DEVIANTART_CLIENT_ID = 'test_client_id';
    process.env.DEVIANTART_CLIENT_SECRET = 'test_client_secret';
    process.env.DEVIANTART_REDIRECT_URI = 'http://localhost:4000/callback';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY_ID = 'test_access_key';
    process.env.S3_SECRET_ACCESS_KEY = 'test_secret_key';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.S3_PUBLIC_URL = 'http://localhost:9000/test-bucket';
    process.env.SESSION_SECRET = 'test_session_secret';
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  describe('getDatabaseConfig', () => {
    it('should return database configuration', () => {
      const config = getDatabaseConfig();
      expect(config.url).toBe('postgresql://test:test@localhost:5432/test');
      expect(config.poolSize).toBe(10);
    });

    it('should use custom pool size if provided', () => {
      process.env.DB_POOL_SIZE = '5';
      const config = getDatabaseConfig();
      expect(config.poolSize).toBe(5);
    });
  });

  describe('getRedisConfig', () => {
    it('should return redis configuration', () => {
      const config = getRedisConfig();
      expect(config.url).toBe('redis://localhost:6379');
    });
  });

  describe('getDeviantArtConfig', () => {
    it('should return DeviantArt OAuth configuration', () => {
      const config = getDeviantArtConfig();
      expect(config.clientId).toBe('test_client_id');
      expect(config.clientSecret).toBe('test_client_secret');
      expect(config.redirectUri).toBe('http://localhost:4000/callback');
    });
  });

  describe('getS3StorageConfig', () => {
    it('should return storage configuration with defaults', () => {
      delete process.env.S3_FORCE_PATH_STYLE; // Ensure not set
      const config = getS3StorageConfig();
      expect(config.endpoint).toBe('http://localhost:9000');
      expect(config.region).toBe('us-east-1');
      expect(config.accessKeyId).toBe('test_access_key');
      expect(config.secretAccessKey).toBe('test_secret_key');
      expect(config.bucketName).toBe('test-bucket');
      expect(config.publicUrl).toBe('http://localhost:9000/test-bucket');
      expect(config.forcePathStyle).toBe(false);
    });

    it('should handle custom region', () => {
      process.env.S3_REGION = 'us-west-2';
      const config = getS3StorageConfig();
      expect(config.region).toBe('us-west-2');
    });

    it('should handle force path style', () => {
      process.env.S3_FORCE_PATH_STYLE = 'true';
      const config = getS3StorageConfig();
      expect(config.forcePathStyle).toBe(true);
    });

    it('should handle presigned endpoint', () => {
      process.env.S3_PRESIGNED_ENDPOINT = 'http://localhost:9000';
      const config = getS3StorageConfig();
      expect(config.presignedEndpoint).toBe('http://localhost:9000');
    });
  });

  describe('getSecurityConfig', () => {
    it('should return security configuration with defaults', () => {
      const config = getSecurityConfig();
      expect(config.sessionSecret).toBe('test_session_secret');
      expect(config.encryptionKey).toBe('a'.repeat(64));
      expect(config.sessionMaxAgeDays).toBe(7);
      expect(config.refreshTokenExpiryDays).toBe(90);
    });

    it('should handle custom values', () => {
      process.env.SESSION_MAX_AGE_DAYS = '14';
      process.env.REFRESH_TOKEN_EXPIRY_DAYS = '180';
      process.env.COOKIE_DOMAIN = '.example.com';
      const config = getSecurityConfig();
      expect(config.sessionMaxAgeDays).toBe(14);
      expect(config.refreshTokenExpiryDays).toBe(180);
      expect(config.cookieDomain).toBe('.example.com');
    });
  });

  describe('getAppConfig', () => {
    it('should return app configuration with defaults', () => {
      const config = getAppConfig();
      expect(config.nodeEnv).toBe('test');
      expect(config.port).toBe(4000);
      expect(config.frontendUrl).toBe('http://localhost:3000');
    });

    it('should handle custom values', () => {
      process.env.PORT = '5000';
      process.env.FRONTEND_URL = 'http://localhost:8080';
      process.env.NODE_OPTIONS = '--max-old-space-size=512';
      const config = getAppConfig();
      expect(config.port).toBe(5000);
      expect(config.frontendUrl).toBe('http://localhost:8080');
      expect(config.nodeOptions).toBe('--max-old-space-size=512');
    });
  });

  describe('getSessionConfig', () => {
    it('should default to redis', () => {
      const config = getSessionConfig();
      expect(config.store).toBe('redis');
    });

    it('should handle postgres', () => {
      process.env.SESSION_STORE = 'postgres';
      const config = getSessionConfig();
      expect(config.store).toBe('postgres');
    });

    it('should throw on invalid value', () => {
      process.env.SESSION_STORE = 'invalid';
      expect(() => getSessionConfig()).toThrow();
    });
  });

  describe('getCacheConfig', () => {
    it('should return cache configuration with defaults', () => {
      const config = getCacheConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultTtl).toBe(300);
      expect(config.staleTtl).toBe(7200);
    });

    it('should handle custom values', () => {
      process.env.CACHE_ENABLED = 'false';
      process.env.CACHE_DEFAULT_TTL = '600';
      process.env.CACHE_STALE_TTL = '14400';
      const config = getCacheConfig();
      expect(config.enabled).toBe(false);
      expect(config.defaultTtl).toBe(600);
      expect(config.staleTtl).toBe(14400);
    });
  });

  describe('getCircuitBreakerConfig', () => {
    it('should return circuit breaker configuration with defaults', () => {
      const config = getCircuitBreakerConfig();
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(3);
      expect(config.openDurationMs).toBe(300000);
      expect(config.persistToRedis).toBe(true);
    });

    it('should handle custom values', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';
      process.env.CIRCUIT_BREAKER_THRESHOLD = '5';
      process.env.CIRCUIT_BREAKER_OPEN_DURATION_MS = '600000';
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'false';
      const config = getCircuitBreakerConfig();
      expect(config.enabled).toBe(false);
      expect(config.threshold).toBe(5);
      expect(config.openDurationMs).toBe(600000);
      expect(config.persistToRedis).toBe(false);
    });
  });

  describe('getPublisherConfig', () => {
    it('should return publisher configuration with defaults', () => {
      const config = getPublisherConfig();
      expect(config.concurrency).toBe(5);
      expect(config.maxAttempts).toBe(7);
      expect(config.jobTimeoutMs).toBe(600000);
      expect(config.staleCheckIntervalMs).toBe(60000);
      expect(config.maxStalledCount).toBe(2);
    });

    it('should handle custom values', () => {
      process.env.PUBLISHER_CONCURRENCY = '10';
      process.env.PUBLISHER_MAX_ATTEMPTS = '3';
      process.env.PUBLISHER_JOB_TIMEOUT_MS = '1200000';
      const config = getPublisherConfig();
      expect(config.concurrency).toBe(10);
      expect(config.maxAttempts).toBe(3);
      expect(config.jobTimeoutMs).toBe(1200000);
    });
  });

  describe('getRateLimiterConfig', () => {
    it('should return rate limiter configuration with defaults', () => {
      const config = getRateLimiterConfig();
      expect(config.enabled).toBe(true);
      expect(config.baseDelayMs).toBe(3000);
      expect(config.maxDelayMs).toBe(300000);
      expect(config.jitterPercent).toBe(20);
      expect(config.successDecreaseFactor).toBe(0.9);
      expect(config.failureIncreaseFactor).toBe(2.0);
    });

    it('should handle custom values', () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      process.env.RATE_LIMITER_BASE_DELAY_MS = '5000';
      process.env.RATE_LIMITER_MAX_DELAY_MS = '600000';
      process.env.RATE_LIMITER_JITTER_PERCENT = '30';
      process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR = '0.8';
      process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR = '3.0';
      const config = getRateLimiterConfig();
      expect(config.enabled).toBe(false);
      expect(config.baseDelayMs).toBe(5000);
      expect(config.maxDelayMs).toBe(600000);
      expect(config.jitterPercent).toBe(30);
      expect(config.successDecreaseFactor).toBe(0.8);
      expect(config.failureIncreaseFactor).toBe(3.0);
    });
  });

  describe('getMetricsConfig', () => {
    it('should return metrics configuration with defaults', () => {
      const config = getMetricsConfig();
      expect(config.enabled).toBe(true);
      expect(config.flushIntervalMs).toBe(60000);
      expect(config.logLevel).toBe('info');
    });

    it('should handle custom values', () => {
      process.env.METRICS_ENABLED = 'false';
      process.env.METRICS_FLUSH_INTERVAL_MS = '120000';
      process.env.LOG_LEVEL = 'debug';
      const config = getMetricsConfig();
      expect(config.enabled).toBe(false);
      expect(config.flushIntervalMs).toBe(120000);
      expect(config.logLevel).toBe('debug');
    });

    it('should throw on invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(() => getMetricsConfig()).toThrow();
    });
  });

  describe('getHealthCheckConfig', () => {
    it('should return health check configuration with defaults', () => {
      const config = getHealthCheckConfig();
      expect(config.port).toBe(8000);
      expect(config.enabled).toBe(true);
    });

    it('should handle custom values', () => {
      process.env.HEALTH_CHECK_PORT = '9000';
      process.env.HEALTH_CHECK_ENABLED = 'false';
      const config = getHealthCheckConfig();
      expect(config.port).toBe(9000);
      expect(config.enabled).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return complete configuration object', () => {
      // Reset SESSION_STORE to valid value
      process.env.SESSION_STORE = 'redis';
      process.env.LOG_LEVEL = 'info';

      const config = getConfig();
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('deviantart');
      expect(config).toHaveProperty('storage');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('app');
      expect(config).toHaveProperty('session');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('circuitBreaker');
      expect(config).toHaveProperty('publisher');
      expect(config).toHaveProperty('rateLimiter');
      expect(config).toHaveProperty('metrics');
      expect(config).toHaveProperty('healthCheck');
    });
  });
});
