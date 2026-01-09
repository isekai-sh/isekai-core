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
 * Cache Key Generation Utilities
 *
 * Provides consistent, namespaced, versioned cache key generation
 * Format: isekai:v1:{namespace}:{scope}:{identifier}:{params}
 */

// Cache version - increment to invalidate all caches
export const CACHE_VERSION = 'v1';

// Cache key prefix
export const CACHE_PREFIX = 'isekai';

/**
 * Cache namespaces for different data types
 */
export const CacheNamespace = {
  BROWSE: 'browse',
  ANALYTICS: 'analytics',
  MESSAGES: 'messages',
  DEVIATION: 'deviation',
  GALLERY: 'gallery',
  CATEGORY: 'category',
  TOPIC: 'topic',
  TAG: 'tag',
  USER: 'user',
} as const;

export type CacheNamespaceType = (typeof CacheNamespace)[keyof typeof CacheNamespace];

/**
 * Cache scope - determines if cache is per-user or global
 */
export type CacheScope = 'user' | 'global';

/**
 * Generate a cache key
 *
 * @param namespace - Cache namespace (browse, analytics, etc.)
 * @param scope - 'user' for user-specific data, 'global' for shared data
 * @param identifier - Primary identifier (userId, deviationId, etc.)
 * @param params - Additional parameters to include in key
 * @returns Formatted cache key
 *
 * @example
 * generateCacheKey('browse', 'user', userId, { mode: 'home', source: 'api', mature: true, offset: 0 })
 * // => "isekai:v1:browse:user:12345:home:api:true:0"
 *
 * @example
 * generateCacheKey('category', 'global', 'tree')
 * // => "isekai:v1:category:global:tree"
 */
export function generateCacheKey(
  namespace: CacheNamespaceType,
  scope: CacheScope,
  identifier: string,
  params?: Record<string, any>
): string {
  const parts = [CACHE_PREFIX, CACHE_VERSION, namespace, scope, identifier];

  // Add params if provided
  if (params) {
    // Sort keys for consistency
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      const value = params[key];
      // Convert to string and handle special values
      if (value === null || value === undefined) {
        parts.push('null');
      } else if (typeof value === 'object') {
        // Hash objects to prevent huge keys
        parts.push(hashObject(value));
      } else {
        parts.push(String(value));
      }
    }
  }

  return parts.join(':');
}

/**
 * Generate cache key pattern for wildcard matching
 * Used for deleting multiple related keys
 *
 * @example
 * generateCacheKeyPattern('browse', 'user', userId)
 * // => "isekai:v1:browse:user:12345:*"
 */
export function generateCacheKeyPattern(
  namespace: CacheNamespaceType,
  scope: CacheScope,
  identifier: string
): string {
  return `${CACHE_PREFIX}:${CACHE_VERSION}:${namespace}:${scope}:${identifier}:*`;
}

/**
 * Generate stale cache key (separate TTL for stale data)
 *
 * @example
 * generateStaleCacheKey('browse', 'user', userId, { mode: 'home' })
 * // => "isekai:v1:browse:user:12345:home:api:true:0:stale"
 */
export function generateStaleCacheKey(
  namespace: CacheNamespaceType,
  scope: CacheScope,
  identifier: string,
  params?: Record<string, any>
): string {
  const baseKey = generateCacheKey(namespace, scope, identifier, params);
  return `${baseKey}:stale`;
}

/**
 * Parse cache key to extract components
 * Useful for debugging and monitoring
 */
export function parseCacheKey(key: string): {
  prefix: string;
  version: string;
  namespace: string;
  scope: CacheScope;
  identifier: string;
  params: string[];
} | null {
  const parts = key.split(':');

  if (parts.length < 5) {
    return null;
  }

  return {
    prefix: parts[0],
    version: parts[1],
    namespace: parts[2],
    scope: parts[3] as CacheScope,
    identifier: parts[4],
    params: parts.slice(5),
  };
}

/**
 * Simple hash function for objects
 * Used to prevent huge cache keys for complex objects
 */
function hashObject(obj: any): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Preset cache key generators for common use cases
 */

export const CacheKeys = {
  /**
   * Browse feed cache keys
   */
  browse: {
    feed: (userId: string | null, mode: string, source: string, mature: boolean, offset: number) =>
      userId
        ? generateCacheKey(CacheNamespace.BROWSE, 'user', userId, {
            mode,
            source,
            mature,
            offset,
          })
        : generateCacheKey(CacheNamespace.BROWSE, 'global', mode, {
            source,
            mature,
            offset,
          }),

    deviation: (deviationId: string) =>
      generateCacheKey(CacheNamespace.DEVIATION, 'global', deviationId),

    morelikethis: (deviationId: string) =>
      generateCacheKey(CacheNamespace.BROWSE, 'global', `morelikethis:${deviationId}`),
  },

  /**
   * Analytics cache keys
   */
  analytics: {
    overview: (userId: string, period: string) =>
      generateCacheKey(CacheNamespace.ANALYTICS, 'user', userId, {
        type: 'overview',
        period,
      }),

    posts: (userId: string, offset: number, limit: number) =>
      generateCacheKey(CacheNamespace.ANALYTICS, 'user', userId, {
        type: 'posts',
        offset,
        limit,
      }),

    bestTimes: (userId: string, period: string) =>
      generateCacheKey(CacheNamespace.ANALYTICS, 'user', userId, {
        type: 'best-times',
        period,
      }),

    whofaved: (userId: string, deviationId: string, offset: number) =>
      generateCacheKey(CacheNamespace.ANALYTICS, 'user', userId, {
        type: 'whofaved',
        deviationId,
        offset,
      }),

    audience: (userId: string, period: string) =>
      generateCacheKey(CacheNamespace.ANALYTICS, 'user', userId, {
        type: 'audience',
        period,
      }),
  },

  /**
   * Messages/notifications cache keys
   */
  messages: {
    notifications: (userId: string, type: string, cursor: string | null) =>
      generateCacheKey(CacheNamespace.MESSAGES, 'user', userId, {
        type: 'notifications',
        feed: type,
        cursor,
      }),

    note: (userId: string, noteId: string) =>
      generateCacheKey(CacheNamespace.MESSAGES, 'user', userId, {
        type: 'note',
        noteId,
      }),

    folders: (userId: string) =>
      generateCacheKey(CacheNamespace.MESSAGES, 'user', userId, {
        type: 'folders',
      }),
  },

  /**
   * Category/topic cache keys
   */
  category: {
    tree: () => generateCacheKey(CacheNamespace.CATEGORY, 'global', 'tree'),
  },

  topic: {
    list: () => generateCacheKey(CacheNamespace.TOPIC, 'global', 'list'),

    top: () => generateCacheKey(CacheNamespace.TOPIC, 'global', 'top'),

    trendingTags: () => generateCacheKey(CacheNamespace.TOPIC, 'global', 'trending-tags'),
  },

  /**
   * Tag search cache keys
   */
  tag: {
    search: (query: string) =>
      generateCacheKey(CacheNamespace.TAG, 'global', 'search', {
        q: query.toLowerCase().trim(),
      }),
  },

  /**
   * Gallery/user cache keys
   */
  gallery: {
    folders: (userId: string) =>
      generateCacheKey(CacheNamespace.GALLERY, 'user', userId, {
        type: 'folders',
      }),
  },

  user: {
    profile: (userId: string) =>
      generateCacheKey(CacheNamespace.USER, 'user', userId, {
        type: 'profile',
      }),
  },
};
