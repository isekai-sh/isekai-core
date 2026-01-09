/**
 * Shared Configuration Module
 *
 * Single source of truth for all environment variables across backend, frontend, and publisher.
 * Loads from root .env in development, reads from process.env in production.
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load root .env file in development (monorepo root is 3 levels up)
if (process.env.NODE_ENV !== 'production') {
  const envPath = resolve(__dirname, '../../../.env');
  dotenvConfig({ path: envPath });
}

/**
 * Get environment variable or throw if missing (for required vars)
 */
function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get environment variable with default value (for optional vars)
 */
function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get number environment variable with default
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Get boolean environment variable with default
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Database Configuration
 */
export interface DatabaseConfig {
  url: string;
  poolSize: number;
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    url: getEnv('DATABASE_URL'),
    poolSize: getEnvNumber('DB_POOL_SIZE', 10),
  };
}

/**
 * Redis Configuration
 */
export interface RedisConfig {
  url: string;
}

export function getRedisConfig(): RedisConfig {
  return {
    url: getEnv('REDIS_URL'),
  };
}

/**
 * DeviantArt OAuth Configuration
 */
export interface DeviantArtConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getDeviantArtConfig(): DeviantArtConfig {
  return {
    clientId: getEnv('DEVIANTART_CLIENT_ID'),
    clientSecret: getEnv('DEVIANTART_CLIENT_SECRET'),
    redirectUri: getEnv('DEVIANTART_REDIRECT_URI'),
  };
}

/**
 * S3-Compatible Storage Configuration
 */
export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  forcePathStyle: boolean;
  presignedEndpoint?: string;
}

export function getS3StorageConfig(): StorageConfig {
  return {
    endpoint: getEnv('S3_ENDPOINT'),
    region: getEnvOrDefault('S3_REGION', 'us-east-1'),
    accessKeyId: getEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('S3_SECRET_ACCESS_KEY'),
    bucketName: getEnv('S3_BUCKET_NAME'),
    publicUrl: getEnv('S3_PUBLIC_URL'),
    forcePathStyle: getEnvBoolean('S3_FORCE_PATH_STYLE', false),
    presignedEndpoint: process.env.S3_PRESIGNED_ENDPOINT,
  };
}

/**
 * Security Configuration
 */
export interface SecurityConfig {
  sessionSecret: string;
  encryptionKey: string;
  cookieDomain?: string;
  sessionMaxAgeDays: number;
  refreshTokenExpiryDays: number;
}

export function getSecurityConfig(): SecurityConfig {
  return {
    sessionSecret: getEnv('SESSION_SECRET'),
    encryptionKey: getEnv('ENCRYPTION_KEY'),
    cookieDomain: process.env.COOKIE_DOMAIN,
    sessionMaxAgeDays: getEnvNumber('SESSION_MAX_AGE_DAYS', 7),
    refreshTokenExpiryDays: getEnvNumber('REFRESH_TOKEN_EXPIRY_DAYS', 90),
  };
}

/**
 * Application Configuration
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  nodeOptions?: string;
}

export function getAppConfig(): AppConfig {
  return {
    nodeEnv: getEnvOrDefault('NODE_ENV', 'development'),
    port: getEnvNumber('PORT', 4000),
    frontendUrl: getEnvOrDefault('FRONTEND_URL', 'http://localhost:3000'),
    nodeOptions: process.env.NODE_OPTIONS,
  };
}

/**
 * Session Storage Configuration
 */
export interface SessionConfig {
  store: 'redis' | 'postgres';
}

export function getSessionConfig(): SessionConfig {
  const store = getEnvOrDefault('SESSION_STORE', 'redis');
  if (store !== 'redis' && store !== 'postgres') {
    throw new Error(`SESSION_STORE must be 'redis' or 'postgres', got: ${store}`);
  }
  return { store };
}

/**
 * Cache Configuration
 */
export interface CacheConfig {
  enabled: boolean;
  defaultTtl: number;
  staleTtl: number;
}

export function getCacheConfig(): CacheConfig {
  return {
    enabled: getEnvBoolean('CACHE_ENABLED', true),
    defaultTtl: getEnvNumber('CACHE_DEFAULT_TTL', 300),
    staleTtl: getEnvNumber('CACHE_STALE_TTL', 7200),
  };
}

