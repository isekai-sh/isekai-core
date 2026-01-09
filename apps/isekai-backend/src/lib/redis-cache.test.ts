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
import { RedisCache, CacheTTL, type CacheResult } from './redis-cache.js';

// Mock dependencies
vi.mock('./redis-client.js', () => ({
  RedisClientManager: {
    getClient: vi.fn(),
    isAvailable: vi.fn(),
  },
}));

vi.mock('./cache-stats.js', () => ({
  CacheStats: {
    recordHit: vi.fn(),
    recordMiss: vi.fn(),
    recordStaleServe: vi.fn(),
    recordRateLimitError: vi.fn(),
    recordCoalescedRequest: vi.fn(),
    toJSON: vi.fn(() => ({ hits: 10, misses: 5 })),
  },
}));

// Mock logger to suppress console output
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

// Import after mocks
import { RedisClientManager } from './redis-client.js';
import { CacheStats } from './cache-stats.js';

const mockRedisClientManager = vi.mocked(RedisClientManager);
const mockCacheStats = vi.mocked(CacheStats);

describe('redis-cache', () => {
  // Create a mock Redis client
  const mockRedisClient = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    RedisCache.clearPendingRequests();
    mockRedisClientManager.getClient.mockResolvedValue(mockRedisClient as any);
    mockRedisClientManager.isAvailable.mockReturnValue(true);
  });

  describe('CacheTTL', () => {
    it('should define correct TTL values', () => {
      expect(CacheTTL.CATEGORY_TREE).toBe(6 * 60 * 60); // 6 hours
      expect(CacheTTL.TOPICS).toBe(45 * 60); // 45 minutes
      expect(CacheTTL.TAG_SEARCH).toBe(20 * 60); // 20 minutes
      expect(CacheTTL.USER_PROFILE).toBe(20 * 60); // 20 minutes
      expect(CacheTTL.GALLERY_STRUCTURE).toBe(12 * 60); // 12 minutes
      expect(CacheTTL.DEVIATION_METADATA).toBe(12 * 60); // 12 minutes
      expect(CacheTTL.BROWSE_FEED).toBe(7 * 60); // 7 minutes
      expect(CacheTTL.ANALYTICS).toBe(45 * 60); // 45 minutes
      expect(CacheTTL.MESSAGES).toBe(3 * 60); // 3 minutes
      expect(CacheTTL.STALE_MAX).toBe(2 * 60 * 60); // 2 hours
    });
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      const mockData = { id: '123', name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await RedisCache.get('test-key');

      expect(result).toEqual(mockData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await RedisCache.get('missing-key');

      expect(result).toBeNull();
    });

    it('should return null when Redis unavailable', async () => {
      mockRedisClientManager.getClient.mockResolvedValue(null);

      const result = await RedisCache.get('test-key');

      expect(result).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('{ invalid json }');

      const result = await RedisCache.get('test-key');

      expect(result).toBeNull(); // safeJsonParse returns null
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await RedisCache.get('test-key');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should set value with TTL', async () => {
      const mockData = { id: '123', name: 'test' };
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await RedisCache.set('test-key', mockData, 300);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key', 300, JSON.stringify(mockData));
    });

    it('should return false when Redis unavailable', async () => {
      mockRedisClientManager.getClient.mockResolvedValue(null);

      const result = await RedisCache.set('test-key', { data: 'test' }, 300);

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      const result = await RedisCache.set('test-key', { data: 'test' }, 300);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it('should serialize complex objects', async () => {
      const complexData = {
        id: '123',
        nested: { array: [1, 2, 3], bool: true },
      };
      mockRedisClient.setex.mockResolvedValue('OK');

      await RedisCache.set('test-key', complexData, 300);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        300,
        JSON.stringify(complexData)
      );
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await RedisCache.del('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should return false when Redis unavailable', async () => {
      mockRedisClientManager.getClient.mockResolvedValue(null);

      const result = await RedisCache.del('test-key');

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      const result = await RedisCache.del('test-key');

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('delPattern', () => {
    it('should delete multiple keys matching pattern', async () => {
      // First scan returns cursor "1" with 2 keys
      mockRedisClient.scan
        .mockResolvedValueOnce(['1', ['key1', 'key2']])
        .mockResolvedValueOnce(['0', ['key3']]); // Second scan returns cursor "0" (done)

      mockRedisClient.del.mockResolvedValue(3);

      const result = await RedisCache.delPattern('test:*');

      expect(result).toBe(3);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.scan).toHaveBeenCalledWith('0', 'MATCH', 'test:*', 'COUNT', 100);
      expect(mockRedisClient.scan).toHaveBeenCalledWith('1', 'MATCH', 'test:*', 'COUNT', 100);
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should handle single scan iteration', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', ['key1', 'key2']]);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await RedisCache.delPattern('test:*');

      expect(result).toBe(2);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when no keys match', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', []]);

      const result = await RedisCache.delPattern('test:*');

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should return 0 when Redis unavailable', async () => {
      mockRedisClientManager.getClient.mockResolvedValue(null);

      const result = await RedisCache.delPattern('test:*');

      expect(result).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockRedisClient.scan.mockRejectedValue(new Error('Redis error'));

      const result = await RedisCache.delPattern('test:*');

      expect(result).toBe(0);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getWithStale', () => {
    it('should return fresh cache when available', async () => {
      const mockData = { id: '123', name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await RedisCache.getWithStale('isekai:v1:browse:global:popular', false);

      expect(result).toEqual({
        data: mockData,
        isStale: false,
        fromCache: true,
      });
      expect(mockCacheStats.recordHit).toHaveBeenCalledWith('browse');
    });

    it('should return stale cache when fresh unavailable and allowed', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(null) // Fresh cache miss
        .mockResolvedValueOnce(JSON.stringify({ id: '123', stale: true })); // Stale cache hit

      const result = await RedisCache.getWithStale('isekai:v1:browse:global:popular', true);

      expect(result.data).toEqual({ id: '123', stale: true });
      expect(result.isStale).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(mockCacheStats.recordMiss).toHaveBeenCalled();
      expect(mockCacheStats.recordStaleServe).toHaveBeenCalledWith('browse');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('STALE: Serving stale cache')
      );
    });

    it('should return null when stale not allowed', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await RedisCache.getWithStale('isekai:v1:browse:global:popular', false);

      expect(result).toEqual({
        data: null,
        isStale: false,
        fromCache: false,
      });
      expect(mockCacheStats.recordMiss).toHaveBeenCalled();
    });

    it('should return null when both fresh and stale unavailable', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await RedisCache.getWithStale('isekai:v1:browse:global:popular', true);

      expect(result).toEqual({
        data: null,
        isStale: false,
        fromCache: false,
      });
    });

    it('should handle unknown namespace gracefully', async () => {
      const mockData = { test: 'data' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await RedisCache.getWithStale('invalid-key-format', false);

      expect(result.data).toEqual(mockData);
      expect(mockCacheStats.recordHit).toHaveBeenCalledWith('unknown');
    });
  });

  describe('getOrFetch', () => {
    it('should return cached data when available', async () => {
      const mockData = { id: '123', name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockData));

      const fetchFn = vi.fn();
      const result = await RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300);

      expect(result).toEqual({
        data: mockData,
        fromCache: true,
        isStale: false,
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache on cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const mockData = { id: '123', name: 'fetched' };
      const fetchFn = vi.fn().mockResolvedValue(mockData);

      const result = await RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300);

      expect(result).toEqual({
        data: mockData,
        fromCache: false,
        isStale: false,
      });
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2); // Fresh + stale
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'isekai:v1:browse:global:popular',
        300,
        JSON.stringify(mockData)
      );
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'isekai:v1:browse:global:popular:stale',
        CacheTTL.STALE_MAX,
        JSON.stringify(mockData)
      );
    });

    it('should coalesce concurrent identical requests', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const mockData = { id: '123', name: 'coalesced' };
      let fetchCallCount = 0;
      const fetchFn = vi.fn(async () => {
        fetchCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate delay
        return mockData;
      });

      // Make 3 concurrent requests
      const [result1, result2, result3] = await Promise.all([
        RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300),
        RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300),
        RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300),
      ]);

      // All should get same data
      expect(result1.data).toEqual(mockData);
      expect(result2.data).toEqual(mockData);
      expect(result3.data).toEqual(mockData);

      // But fetch should only be called once
      expect(fetchCallCount).toBe(1);
      expect(mockCacheStats.recordCoalescedRequest).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE: Waiting for pending request')
      );
    });

    it('should serve stale cache on 429 error when allowed', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(null) // Fresh cache miss
        .mockResolvedValueOnce(null) // getWithStale fresh miss
        .mockResolvedValueOnce(JSON.stringify({ id: '123', stale: true })); // Stale cache hit

      const error = new Error('Rate limit exceeded');
      (error as any).status = 429;
      const fetchFn = vi.fn().mockRejectedValue(error);

      const result = await RedisCache.getOrFetch(
        'isekai:v1:browse:global:popular',
        fetchFn,
        300,
        true // allowStale
      );

      expect(result.data).toEqual({ id: '123', stale: true });
      expect(mockCacheStats.recordRateLimitError).toHaveBeenCalledWith('browse');
      expect(mockCacheStats.recordStaleServe).toHaveBeenCalledWith('browse');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('429: Serving stale cache'));
    });

    it('should throw error when fetch fails and no stale cache', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const error = new Error('Fetch failed');
      const fetchFn = vi.fn().mockRejectedValue(error);

      await expect(
        RedisCache.getOrFetch('isekai:v1:browse:global:popular', fetchFn, 300)
      ).rejects.toThrow('Fetch failed');
    });

    it('should clean up pending request on success', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await RedisCache.getOrFetch('test-key', fetchFn, 300);

      // Pending request should be removed
      expect((RedisCache as any).pendingRequests.size).toBe(0);
    });

    it('should clean up pending request on failure', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const fetchFn = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      await expect(RedisCache.getOrFetch('test-key', fetchFn, 300)).rejects.toThrow();

      // Pending request should be removed
      expect((RedisCache as any).pendingRequests.size).toBe(0);
    });
  });

  describe('is429Error', () => {
    it('should detect 429 status code', () => {
      const error = { status: 429 };
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should detect 429 statusCode', () => {
      const error = { statusCode: 429 };
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should detect rate limit in message', () => {
      const error = new Error('Rate limit exceeded');
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should detect 429 in message', () => {
      const error = new Error('HTTP 429 error');
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should detect too many requests in message', () => {
      const error = new Error('Too many requests');
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should detect api_threshold in message', () => {
      const error = new Error('api_threshold exceeded');
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should be case insensitive', () => {
      const error = new Error('RATE LIMIT EXCEEDED');
      expect((RedisCache as any).is429Error(error)).toBe(true);
    });

    it('should return false for non-429 errors', () => {
      const error = { status: 500 };
      expect((RedisCache as any).is429Error(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect((RedisCache as any).is429Error(null)).toBe(false);
      expect((RedisCache as any).is429Error(undefined)).toBe(false);
    });

    it('should return false for errors without message', () => {
      const error = { status: 404 };
      expect((RedisCache as any).is429Error(error)).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should invalidate cache pattern', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', ['key1', 'key2']]);
      mockRedisClient.del.mockResolvedValue(2);

      const result = await RedisCache.invalidate('test:*');

      expect(result).toBe(2);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Invalidated 2 keys matching: test:*')
      );
    });

    it('should handle no matching keys', async () => {
      mockRedisClient.scan.mockResolvedValue(['0', []]);

      const result = await RedisCache.invalidate('test:*');

      expect(result).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Invalidated 0 keys'));
    });
  });

  describe('isEnabled', () => {
    const originalEnv = process.env.CACHE_ENABLED;

    afterEach(() => {
      process.env.CACHE_ENABLED = originalEnv;
    });

    it('should return true when Redis available and not disabled', () => {
      delete process.env.CACHE_ENABLED;
      mockRedisClientManager.isAvailable.mockReturnValue(true);

      expect(RedisCache.isEnabled()).toBe(true);
    });

    it('should return false when CACHE_ENABLED=false', () => {
      process.env.CACHE_ENABLED = 'false';

      expect(RedisCache.isEnabled()).toBe(false);
    });

    it('should return false when CACHE_ENABLED=0', () => {
      process.env.CACHE_ENABLED = '0';

      expect(RedisCache.isEnabled()).toBe(false);
    });

    it('should return true when CACHE_ENABLED=true', () => {
      process.env.CACHE_ENABLED = 'true';
      mockRedisClientManager.isAvailable.mockReturnValue(true);

      expect(RedisCache.isEnabled()).toBe(true);
    });

    it('should return false when Redis unavailable', () => {
      delete process.env.CACHE_ENABLED;
      mockRedisClientManager.isAvailable.mockReturnValue(false);

      expect(RedisCache.isEnabled()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = RedisCache.getStats();

      expect(stats).toEqual({ hits: 10, misses: 5 });
      expect(mockCacheStats.toJSON).toHaveBeenCalled();
    });
  });

  describe('clearPendingRequests', () => {
    it('should clear pending requests map', () => {
      // Add a pending request
      (RedisCache as any).pendingRequests.set('test-key', Promise.resolve('data'));

      expect((RedisCache as any).pendingRequests.size).toBe(1);

      RedisCache.clearPendingRequests();

      expect((RedisCache as any).pendingRequests.size).toBe(0);
    });

    it('should work when map is already empty', () => {
      RedisCache.clearPendingRequests();

      expect((RedisCache as any).pendingRequests.size).toBe(0);

      // Should not throw
      RedisCache.clearPendingRequests();
    });
  });
});
