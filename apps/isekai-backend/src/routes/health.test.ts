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
vi.mock('../lib/redis-client.js', () => ({
  RedisClientManager: {
    isAvailable: vi.fn(),
    getStatus: vi.fn(),
    getLatency: vi.fn(),
  },
}));

vi.mock('../lib/cache-stats.js', () => ({
  CacheStats: {
    getDetailedStats: vi.fn(),
  },
}));

vi.mock('../lib/circuit-breaker.js', () => ({
  CircuitBreaker: {
    getAllStatuses: vi.fn(),
    isEnabled: vi.fn(),
  },
}));

import { healthRouter } from './health.js';
import { RedisClientManager } from '../lib/redis-client.js';
import { CacheStats } from '../lib/cache-stats.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

// Helper to call the route handler directly
async function callHealthRoute(req: any, res: any) {
  const routes = (healthRouter as any).stack;
  const getRoute = routes.find((r: any) => r.route?.path === '/');
  const handler = getRoute.route.stack[0].handle;
  await handler(req, res);
}

describe('health route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mocks
    (RedisClientManager.isAvailable as any).mockReturnValue(true);
    (RedisClientManager.getStatus as any).mockReturnValue('connected');
    (RedisClientManager.getLatency as any).mockResolvedValue(5);

    (CacheStats.getDetailedStats as any).mockReturnValue({
      uptime: 120000, // 120 seconds in ms
      overall: {
        hitRate: 0.75,
        totalRequests: 100,
        hits: 75,
        misses: 25,
        staleServes: 5,
        rateLimitErrors: 0,
      },
      coalescedRequests: 10,
    });

    (CircuitBreaker.getAllStatuses as any).mockReturnValue({});
    (CircuitBreaker.isEnabled as any).mockReturnValue(true);
  });

  describe('healthy status', () => {
    it('should return healthy status when all systems are operational', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: 120,
          redis: {
            available: true,
            status: 'connected',
            latency: 5,
          },
          cache: {
            hitRate: '75.00%',
            totalRequests: 100,
            hits: 75,
            misses: 25,
            staleServes: 5,
            rateLimitErrors: 0,
            coalescedRequests: 10,
          },
          circuitBreaker: {
            enabled: true,
            openCircuits: 0,
          },
        })
      );
    });

    it('should not include issues field when healthy', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.issues).toBeUndefined();
    });

    it('should format timestamp as ISO string', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should convert uptime from milliseconds to seconds', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 300000, // 300 seconds in ms
        overall: {
          hitRate: 0.75,
          totalRequests: 100,
          hits: 75,
          misses: 25,
          staleServes: 5,
          rateLimitErrors: 0,
        },
        coalescedRequests: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.uptime).toBe(300);
    });

    it('should format hit rate as percentage with 2 decimal places', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 120000,
        overall: {
          hitRate: 0.8333333,
          totalRequests: 100,
          hits: 75,
          misses: 25,
          staleServes: 5,
          rateLimitErrors: 0,
        },
        coalescedRequests: 10,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.cache.hitRate).toBe('83.33%');
    });
  });

  describe('degraded status - Redis issues', () => {
    it('should return degraded status when Redis is unavailable', async () => {
      (RedisClientManager.isAvailable as any).mockReturnValue(false);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toContain('Redis unavailable - caching disabled');
      expect(responseData.redis.available).toBe(false);
      expect(responseData.redis.latency).toBeNull();
    });

    it('should not call getLatency when Redis is unavailable', async () => {
      (RedisClientManager.isAvailable as any).mockReturnValue(false);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      expect(RedisClientManager.getLatency).not.toHaveBeenCalled();
    });

    it('should return degraded status when Redis latency is high', async () => {
      (RedisClientManager.getLatency as any).mockResolvedValue(150);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toContain('Redis latency high (150ms)');
      expect(responseData.redis.latency).toBe(150);
    });

    it('should not mark as degraded when Redis latency is exactly 100ms', async () => {
      (RedisClientManager.getLatency as any).mockResolvedValue(100);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('healthy');
      expect(responseData.issues).toBeUndefined();
    });

    it('should mark as degraded when Redis latency exceeds 100ms', async () => {
      (RedisClientManager.getLatency as any).mockResolvedValue(101);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
    });
  });

  describe('degraded status - Circuit breaker', () => {
    it('should return degraded status when circuit breakers are open', async () => {
      (CircuitBreaker.getAllStatuses as any).mockReturnValue({
        'deviantart-api': { state: 'OPEN' },
        'another-service': { state: 'CLOSED' },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toContain('1 circuit breaker(s) open');
      expect(responseData.circuitBreaker.openCircuits).toBe(1);
    });

    it('should count multiple open circuit breakers', async () => {
      (CircuitBreaker.getAllStatuses as any).mockReturnValue({
        'service-1': { state: 'OPEN' },
        'service-2': { state: 'OPEN' },
        'service-3': { state: 'HALF_OPEN' },
        'service-4': { state: 'CLOSED' },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toContain('2 circuit breaker(s) open');
      expect(responseData.circuitBreaker.openCircuits).toBe(2);
    });

    it('should include circuit breaker enabled status', async () => {
      (CircuitBreaker.isEnabled as any).mockReturnValue(false);

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.circuitBreaker.enabled).toBe(false);
    });
  });

  describe('multiple issues', () => {
    it('should report all issues when multiple problems exist', async () => {
      (RedisClientManager.isAvailable as any).mockReturnValue(false);
      (CircuitBreaker.getAllStatuses as any).mockReturnValue({
        'service-1': { state: 'OPEN' },
        'service-2': { state: 'OPEN' },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toHaveLength(2);
      expect(responseData.issues).toContain('Redis unavailable - caching disabled');
      expect(responseData.issues).toContain('2 circuit breaker(s) open');
    });

    it('should report all three types of issues when present', async () => {
      (RedisClientManager.isAvailable as any).mockReturnValue(true);
      (RedisClientManager.getLatency as any).mockResolvedValue(200);
      (CircuitBreaker.getAllStatuses as any).mockReturnValue({
        'service-1': { state: 'OPEN' },
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.status).toBe('degraded');
      expect(responseData.issues).toHaveLength(2);
      expect(responseData.issues).toContain('Redis latency high (200ms)');
      expect(responseData.issues).toContain('1 circuit breaker(s) open');
    });
  });

  describe('error handling', () => {
    it('should return 500 when health check throws error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      (RedisClientManager.isAvailable as any).mockImplementation(() => {
        throw new Error('Redis client error');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'unhealthy',
        timestamp: expect.any(String),
        error: 'Health check failed',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Health check error:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should log errors during health check', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Unexpected error');
      (CacheStats.getDetailedStats as any).mockImplementation(() => {
        throw error;
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Health check error:', error);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cache statistics', () => {
    it('should include all cache metrics', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 120000,
        overall: {
          hitRate: 0.65,
          totalRequests: 200,
          hits: 130,
          misses: 70,
          staleServes: 15,
          rateLimitErrors: 3,
        },
        coalescedRequests: 25,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.cache).toEqual({
        hitRate: '65.00%',
        totalRequests: 200,
        hits: 130,
        misses: 70,
        staleServes: 15,
        rateLimitErrors: 3,
        coalescedRequests: 25,
      });
    });

    it('should handle zero hit rate', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 120000,
        overall: {
          hitRate: 0,
          totalRequests: 100,
          hits: 0,
          misses: 100,
          staleServes: 0,
          rateLimitErrors: 0,
        },
        coalescedRequests: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.cache.hitRate).toBe('0.00%');
    });

    it('should handle 100% hit rate', async () => {
      (CacheStats.getDetailedStats as any).mockReturnValue({
        uptime: 120000,
        overall: {
          hitRate: 1,
          totalRequests: 100,
          hits: 100,
          misses: 0,
          staleServes: 0,
          rateLimitErrors: 0,
        },
        coalescedRequests: 0,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await callHealthRoute(req, res);

      const responseData = (res.json as any).mock.calls[0][0];
      expect(responseData.cache.hitRate).toBe('100.00%');
    });
  });
});
