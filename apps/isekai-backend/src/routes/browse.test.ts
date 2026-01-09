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

// Mock dependencies
vi.mock('../lib/deviantart.js', () => ({
  refreshTokenIfNeeded: vi.fn(),
}));

vi.mock('../lib/redis-cache.js', () => ({
  RedisCache: {
    getOrFetch: vi.fn(),
  },
  CacheTTL: {
    TAG_SEARCH: 3600,
    DEVIATION_METADATA: 1800,
    TOPICS: 7200,
  },
}));

vi.mock('../lib/cache-keys.js', () => ({
  CacheKeys: {
    tag: {
      search: vi.fn((tag: string) => `tag:search:${tag}`),
    },
    browse: {
      morelikethis: vi.fn((id: string) => `browse:morelikethis:${id}`),
      deviation: vi.fn((id: string) => `browse:deviation:${id}`),
    },
    topic: {
      list: vi.fn(() => 'topic:list'),
      top: vi.fn(() => 'topic:top'),
      trendingTags: vi.fn(() => 'topic:trending'),
    },
  },
}));

vi.mock('../lib/browse-cache.js', () => ({
  generateCacheKey: vi.fn(
    (params: any, userId?: string) => `browse:${params.mode}:${userId || 'global'}`
  ),
  getCachedBrowseResponse: vi.fn(),
  setCachedBrowseResponse: vi.fn(),
  isPerUserMode: vi.fn((mode: string) => mode === 'following'),
}));

