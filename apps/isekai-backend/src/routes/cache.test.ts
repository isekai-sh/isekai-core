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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

// Mock dependencies
vi.mock('../lib/cache-stats.js', () => ({
  CacheStats: {
    getDetailedStats: vi.fn(),
    reset: vi.fn(),
    logSummary: vi.fn(),
  },
}));

vi.mock('../lib/circuit-breaker.js', () => ({
  CircuitBreaker: {
    getAllStatuses: vi.fn(),
    isEnabled: vi.fn(),
    getFailureThreshold: vi.fn(),
    reset: vi.fn(),
    resetAll: vi.fn(),
  },
}));

vi.mock('../lib/redis-client.js', () => ({
  RedisClientManager: {
    isAvailable: vi.fn(),
    getStatus: vi.fn(),
    getLatency: vi.fn(),
  },
}));

vi.mock('../lib/redis-cache.js', () => ({
  RedisCache: {
    invalidate: vi.fn(),
  },
}));

import { cacheRouter } from './cache.js';
import { CacheStats } from '../lib/cache-stats.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';
import { RedisClientManager } from '../lib/redis-client.js';
import { RedisCache } from '../lib/redis-cache.js';

// Helper to call route handlers directly
async function callRoute(method: string, path: string, req: any, res: any) {
  const routes = (cacheRouter as any).stack;
  const route = routes.find(
    (r: any) => r.route?.path === path && r.route?.methods?.[method.toLowerCase()]
  );

  if (!route) {
    throw new Error(`Route ${method} ${path} not found`);
  }

  const handler = route.route.stack[0].handle;
  await handler(req, res);
}

