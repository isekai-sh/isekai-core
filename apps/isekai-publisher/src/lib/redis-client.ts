import { Redis } from 'ioredis';

// Timeout for Redis connection attempt
const REDIS_CONNECT_TIMEOUT_MS = 5000;

/**
 * Redis Client Manager - Singleton pattern for connection reuse
 *
 * Features:
 * - Auto-detection with timeout (5 seconds)
 * - Graceful fallback to null if unavailable
 * - Lazy connection (connects only when needed)
 * - Health monitoring
 * - Automatic error handling
 */
export class RedisClientManager {
  private static instance: Redis | null = null;
  private static initPromise: Promise<Redis | null> | null = null;
  private static isInitializing = false;

  /**
   * Get Redis client instance (singleton)
   * Returns null if Redis is unavailable
   */
  static async getClient(): Promise<Redis | null> {
    // Return existing instance if already initialized
    if (this.instance !== null) {
      return this.instance;
    }

    // If already initializing, wait for that promise
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  /**
   * Initialize Redis client with timeout
   */
  private static async initialize(): Promise<Redis | null> {
    const redisUrl = process.env.REDIS_URL;

    // No Redis URL configured
    if (!redisUrl) {
      console.log('[Redis] No REDIS_URL configured, caching disabled');
      return null;
    }

    try {
      console.log('[Redis] Attempting to connect to Redis for caching...');

      // Create Redis client
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true, // Manual connection with timeout
        retryStrategy: (times) => {
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
          const delay = Math.min(times * 100, 3000);
          return delay;
        },
        tls: redisUrl.startsWith('rediss://')
          ? {
              rejectUnauthorized: false, // Accept self-signed certificates
            }
          : undefined,
      });

      // Attempt connection with timeout
      const connectPromise = client.connect();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis connection timeout')), REDIS_CONNECT_TIMEOUT_MS)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      // Connection successful
      console.log('[Redis] Successfully connected to Redis for caching');

      // Add error handler for runtime errors
      client.on('error', (err) => {
        console.error('[Redis] Runtime error:', err.message);
      });

      // Add reconnect handler
      client.on('reconnecting', () => {
        console.log('[Redis] Reconnecting to Redis...');
      });

      // Add ready handler
      client.on('ready', () => {
        console.log('[Redis] Redis client ready');
      });

      // Add close handler
      client.on('close', () => {
        console.warn('[Redis] Redis connection closed');
      });

      // Store instance
      this.instance = client;
      return client;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[Redis] Failed to connect to Redis: ${errorMessage}`);
      console.warn('[Redis] Caching will be disabled, falling back to direct API calls');
      return null;
    }
  }

  /**
   * Check if Redis is available
   */
  static isAvailable(): boolean {
    return this.instance !== null && this.instance.status === 'ready';
  }

  /**
   * Get connection status
   */
  static getStatus(): 'ready' | 'connecting' | 'disconnected' | 'unavailable' {
    if (!this.instance) {
      return 'unavailable';
    }
    return this.instance.status as 'ready' | 'connecting' | 'disconnected';
  }

  /**
   * Test Redis connection with ping
   */
  static async ping(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) {
        return false;
      }
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Redis latency in milliseconds
   */
  static async getLatency(): Promise<number | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }
      const start = Date.now();
      await client.ping();
      return Date.now() - start;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gracefully close Redis connection
   * Call during application shutdown
   */
  static async close(): Promise<void> {
    if (this.instance) {
      console.log('[Redis] Closing Redis connection...');
      try {
        await this.instance.quit();
        console.log('[Redis] Redis connection closed successfully');
      } catch (error) {
        console.error('[Redis] Error closing Redis connection:', error);
      }
      this.instance = null;
      this.initPromise = null;
    }
  }

  /**
   * Reset instance (for testing purposes)
   */
  static reset(): void {
    this.instance = null;
    this.initPromise = null;
    this.isInitializing = false;
  }
}