/**
 * Circuit Breaker Configuration
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number;
  openDurationMs: number;
  persistToRedis: boolean;
}

export function getCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    enabled: getEnvBoolean('CIRCUIT_BREAKER_ENABLED', true),
    threshold: getEnvNumber('CIRCUIT_BREAKER_THRESHOLD', 3),
    openDurationMs: getEnvNumber('CIRCUIT_BREAKER_OPEN_DURATION_MS', 300000),
    persistToRedis: getEnvBoolean('CIRCUIT_BREAKER_PERSIST_TO_REDIS', true),
  };
}

/**
 * Publisher Worker Configuration
 */
export interface PublisherConfig {
  concurrency: number;
  maxAttempts: number;
  jobTimeoutMs: number;
  staleCheckIntervalMs: number;
  maxStalledCount: number;
}

export function getPublisherConfig(): PublisherConfig {
  return {
    concurrency: getEnvNumber('PUBLISHER_CONCURRENCY', 5),
    maxAttempts: getEnvNumber('PUBLISHER_MAX_ATTEMPTS', 7),
    jobTimeoutMs: getEnvNumber('PUBLISHER_JOB_TIMEOUT_MS', 600000),
    staleCheckIntervalMs: getEnvNumber('PUBLISHER_STALE_CHECK_INTERVAL_MS', 60000),
    maxStalledCount: getEnvNumber('PUBLISHER_MAX_STALLED_COUNT', 2),
  };
}

/**
 * Rate Limiter Configuration
 */
export interface RateLimiterConfig {
  enabled: boolean;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPercent: number;
  successDecreaseFactor: number;
  failureIncreaseFactor: number;
}

export function getRateLimiterConfig(): RateLimiterConfig {
  return {
    enabled: getEnvBoolean('RATE_LIMITER_ENABLED', true),
    baseDelayMs: getEnvNumber('RATE_LIMITER_BASE_DELAY_MS', 3000),
    maxDelayMs: getEnvNumber('RATE_LIMITER_MAX_DELAY_MS', 300000),
    jitterPercent: getEnvNumber('RATE_LIMITER_JITTER_PERCENT', 20),
    successDecreaseFactor: parseFloat(
      getEnvOrDefault('RATE_LIMITER_SUCCESS_DECREASE_FACTOR', '0.9')
    ),
    failureIncreaseFactor: parseFloat(
      getEnvOrDefault('RATE_LIMITER_FAILURE_INCREASE_FACTOR', '2.0')
    ),
  };
}

/**
 * Metrics & Monitoring Configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  flushIntervalMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function getMetricsConfig(): MetricsConfig {
  const logLevel = getEnvOrDefault('LOG_LEVEL', 'info');
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: debug, info, warn, error. Got: ${logLevel}`);
  }
  return {
    enabled: getEnvBoolean('METRICS_ENABLED', true),
    flushIntervalMs: getEnvNumber('METRICS_FLUSH_INTERVAL_MS', 60000),
    logLevel: logLevel as 'debug' | 'info' | 'warn' | 'error',
  };
}

/**
 * Health Check Configuration
 */
export interface HealthCheckConfig {
  port: number;
  enabled: boolean;
}

export function getHealthCheckConfig(): HealthCheckConfig {
  return {
    port: getEnvNumber('HEALTH_CHECK_PORT', 8000),
    enabled: getEnvBoolean('HEALTH_CHECK_ENABLED', true),
  };
}

/**
 * Complete Configuration Object
 */
export interface Config {
  database: DatabaseConfig;
  redis: RedisConfig;
  deviantart: DeviantArtConfig;
  storage: StorageConfig;
  security: SecurityConfig;
  app: AppConfig;
  session: SessionConfig;
  cache: CacheConfig;
  circuitBreaker: CircuitBreakerConfig;
  publisher: PublisherConfig;
  rateLimiter: RateLimiterConfig;
  metrics: MetricsConfig;
  healthCheck: HealthCheckConfig;
}

/**
 * Get complete configuration (validates all required env vars)
 */
export function getConfig(): Config {
  return {
    database: getDatabaseConfig(),
    redis: getRedisConfig(),
    deviantart: getDeviantArtConfig(),
    storage: getS3StorageConfig(),
    security: getSecurityConfig(),
    app: getAppConfig(),
    session: getSessionConfig(),
    cache: getCacheConfig(),
    circuitBreaker: getCircuitBreakerConfig(),
    publisher: getPublisherConfig(),
    rateLimiter: getRateLimiterConfig(),
    metrics: getMetricsConfig(),
    healthCheck: getHealthCheckConfig(),
  };
}

/**
 * Validate configuration on module load (fail fast)
 * Only validate in non-test environments
 */
if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
  try {
    getConfig();
  } catch (error) {
    console.error('❌ Configuration validation failed:');
    console.error(error);
    process.exit(1);
  }
}
