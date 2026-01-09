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

import { prisma } from '../db/index.js';
import { RedisCache, CacheTTL } from './redis-cache.js';

// Cache TTL settings (in minutes for PostgreSQL, converted to seconds for Redis)
const CACHE_TTL_MINUTES = 10; // Fresh cache duration for API data (10 minutes)
const STALE_TTL_MINUTES = 120; // Max stale cache for fallback on rate limit (2 hours)

// Browse modes that require per-user caching
const PER_USER_MODES = ['home', 'following'];

export interface BrowseCacheParams {
  mode: string;
  source: 'api';
  tag?: string;
  topic?: string;
  username?: string;
  keywords?: string;
  mature: boolean;
  offset: number;
}

export interface CachedBrowseResponse {
  deviations: any[];
  hasMore: boolean;
  nextOffset: number;
  estimatedTotal?: number;
  fromCache?: boolean;
  cachedAt?: string;
}

/**
 * Check if a browse mode requires per-user caching
 */
export function isPerUserMode(mode: string): boolean {
  return PER_USER_MODES.includes(mode);
}

/**
 * Generate a unique cache key for browse responses
 */
export function generateCacheKey(params: BrowseCacheParams, userId?: string): string {
  const { mode, source, tag, topic, username, keywords, mature, offset } = params;

  if (isPerUserMode(mode) && userId) {
    // Per-user cache: browse:{userId}:{mode}:{source}:{mature}:{offset}
    return `browse:${userId}:${mode}:${source}:${mature}:${offset}`;
  }

  // Global cache: browse:global:{mode}:{source}:{tag}:{topic}:{username}:{keywords}:{mature}:{offset}
  return `browse:global:${mode}:${source}:${tag || ''}:${topic || ''}:${
    username || ''
  }:${keywords || ''}:${mature}:${offset}`;
}

/**
 * Get cached browse response if available and not expired
 * Dual cache strategy: Try Redis first, then PostgreSQL fallback
 */
export async function getCachedBrowseResponse(
  cacheKey: string,
  userId?: string,
  allowStale = false
): Promise<CachedBrowseResponse | null> {
  try {
    // Try Redis first (if available)
    if (RedisCache.isEnabled()) {
      // Use the same cache key as PostgreSQL (includes offset and all params)
      const redisKey = cacheKey;

      const cached = await RedisCache.getWithStale<CachedBrowseResponse>(redisKey, allowStale);

      if (cached.data !== null) {
        console.log(`[BrowseCache] Redis HIT: ${redisKey}${cached.isStale ? ' (stale)' : ''}`);
        // Only set fromCache: true for STALE cache (rate limit fallback)
        // Fresh cache doesn't need this flag
        return {
          ...cached.data,
          fromCache: cached.isStale, // Only true when serving stale cache
          // Preserve original cachedAt if it exists
          cachedAt: cached.data.cachedAt || new Date().toISOString(),
        };
      }
    }

    // Fallback to PostgreSQL
    const pgResponse = await getCachedBrowseResponseFromDB(cacheKey, userId, allowStale);

    if (pgResponse) {
      console.log('[BrowseCache] PostgreSQL HIT');

      // Backfill Redis cache if available
      if (RedisCache.isEnabled()) {
        const redisKey = cacheKey;
        await RedisCache.set(redisKey, pgResponse, CacheTTL.BROWSE_FEED);
        console.log('[BrowseCache] Backfilled Redis from PostgreSQL');
      }
    }

    return pgResponse;
  } catch (error) {
    console.error('Error getting cached browse response:', error);
    return null;
  }
}

/**
 * Get cached browse response from PostgreSQL database
 * Internal function for dual-cache fallback
 */
async function getCachedBrowseResponseFromDB(
  cacheKey: string,
  userId?: string,
  allowStale = false
): Promise<CachedBrowseResponse | null> {
  try {
    const ttlMinutes = allowStale ? STALE_TTL_MINUTES : CACHE_TTL_MINUTES;
    const minCacheTime = new Date(Date.now() - ttlMinutes * 60 * 1000);

    // Build query based on whether it's per-user or global
    const entry = await prisma.browseCache.findFirst({
      where: {
        cacheKey,
        userId: userId || null,
      },
    });

    if (!entry) {
      return null;
    }

    // Check if cache is expired
    if (entry.cachedAt < minCacheTime) {
      return null;
    }

    const response: CachedBrowseResponse = JSON.parse(entry.responseData);

    // Determine if this is stale cache (older than fresh TTL but within stale TTL)
    const freshCacheTime = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000);
    const isStale = entry.cachedAt < freshCacheTime;

    response.fromCache = isStale; // Only true when serving stale cache
    response.cachedAt = entry.cachedAt.toISOString();

    return response;
  } catch (error) {
    console.error('Error getting cached browse response from DB:', error);
    return null;
  }
}

/**
 * Store browse response in cache
 * Dual cache strategy: Write to both Redis and PostgreSQL
 */
export async function setCachedBrowseResponse(
  cacheKey: string,
  data: CachedBrowseResponse,
  userId?: string
): Promise<void> {
  try {
    const now = new Date();
    const cacheData = {
      deviations: data.deviations,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
      estimatedTotal: data.estimatedTotal,
      cachedAt: now.toISOString(), // Store the cache timestamp
    };

    // Write to Redis (if available)
    if (RedisCache.isEnabled()) {
      // Use the same cache key as PostgreSQL
      const redisKey = cacheKey;
      await RedisCache.set(redisKey, cacheData, CacheTTL.BROWSE_FEED);

      // Also set stale cache with the same key pattern for fallback
      await RedisCache.set(redisKey + ':stale', cacheData, CacheTTL.STALE_MAX);
      console.log(`[BrowseCache] Redis SET: ${redisKey} (TTL: ${CacheTTL.BROWSE_FEED}s)`);
    }

    // Write to PostgreSQL (for fallback)
    const responseData = JSON.stringify(cacheData);
    await prisma.browseCache.upsert({
      where: { cacheKey },
      update: {
        responseData,
        cachedAt: now,
      },
      create: {
        cacheKey,
        userId: userId || null,
        responseData,
        cachedAt: now,
      },
    });

    console.log(`[BrowseCache] PostgreSQL SET: ${cacheKey}`);
  } catch (error) {
    console.error('Error setting cached browse response:', error);
  }
}

/**
 * Clean expired cache entries (older than STALE_TTL)
 */
export async function cleanExpiredCache(): Promise<number> {
  try {
    const expiryTime = new Date(Date.now() - STALE_TTL_MINUTES * 60 * 1000);

    const result = await prisma.browseCache.deleteMany({
      where: {
        cachedAt: { lt: expiryTime },
      },
    });

    return result.count;
  } catch (error) {
    console.error('Error cleaning expired cache:', error);
    return 0;
  }
}