vi.mock('../lib/browse-source.js', () => ({
  getBrowseSource: vi.fn((mode: string) => ({
    source: mode,
    endpoint: '/browse/home',
  })),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

import { browseRouter } from './browse.js';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';
import { RedisCache } from '../lib/redis-cache.js';
import { CacheKeys } from '../lib/cache-keys.js';
import { getCachedBrowseResponse, setCachedBrowseResponse } from '../lib/browse-cache.js';

const mockRefreshTokenIfNeeded = vi.mocked(refreshTokenIfNeeded);
const mockGetOrFetch = vi.mocked(RedisCache.getOrFetch);
const mockGetCachedBrowseResponse = vi.mocked(getCachedBrowseResponse);
const mockSetCachedBrowseResponse = vi.mocked(setCachedBrowseResponse);

describe('Browse Routes', () => {
  const mockUser = {
    id: 'user-123',
    daUserId: 'da-user-123',
    daUsername: 'testuser',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshTokenIfNeeded.mockResolvedValue('mock-access-token');
    mockSetCachedBrowseResponse.mockResolvedValue(undefined);

    // Suppress console.error and console.log during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  async function callRoute(method: string, path: string, req: any, res: any) {
    const routes = (browseRouter as any).stack;
    const route = routes.find((r: any) => {
      if (!r.route?.path) return false;
      if (!r.route.methods?.[method.toLowerCase()]) return false;

      // Exact match for non-param routes
      if (!r.route.path.includes(':')) {
        return r.route.path === path;
      }

      // Param match for routes like /deviation/:deviationId
      const pathParts = path.split('/');
      const routeParts = r.route.path.split('/');
      if (pathParts.length !== routeParts.length) return false;

      return routeParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
    });
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const handler = route.route.stack[route.route.stack.length - 1].handle;
    await handler(req, res);
  }

  describe('GET /tags/search', () => {
    it('should return empty array for missing tag_name', async () => {
      const req = {
        user: mockUser,
        query: {},
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/tags/search', req, res);

      expect(res.json).toHaveBeenCalledWith({ tags: [] });
    });

    it('should return empty array for tag_name less than 2 characters', async () => {
      const req = {
        user: mockUser,
        query: { tag_name: 'a' },
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/tags/search', req, res);

      expect(res.json).toHaveBeenCalledWith({ tags: [] });
    });

    it('should fetch tags successfully from cache', async () => {
      const mockTags = ['landscape', 'fantasy', 'digital art'];

      mockGetOrFetch.mockResolvedValue({
        data: { tags: mockTags },
      });

      const req = {
        user: mockUser,
        query: { tag_name: 'land' },
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/tags/search', req, res);

      expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(mockUser);
      expect(mockGetOrFetch).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ tags: mockTags });
    });

    it('should handle API error gracefully', async () => {
      mockGetOrFetch.mockResolvedValue({
        data: { tags: [] },
      });

      const req = {
        user: mockUser,
        query: { tag_name: 'test' },
      };
      const res = {
        json: vi.fn(),
      };

      await callRoute('get', '/tags/search', req, res);

      expect(res.json).toHaveBeenCalledWith({ tags: [] });
    });
  });

  describe('GET /morelikethis/:deviationId', () => {
    it('should fetch similar deviations successfully', async () => {
      const mockData = {
        deviations: [
          {
            deviationId: 'dev-1',
            title: 'Similar Art 1',
            url: 'https://example.com/1',
          },
        ],
        seed: {
          deviationId: 'seed-dev',
          title: 'Seed Deviation',
        },
        author: {
          username: 'artist',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      };

      mockGetOrFetch.mockResolvedValue({ data: mockData });

      const req = {
        user: mockUser,
        params: { deviationId: 'test-dev-123' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/morelikethis/test-dev-123', req, res);

      expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(mockUser);
      expect(res.json).toHaveBeenCalledWith(mockData);
    });

    it('should handle API error', async () => {
      const error = new Error('Failed to fetch');
      (error as any).status = 404;
      mockGetOrFetch.mockRejectedValue(error);

      const req = {
        user: mockUser,
        params: { deviationId: 'invalid-dev' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/morelikethis/invalid-dev', req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch' });
    });
  });

  describe('GET /topics/list', () => {
    it('should fetch topics successfully', async () => {
      const mockTopics = {
        topics: [
          {
            name: 'Fantasy Art',
            canonicalName: 'fantasy-art',
            exampleDeviations: [],
          },
        ],
        hasMore: false,
      };

      mockGetOrFetch.mockResolvedValue({ data: mockTopics });

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/topics/list', req, res);

      expect(res.json).toHaveBeenCalledWith(mockTopics);
    });

    it('should handle API error', async () => {
      const error = new Error('Failed to fetch topics');
      (error as any).status = 500;
      mockGetOrFetch.mockRejectedValue(error);

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/topics/list', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch topics' });
    });
  });

  describe('GET /toptopics', () => {
    it('should fetch top topics successfully', async () => {
      const mockTopics = {
        topics: [
          {
            name: 'Trending Fantasy',
            canonicalName: 'trending-fantasy',
            exampleDeviation: null,
          },
        ],
      };

      mockGetOrFetch.mockResolvedValue({ data: mockTopics });

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/toptopics', req, res);

      expect(res.json).toHaveBeenCalledWith(mockTopics);
    });
  });

  describe('GET /trendingtags', () => {
    it('should fetch trending tags successfully', async () => {
      const mockTags = {
        tags: [
          { name: 'fantasy', count: 100 },
          { name: 'digital', count: 99 },
        ],
      };

      mockGetOrFetch.mockResolvedValue({ data: mockTags });

      const req = {
        user: mockUser,
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/trendingtags', req, res);

      expect(res.json).toHaveBeenCalledWith(mockTags);
    });
  });

  describe('GET /deviation/:deviationId', () => {
    it('should fetch deviation details successfully', async () => {
      const mockDeviation = {
        deviationId: 'dev-123',
        title: 'Test Deviation',
        url: 'https://example.com/dev',
        isDownloadable: false,
      };

      mockGetOrFetch.mockResolvedValue({ data: mockDeviation });

      const req = {
        user: mockUser,
        params: { deviationId: 'dev-123' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/deviation/dev-123', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviationId: 'dev-123',
          title: 'Test Deviation',
          downloadUrl: null,
          downloadFilesize: null,
        })
      );
    });

    it('should fetch download URL for downloadable deviation', async () => {
      const mockDeviation = {
        deviationId: 'dev-123',
        title: 'Test Deviation',
        isDownloadable: true,
      };

      mockGetOrFetch.mockResolvedValue({ data: mockDeviation });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          src: 'https://download.example.com/file.jpg',
          filesize: 1024000,
        }),
      } as any);

      const req = {
        user: mockUser,
        params: { deviationId: 'dev-123' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/deviation/dev-123', req, res);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.deviantart.com/api/v1/oauth2/deviation/download/dev-123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-access-token' },
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: 'https://download.example.com/file.jpg',
          downloadFilesize: 1024000,
        })
      );
    });

    it('should handle download fetch failure gracefully', async () => {
      const mockDeviation = {
        deviationId: 'dev-123',
        isDownloadable: true,
      };

      mockGetOrFetch.mockResolvedValue({ data: mockDeviation });
      mockFetch.mockRejectedValue(new Error('Download failed'));

      const req = {
        user: mockUser,
        params: { deviationId: 'dev-123' },
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/deviation/dev-123', req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: null,
          downloadFilesize: null,
        })
      );
    });
  });

  describe('GET /:mode', () => {
    it('should return cached browse response', async () => {
      const mockResponse = {
        deviations: [{ deviationId: 'dev-1', title: 'Test' }],
        hasMore: false,
        nextOffset: 24,
      };

      mockGetCachedBrowseResponse.mockResolvedValue(mockResponse);

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('should fetch from API when cache miss', async () => {
      mockGetCachedBrowseResponse.mockResolvedValue(null);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              deviationid: 'dev-1',
              title: 'Test Deviation',
              author: { username: 'artist' },
              stats: { favourites: 10 },
            },
          ],
          has_more: false,
        }),
      } as any);

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(mockFetch).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          deviations: expect.any(Array),
          hasMore: false,
        })
      );
    });

    it('should handle invalid browse mode', async () => {
      mockGetCachedBrowseResponse.mockResolvedValue(null);

      const req = {
        user: mockUser,
        params: { mode: 'invalid-mode' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/invalid-mode', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid browse mode: invalid-mode' });
    });

    it('should handle user-gallery mode without username', async () => {
      mockGetCachedBrowseResponse.mockResolvedValue(null);

      const req = {
        user: mockUser,
        params: { mode: 'user-gallery' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/user-gallery', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username required for user-gallery mode' });
    });

    it('should handle rate limit with cached fallback', async () => {
      const mockCachedResponse = {
        deviations: [{ deviationId: 'cached-1' }],
        hasMore: false,
      };

      mockGetCachedBrowseResponse
        .mockResolvedValueOnce(null) // First call - cache miss
        .mockResolvedValueOnce(mockCachedResponse); // Second call - return stale cache

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      } as any);

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(mockGetCachedBrowseResponse).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith(mockCachedResponse);
    });

    it('should handle rate limit without cached fallback', async () => {
      mockGetCachedBrowseResponse.mockResolvedValue(null);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      } as any);

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate limited by DeviantArt. Please try again later.',
        retryAfter: 300,
      });
    });

    it('should handle API error', async () => {
      mockGetCachedBrowseResponse.mockResolvedValue(null);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal server error'),
      } as any);

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch browse data' });
    });

    it('should handle generic error', async () => {
      mockGetCachedBrowseResponse.mockRejectedValue(new Error('Cache error'));

      const req = {
        user: mockUser,
        params: { mode: 'home' },
        query: {},
      };
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await callRoute('get', '/home', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
