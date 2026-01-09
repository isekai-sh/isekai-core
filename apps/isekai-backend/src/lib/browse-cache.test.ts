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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPerUserMode,
  generateCacheKey,
  getCachedBrowseResponse,
  setCachedBrowseResponse,
  cleanExpiredCache,
  type BrowseCacheParams,
  type CachedBrowseResponse,
} from './browse-cache.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  prisma: {
    browseCache: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('./redis-cache.js', () => ({
  RedisCache: {
    isEnabled: vi.fn(),
    getWithStale: vi.fn(),
    set: vi.fn(),
  },
  CacheTTL: {
    BROWSE_FEED: 420, // 7 minutes
    STALE_MAX: 7200, // 2 hours
  },
}));

import { prisma } from '../db/index.js';
import { RedisCache } from './redis-cache.js';

const mockPrisma = vi.mocked(prisma);
const mockRedisCache = vi.mocked(RedisCache);

describe('browse-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('isPerUserMode', () => {
    it('should return true for home mode', () => {
      expect(isPerUserMode('home')).toBe(true);
    });

    it('should return true for following mode', () => {
      expect(isPerUserMode('following')).toBe(true);
    });

    it('should return false for popular mode', () => {
      expect(isPerUserMode('popular')).toBe(false);
    });

    it('should return false for newest mode', () => {
      expect(isPerUserMode('newest')).toBe(false);
    });

    it('should return false for unknown modes', () => {
      expect(isPerUserMode('unknown')).toBe(false);
    });
  });

  describe('generateCacheKey', () => {
    const baseParams: BrowseCacheParams = {
      mode: 'popular',
      source: 'api',
      mature: false,
      offset: 0,
    };

    it('should generate per-user cache key for home mode with userId', () => {
      const params: BrowseCacheParams = { ...baseParams, mode: 'home' };
      const key = generateCacheKey(params, 'user-123');
      expect(key).toBe('browse:user-123:home:api:false:0');
    });

    it('should generate per-user cache key for following mode with userId', () => {
      const params: BrowseCacheParams = { ...baseParams, mode: 'following' };
      const key = generateCacheKey(params, 'user-456');
      expect(key).toBe('browse:user-456:following:api:false:0');
    });

    it('should generate global cache key for popular mode', () => {
      const params: BrowseCacheParams = { ...baseParams, mode: 'popular' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api:::::false:0');
    });

    it('should include tag in global cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, tag: 'fantasy' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api:fantasy::::false:0');
    });

    it('should include topic in global cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, topic: 'digitalart' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api::digitalart:::false:0');
    });

    it('should include username in global cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, username: 'artist123' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api:::artist123::false:0');
    });

    it('should include keywords in global cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, keywords: 'dragon sword' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api::::dragon sword:false:0');
    });

    it('should include mature setting in cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, mature: true };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api:::::true:0');
    });

    it('should include offset in cache key', () => {
      const params: BrowseCacheParams = { ...baseParams, offset: 24 };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:popular:api:::::false:24');
    });

    it('should include all parameters in global cache key', () => {
      const params: BrowseCacheParams = {
        mode: 'newest',
        source: 'api',
        tag: 'scifi',
        topic: 'photography',
        username: 'photographer',
        keywords: 'space station',
        mature: true,
        offset: 48,
      };
      const key = generateCacheKey(params);
      expect(key).toBe(
        'browse:global:newest:api:scifi:photography:photographer:space station:true:48'
      );
    });

    it('should use global cache key for per-user mode without userId', () => {
      const params: BrowseCacheParams = { ...baseParams, mode: 'home' };
      const key = generateCacheKey(params);
      expect(key).toBe('browse:global:home:api:::::false:0');
    });
  });

  describe('getCachedBrowseResponse', () => {
    const mockCachedData: CachedBrowseResponse = {
      deviations: [{ deviationid: '123', title: 'Test' }],
      hasMore: true,
      nextOffset: 24,
      estimatedTotal: 1000,
    };

    it('should return data from Redis when available', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.getWithStale.mockResolvedValue({
        data: mockCachedData,
        isStale: false,
        fromCache: true,
      });

      const result = await getCachedBrowseResponse('test-key');

      expect(mockRedisCache.getWithStale).toHaveBeenCalledWith('test-key', false);
      expect(result).toMatchObject({
        deviations: mockCachedData.deviations,
        hasMore: true,
        nextOffset: 24,
      });
      expect(result?.fromCache).toBe(false); // Fresh cache
    });

    it('should mark stale Redis cache data with fromCache flag', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.getWithStale.mockResolvedValue({
        data: mockCachedData,
        isStale: true,
        fromCache: true,
      });

      const result = await getCachedBrowseResponse('test-key');

      expect(result?.fromCache).toBe(true); // Stale cache
    });

    it('should fall back to PostgreSQL when Redis is disabled', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      mockPrisma.browseCache.findFirst.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockCachedData),
        cachedAt: new Date(),
      });

      const result = await getCachedBrowseResponse('test-key');

      expect(mockPrisma.browseCache.findFirst).toHaveBeenCalled();
      expect(result).toMatchObject(mockCachedData);
    });

    it('should fall back to PostgreSQL when Redis returns null', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.getWithStale.mockResolvedValue({
        data: null,
        isStale: false,
        fromCache: false,
      });
      mockPrisma.browseCache.findFirst.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockCachedData),
        cachedAt: new Date(),
      });

      const result = await getCachedBrowseResponse('test-key');

      expect(mockPrisma.browseCache.findFirst).toHaveBeenCalled();
      expect(result).toMatchObject(mockCachedData);
    });

    it('should backfill Redis from PostgreSQL when Redis is enabled', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.getWithStale.mockResolvedValue({
        data: null,
        isStale: false,
        fromCache: false,
      });
      mockPrisma.browseCache.findFirst.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockCachedData),
        cachedAt: new Date(),
      });

      await getCachedBrowseResponse('test-key');

      expect(mockRedisCache.set).toHaveBeenCalledWith('test-key', expect.any(Object), 420);
    });

    it('should return null when cache entry not found in PostgreSQL', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      mockPrisma.browseCache.findFirst.mockResolvedValue(null);

      const result = await getCachedBrowseResponse('test-key');

      expect(result).toBeNull();
    });

    it('should return null when PostgreSQL cache is expired (fresh mode)', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      const expiredDate = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      mockPrisma.browseCache.findFirst.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockCachedData),
        cachedAt: expiredDate,
      });

      const result = await getCachedBrowseResponse('test-key', undefined, false);

      expect(result).toBeNull();
    });

    it('should return stale cache when allowStale is true', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      const staleDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      mockPrisma.browseCache.findFirst.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockCachedData),
        cachedAt: staleDate,
      });

      const result = await getCachedBrowseResponse('test-key', undefined, true);

      expect(result).toMatchObject(mockCachedData);
      expect(result?.fromCache).toBe(true); // Stale
    });

    it('should handle errors gracefully', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.getWithStale.mockRejectedValue(new Error('Redis error'));

      const result = await getCachedBrowseResponse('test-key');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('setCachedBrowseResponse', () => {
    const mockData: CachedBrowseResponse = {
      deviations: [{ deviationid: '123', title: 'Test' }],
      hasMore: true,
      nextOffset: 24,
      estimatedTotal: 1000,
    };

    it('should write to Redis when enabled', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.set.mockResolvedValue(true);
      mockPrisma.browseCache.upsert.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockData),
        cachedAt: new Date(),
      });

      await setCachedBrowseResponse('test-key', mockData);

      expect(mockRedisCache.set).toHaveBeenCalledTimes(2); // Fresh + stale
      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({ deviations: mockData.deviations }),
        420
      );
      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'test-key:stale',
        expect.objectContaining({ deviations: mockData.deviations }),
        7200
      );
    });

    it('should write to PostgreSQL', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      mockPrisma.browseCache.upsert.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockData),
        cachedAt: new Date(),
      });

      await setCachedBrowseResponse('test-key', mockData);

      expect(mockPrisma.browseCache.upsert).toHaveBeenCalledWith({
        where: { cacheKey: 'test-key' },
        update: {
          responseData: expect.any(String),
          cachedAt: expect.any(Date),
        },
        create: {
          cacheKey: 'test-key',
          userId: null,
          responseData: expect.any(String),
          cachedAt: expect.any(Date),
        },
      });
    });

    it('should include userId in PostgreSQL write for per-user cache', async () => {
      mockRedisCache.isEnabled.mockReturnValue(false);
      mockPrisma.browseCache.upsert.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: 'user-123',
        responseData: JSON.stringify(mockData),
        cachedAt: new Date(),
      });

      await setCachedBrowseResponse('test-key', mockData, 'user-123');

      expect(mockPrisma.browseCache.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 'user-123',
          }),
        })
      );
    });

    it('should add cachedAt timestamp to stored data', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.set.mockResolvedValue(true);
      mockPrisma.browseCache.upsert.mockResolvedValue({
        id: '1',
        cacheKey: 'test-key',
        userId: null,
        responseData: JSON.stringify(mockData),
        cachedAt: new Date(),
      });

      await setCachedBrowseResponse('test-key', mockData);

      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          cachedAt: expect.any(String),
        }),
        420
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedisCache.isEnabled.mockReturnValue(true);
      mockRedisCache.set.mockRejectedValue(new Error('Redis error'));
      mockPrisma.browseCache.upsert.mockRejectedValue(new Error('DB error'));

      await setCachedBrowseResponse('test-key', mockData);

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('cleanExpiredCache', () => {
    it('should delete expired cache entries', async () => {
      mockPrisma.browseCache.deleteMany.mockResolvedValue({ count: 42 });

      const result = await cleanExpiredCache();

      expect(result).toBe(42);
      expect(mockPrisma.browseCache.deleteMany).toHaveBeenCalledWith({
        where: {
          cachedAt: { lt: expect.any(Date) },
        },
      });
    });

    it('should use STALE_TTL for expiry time', async () => {
      mockPrisma.browseCache.deleteMany.mockResolvedValue({ count: 10 });

      await cleanExpiredCache();

      const call = mockPrisma.browseCache.deleteMany.mock.calls[0][0];
      const expiryDate = call?.where?.cachedAt?.lt as Date;
      const expectedExpiry = Date.now() - 120 * 60 * 1000; // 2 hours

      // Allow 1 second tolerance
      expect(expiryDate.getTime()).toBeGreaterThan(expectedExpiry - 1000);
      expect(expiryDate.getTime()).toBeLessThan(expectedExpiry + 1000);
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.browseCache.deleteMany.mockRejectedValue(new Error('DB error'));

      const result = await cleanExpiredCache();

      expect(result).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });

    it('should return 0 when no entries deleted', async () => {
      mockPrisma.browseCache.deleteMany.mockResolvedValue({ count: 0 });

      const result = await cleanExpiredCache();

      expect(result).toBe(0);
    });
  });
});
