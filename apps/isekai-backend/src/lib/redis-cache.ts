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

import { RedisClientManager } from './redis-client.js';
import { CacheStats } from './cache-stats.js';
import { generateStaleCacheKey, parseCacheKey } from './cache-keys.js';
import { safeJsonParse } from './safe-json-parse.js';

/**
 * Cache TTL Configuration (in seconds)
 * Based on balanced approach: stable data cached longer, dynamic data cached shorter
 */
export const CacheTTL = {
  // Very stable data
  CATEGORY_TREE: 6 * 60 * 60, // 6 hours

  // Stable data
  TOPICS: 45 * 60, // 45 minutes
  TAG_SEARCH: 20 * 60, // 20 minutes
  USER_PROFILE: 20 * 60, // 20 minutes
  GALLERY_STRUCTURE: 12 * 60, // 12 minutes

  // Moderately dynamic
  DEVIATION_METADATA: 12 * 60, // 12 minutes
  BROWSE_FEED: 7 * 60, // 7 minutes
  ANALYTICS: 45 * 60, // 45 minutes

  // Dynamic data
  MESSAGES: 3 * 60, // 3 minutes

  // Stale fallback (for all endpoints on 429 errors)
  STALE_MAX: 2 * 60 * 60, // 2 hours
} as const;

/**
 * Cache result with metadata
 */
export interface CacheResult<T> {
  data: T | null;
  isStale: boolean;
  fromCache: boolean;
}

/**
 * Redis Cache Manager
 *
 * Features:
 * - Generic get/set/delete operations with automatic JSON serialization
 * - TTL management with different durations per data type
 * - Stale-while-revalidate pattern for 429 errors
 * - Request deduplication/coalescing for concurrent identical requests
 * - Automatic cache statistics tracking
 * - Graceful degradation when Redis unavailable
 */
export class RedisCache {
  // In-memory map for request coalescing
  private static pendingRequests = new Map<string, Promise<any>>();