describe('cache routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mocks
    (CacheStats.getDetailedStats as any).mockReturnValue({
      uptime: 120000,
      startTime: new Date('2025-12-21T10:00:00Z'),
      overall: {
        hitRate: 0.75,
        totalRequests: 100,
        hits: 75,
        misses: 25,
        staleServes: 5,
        rateLimitErrors: 0,
      },
      byNamespace: {
        browse: {
          hitRate: 0.8,
          totalRequests: 50,
          hits: 40,
          misses: 10,
          staleServes: 2,
          rateLimitErrors: 0,
        },
      },
      coalescedRequests: 10,
    });

    (CircuitBreaker.getAllStatuses as any).mockReturnValue({});
    (CircuitBreaker.isEnabled as any).mockReturnValue(true);
    (CircuitBreaker.getFailureThreshold as any).mockReturnValue(5);

    (RedisClientManager.isAvailable as any).mockReturnValue(true);
    (RedisClientManager.getStatus as any).mockReturnValue('connected');
    (RedisClientManager.getLatency as any).mockResolvedValue(5);
  });

  describe('GET /stats - Get cache statistics', () => {
    it('should return detailed cache statistics', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/stats', req, res);

      expect(res.json).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        uptime: 120,
        startTime: '2025-12-21T10:00:00.000Z',
        redis: {
          available: true,
          status: 'connected',
          latency: 5,
        },
        overall: {
          hitRate: '75.00%',
          totalRequests: 100,
          hits: 75,
          misses: 25,
          staleServes: 5,
          rateLimitErrors: 0,
        },
        byNamespace: {
          browse: {
            hitRate: '80.00%',
            totalRequests: 50,
            hits: 40,
            misses: 10,
            staleServes: 2,
            rateLimitErrors: 0,
          },
        },
        coalescedRequests: 10,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          circuits: {},
        },
      });
    });

    it('should format hit rates as percentages', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 120000,
        startTime: new Date(),
        overall: { hitRate: 0.8333 },
        byNamespace: {
          test: { hitRate: 0.6666 },
        },
        coalescedRequests: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/stats', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.overall.hitRate).toBe('83.33%');
      expect(responseData.byNamespace.test.hitRate).toBe('66.66%');
    });

    it('should convert uptime from milliseconds to seconds', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 456789,
        startTime: new Date(),
        overall: { hitRate: 0.5 },
        byNamespace: {},
        coalescedRequests: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/stats', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.uptime).toBe(456);
    });

    it('should include circuit breaker information', async () => {
      (CircuitBreaker.getAllStatuses as any).mockReturnValue({
        'service-1': { state: 'OPEN' },
        'service-2': { state: 'CLOSED' },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/stats', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.circuitBreaker.circuits).toEqual({
        'service-1': { state: 'OPEN' },
        'service-2': { state: 'CLOSED' },
      });
    });

    it('should return 500 on error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (CacheStats.getDetailedStats as any).mockImplementation(() => {
        throw new Error('Stats error');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/stats', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to fetch cache statistics',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /reset - Reset cache statistics', () => {
    it('should reset cache statistics', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('POST', '/reset', req, res);

      expect(CacheStats.reset).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cache statistics reset successfully',
        timestamp: expect.any(String),
      });
    });

    it('should return 500 on error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (CacheStats.reset as any).mockImplementation(() => {
        throw new Error('Reset error');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('POST', '/reset', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to reset cache statistics',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /invalidate - Invalidate cache by pattern', () => {
    it('should invalidate cache with valid pattern', async () => {
      const req = createMockRequest({
        body: { pattern: 'isekai:v1:browse:user:123:*' },
      });
      const res = createMockResponse();

      (RedisCache.invalidate as any).mockResolvedValue(42);

      await callRoute('POST', '/invalidate', req, res);

      expect(RedisCache.invalidate).toHaveBeenCalledWith('isekai:v1:browse:user:123:*');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        deletedCount: 42,
        pattern: 'isekai:v1:browse:user:123:*',
        timestamp: expect.any(String),
      });
    });

    it('should return 400 when pattern is missing', async () => {
      const req = createMockRequest({
        body: {},
      });
      const res = createMockResponse();

      await callRoute('POST', '/invalidate', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Pattern is required',
      });
      expect(RedisCache.invalidate).not.toHaveBeenCalled();
    });

    it('should return 400 when pattern is not a string', async () => {
      const req = createMockRequest({
        body: { pattern: 123 },
      });
      const res = createMockResponse();

      await callRoute('POST', '/invalidate', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Pattern is required',
      });
    });

    it('should return 500 on invalidation error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        body: { pattern: 'test:*' },
      });
      const res = createMockResponse();

      (RedisCache.invalidate as any).mockRejectedValue(new Error('Invalidation failed'));

      await callRoute('POST', '/invalidate', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to invalidate cache',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /circuit-breaker/reset - Reset specific circuit breaker', () => {
    it('should reset specific circuit breaker', async () => {
      const req = createMockRequest({
        body: { key: 'browse:tags' },
      });
      const res = createMockResponse();

      await callRoute('POST', '/circuit-breaker/reset', req, res);

      expect(CircuitBreaker.reset).toHaveBeenCalledWith('browse:tags');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Circuit breaker for "browse:tags" reset successfully',
        timestamp: expect.any(String),
      });
    });

    it('should return 400 when key is missing', async () => {
      const req = createMockRequest({
        body: {},
      });
      const res = createMockResponse();

      await callRoute('POST', '/circuit-breaker/reset', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Circuit key is required',
      });
      expect(CircuitBreaker.reset).not.toHaveBeenCalled();
    });

    it('should return 400 when key is not a string', async () => {
      const req = createMockRequest({
        body: { key: 456 },
      });
      const res = createMockResponse();

      await callRoute('POST', '/circuit-breaker/reset', req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Circuit key is required',
      });
    });

    it('should return 500 on reset error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest({
        body: { key: 'test' },
      });
      const res = createMockResponse();

      (CircuitBreaker.reset as any).mockImplementation(() => {
        throw new Error('Reset failed');
      });

      await callRoute('POST', '/circuit-breaker/reset', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to reset circuit breaker',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /circuit-breaker/reset-all - Reset all circuit breakers', () => {
    it('should reset all circuit breakers', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('POST', '/circuit-breaker/reset-all', req, res);

      expect(CircuitBreaker.resetAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All circuit breakers reset successfully',
        timestamp: expect.any(String),
      });
    });

    it('should return 500 on reset error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest();
      const res = createMockResponse();

      (CircuitBreaker.resetAll as any).mockImplementation(() => {
        throw new Error('Reset all failed');
      });

      await callRoute('POST', '/circuit-breaker/reset-all', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to reset circuit breakers',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('GET /summary - Get cache summary', () => {
    it('should return cache summary', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/summary', req, res);

      expect(CacheStats.logSummary).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        summary: {
          hitRate: '75.00%',
          totalRequests: 100,
          hits: 75,
          misses: 25,
          staleServes: 5,
          rateLimitErrors: 0,
          coalescedRequests: 10,
          uptime: '120s',
        },
      });
    });

    it('should format uptime with seconds suffix', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 456789,
        startTime: new Date(),
        overall: {
          hitRate: 0.5,
          totalRequests: 10,
          hits: 5,
          misses: 5,
          staleServes: 0,
          rateLimitErrors: 0,
        },
        byNamespace: {},
        coalescedRequests: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/summary', req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.summary.uptime).toBe('456s');
    });

    it('should return 500 on error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (CacheStats.logSummary as any).mockImplementation(() => {
        throw new Error('Summary error');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callRoute('GET', '/summary', req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to fetch cache summary',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('timestamp formatting', () => {
    it('should include ISO timestamp in all success responses', async () => {
      const routes = [
        { method: 'POST', path: '/reset', body: {} },
        { method: 'POST', path: '/invalidate', body: { pattern: 'test:*' } },
        { method: 'POST', path: '/circuit-breaker/reset', body: { key: 'test' } },
        { method: 'POST', path: '/circuit-breaker/reset-all', body: {} },
        { method: 'GET', path: '/summary', body: {} },
        { method: 'GET', path: '/stats', body: {} },
      ];

      (RedisCache.invalidate as any).mockResolvedValue(0);

      for (const route of routes) {
        // Reset mocks and restore default implementations
        (CacheStats.reset as any).mockImplementation(() => {});
        (CacheStats.logSummary as any).mockImplementation(() => {});
        (CircuitBreaker.reset as any).mockImplementation(() => {});
        (CircuitBreaker.resetAll as any).mockImplementation(() => {});

        const req = createMockRequest({ body: route.body });
        const res = createMockResponse();

        await callRoute(route.method, route.path, req, res);

        const responseData = (res.json as any).mock.calls[0][0];
        expect(responseData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });
});