  /**
   * Get value from cache
   *
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const client = await RedisClientManager.getClient();
      if (!client) {
        return null;
      }

      const data = await client.get(key);
      if (!data) {
        return null;
      }

      return safeJsonParse<T>(data, null as any);
    } catch (error) {
      console.error('[Cache] Error getting key:', key, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds
   */
  static async set<T>(key: string, value: T, ttl: number): Promise<boolean> {
    try {
      const client = await RedisClientManager.getClient();
      if (!client) {
        return false;
      }

      const serialized = JSON.stringify(value);
      await client.setex(key, ttl, serialized);

      return true;
    } catch (error) {
      console.error('[Cache] Error setting key:', key, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   *
   * @param key - Cache key or pattern
   */
  static async del(key: string): Promise<boolean> {
    try {
      const client = await RedisClientManager.getClient();
      if (!client) {
        return false;
      }

      await client.del(key);
      return true;
    } catch (error) {
      console.error('[Cache] Error deleting key:', key, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   *
   * @param pattern - Key pattern (e.g., "isekai:v1:browse:user:123:*")
   */
  static async delPattern(pattern: string): Promise<number> {
    try {
      const client = await RedisClientManager.getClient();
      if (!client) {
        return 0;
      }

      // Use SCAN to find matching keys (safer than KEYS command)
      const keys: string[] = [];
      let cursor = '0';

      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0');

      if (keys.length === 0) {
        return 0;
      }

      // Delete all matching keys
      await client.del(...keys);
      return keys.length;
    } catch (error) {
      console.error('[Cache] Error deleting pattern:', pattern, error);
      return 0;
    }
  }

  /**
   * Get value with stale cache support
   *
   * @param key - Cache key
   * @param allowStale - Whether to return stale cache on miss
   * @returns Cache result with metadata
   */
  static async getWithStale<T>(key: string, allowStale = false): Promise<CacheResult<T>> {
    const namespace = parseCacheKey(key)?.namespace || 'unknown';

    // Try fresh cache first
    const freshData = await this.get<T>(key);
    if (freshData !== null) {
      CacheStats.recordHit(namespace);
      return {
        data: freshData,
        isStale: false,
        fromCache: true,
      };
    }

    // Cache miss
    CacheStats.recordMiss(namespace);

    // Try stale cache if allowed
    if (allowStale) {
      const staleKey = generateStaleCacheKey(
        namespace as any,
        'global',
        key.split(':')[4] || 'unknown'
      );
      const staleData = await this.get<T>(staleKey);
      if (staleData !== null) {
        CacheStats.recordStaleServe(namespace);
        console.log(`[Cache] STALE: Serving stale cache for ${namespace}`);
        return {
          data: staleData,
          isStale: true,
          fromCache: true,
        };
      }
    }

    return {
      data: null,
      isStale: false,
      fromCache: false,
    };
  }

  /**
   * Get or fetch with request coalescing
   *
   * If multiple identical requests come in simultaneously, only one
   * will execute the fetch function, and all will share the result.
   *
   * @param key - Cache key
   * @param fetchFn - Function to fetch data if cache miss
   * @param ttl - Time to live in seconds for fresh cache
   * @param allowStale - Whether to return stale cache on 429 errors
   * @returns Fetched or cached data
   */
  static async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number,
    allowStale = false
  ): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
    const namespace = parseCacheKey(key)?.namespace || 'unknown';

    // Check cache first
    const cached = await this.getWithStale<T>(key, allowStale);
    if (cached.data !== null) {
      return {
        data: cached.data,
        fromCache: true,
        isStale: cached.isStale,
      };
    }

    // Check if request is already pending (request coalescing)
    const pending = this.pendingRequests.get(key);
    if (pending) {
      CacheStats.recordCoalescedRequest();
      console.log(`[Cache] COALESCE: Waiting for pending request: ${key}`);
      const data = await pending;
      return {
        data,
        fromCache: false,
        isStale: false,
      };
    }

    // Create new fetch promise
    const fetchPromise = (async () => {
      try {
        // Execute fetch function
        const data = await fetchFn();

        // Cache the result (both fresh and stale)
        await this.set(key, data, ttl);

        // Also set stale cache with longer TTL
        const staleKey = key + ':stale';
        await this.set(staleKey, data, CacheTTL.STALE_MAX);

        return data;
      } catch (error) {
        // If 429 error and stale cache available, return stale
        if (this.is429Error(error) && allowStale) {
          CacheStats.recordRateLimitError(namespace);
          const staleData = await this.get<T>(key + ':stale');
          if (staleData !== null) {
            CacheStats.recordStaleServe(namespace);
            console.log(`[Cache] 429: Serving stale cache for ${namespace}`);
            return staleData;
          }
        }
        throw error;
      } finally {
        // Remove from pending requests
        this.pendingRequests.delete(key);
      }
    })();

    // Store promise in pending requests
    this.pendingRequests.set(key, fetchPromise);

    const data = await fetchPromise;
    return {
      data,
      fromCache: false,
      isStale: false,
    };
  }

  /**
   * Check if error is a 429 rate limit error
   */
  private static is429Error(error: any): boolean {
    if (!error) return false;

    // Check status code
    if (error.status === 429 || error.statusCode === 429) {
      return true;
    }

    // Check error message
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('api_threshold')
    );
  }

  /**
   * Invalidate cache for a namespace/pattern
   *
   * @param pattern - Cache key pattern
   */
  static async invalidate(pattern: string): Promise<number> {
    const deletedCount = await this.delPattern(pattern);
    console.log(`[Cache] Invalidated ${deletedCount} keys matching: ${pattern}`);
    return deletedCount;
  }

  /**
   * Check if caching is enabled
   */
  static isEnabled(): boolean {
    // Check environment variable
    const cacheEnabled = process.env.CACHE_ENABLED?.toLowerCase();
    if (cacheEnabled === 'false' || cacheEnabled === '0') {
      return false;
    }

    // Check if Redis is available
    return RedisClientManager.isAvailable();
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return CacheStats.toJSON();
  }

  /**
   * Clear all pending requests (for testing)
   */
  static clearPendingRequests(): void {
    this.pendingRequests.clear();
  }
}
