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
import { AdaptiveRateLimiter } from './rate-limiter';
import { createRedisMock } from '../test-helpers/redis-mock';

describe('AdaptiveRateLimiter', () => {
  let redis: any;
  let limiter: AdaptiveRateLimiter;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      RATE_LIMITER_ENABLED: 'true',
      RATE_LIMITER_BASE_DELAY_MS: '3000',
      RATE_LIMITER_MAX_DELAY_MS: '300000',
      RATE_LIMITER_JITTER_PERCENT: '20',
      RATE_LIMITER_SUCCESS_DECREASE_FACTOR: '0.9',
      RATE_LIMITER_FAILURE_INCREASE_FACTOR: '2.0',
    };
    redis = createRedisMock();

    // Clear Redis state between tests
    redis.flushdb();

    // Mock eval() for Lua script support (ioredis-mock doesn't support eval)
    // Simulate the atomic check-and-update behavior
    redis.eval = vi.fn().mockImplementation(async (script, numKeys, key, requiredDelay, now) => {
      const stateData = await redis.get(key);

      if (!stateData) {
        // No state exists, allow and create initial state
        const newState = {
          retryAfter: null,
          lastRequestTime: parseInt(now),
          consecutiveSuccesses: 0,
          consecutiveFailures: 0,
          baseDelay: parseInt(requiredDelay),
        };
        await redis.setex(key, 3600, JSON.stringify(newState));
        return 1;
      }

      const state = JSON.parse(stateData);
      const lastRequestTime = state.lastRequestTime || 0;
      const timeSinceLastRequest = parseInt(now) - lastRequestTime;

      if (timeSinceLastRequest < parseInt(requiredDelay)) {
        return 0; // Denied
      }

      // Update lastRequestTime
      state.lastRequestTime = parseInt(now);
      await redis.setex(key, 3600, JSON.stringify(state));
      return 1; // Allowed
    });

    limiter = new AdaptiveRateLimiter(redis);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with environment configuration', () => {
      expect(limiter).toBeDefined();
      // Private fields not directly testable, but will validate through behavior
    });

    it('should use default values when env vars not set', () => {
      delete process.env.RATE_LIMITER_BASE_DELAY_MS;
      const defaultLimiter = new AdaptiveRateLimiter(redis);
      expect(defaultLimiter).toBeDefined();
    });
  });

  describe('shouldAllowRequest', () => {
    it('should allow request when no state exists', async () => {
      const result = await limiter.shouldAllowRequest('user-1');

      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });

    it('should deny request when retry-after is active', async () => {
      // Set a retry-after in the future
      const retryAfter = Date.now() + 5000;
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      }));

      const result = await limiter.shouldAllowRequest('user-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('RETRY_AFTER');
      expect(result.waitMs).toBeGreaterThan(0);
      expect(result.waitMs).toBeLessThanOrEqual(5000);
    });

    it('should allow request when retry-after has expired', async () => {
      // Set a retry-after in the past
      const retryAfter = Date.now() - 1000;
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter,
        lastRequestTime: Date.now() - 10000,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      }));

      const result = await limiter.shouldAllowRequest('user-1');

      expect(result.allowed).toBe(true);
    });

    it('should work when rate limiter is disabled', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const disabledLimiter = new AdaptiveRateLimiter(redis);

      const result = await disabledLimiter.shouldAllowRequest('user-1');

      expect(result.allowed).toBe(true);
    });

    it('should work without Redis (fallback mode)', async () => {
      const noRedisLimiter = new AdaptiveRateLimiter(null);

      const result = await noRedisLimiter.shouldAllowRequest('user-1');

      expect(result.allowed).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('should update state after successful request', async () => {
      await limiter.recordSuccess('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.consecutiveSuccesses).toBe(1);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.retryAfter).toBeNull();
    });

    it('should decrease base delay after 3 consecutive successes', async () => {
      // Set initial state with high base delay
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 0,
        baseDelay: 10000,
      }));

      await limiter.recordSuccess('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.baseDelay).toBeLessThan(10000);
      expect(state.baseDelay).toBeGreaterThanOrEqual(3000); // Min is baseDelayMs
      expect(state.consecutiveSuccesses).toBe(0); // Reset after adjustment
    });

    it('should not decrease below base delay', async () => {
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 0,
        baseDelay: 3000, // Already at minimum
      }));

      await limiter.recordSuccess('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.baseDelay).toBe(3000);
    });

    it('should do nothing when disabled', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const disabledLimiter = new AdaptiveRateLimiter(redis);

      await disabledLimiter.recordSuccess('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      expect(stateData).toBeNull();
    });
  });

  describe('recordFailure', () => {
    it('should update state after failed request', async () => {
      await limiter.recordFailure('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.consecutiveFailures).toBe(1);
      expect(state.consecutiveSuccesses).toBe(0);
      expect(state.baseDelay).toBeGreaterThan(3000);
    });

    it('should parse and store Retry-After header (seconds)', async () => {
      await limiter.recordFailure('user-1', '120');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.retryAfter).toBeGreaterThan(Date.now());
      expect(state.retryAfter).toBeLessThanOrEqual(Date.now() + 120000);
    });

    it('should parse and store Retry-After header (HTTP-date)', async () => {
      const futureDate = new Date(Date.now() + 60000);
      await limiter.recordFailure('user-1', futureDate.toUTCString());

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.retryAfter).toBeGreaterThan(Date.now());
    });

    it('should increase base delay exponentially', async () => {
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      }));

      await limiter.recordFailure('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.baseDelay).toBe(6000); // 3000 * 2.0
    });

    it('should not exceed max delay', async () => {
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 200000,
      }));

      await limiter.recordFailure('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      const state = JSON.parse(stateData);

      expect(state.baseDelay).toBeLessThanOrEqual(300000); // maxDelayMs
    });
  });

  describe('parseRetryAfter', () => {
    it('should parse seconds format', () => {
      expect(limiter.parseRetryAfter('60')).toBe(60);
      expect(limiter.parseRetryAfter('120')).toBe(120);
    });

    it('should parse HTTP-date format', () => {
      const futureDate = new Date(Date.now() + 60000);
      const seconds = limiter.parseRetryAfter(futureDate.toUTCString());

      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(60);
    });

    it('should return 0 for invalid formats', () => {
      expect(limiter.parseRetryAfter('')).toBe(0);
      expect(limiter.parseRetryAfter('invalid')).toBe(0);
      expect(limiter.parseRetryAfter('-10')).toBe(0);
    });

    it('should return 0 for past dates', () => {
      const pastDate = new Date(Date.now() - 10000);
      const seconds = limiter.parseRetryAfter(pastDate.toUTCString());

      expect(seconds).toBe(0);
    });
  });

  describe('getWaitTime', () => {
    it('should return delay with jitter', async () => {
      const waitTime = await limiter.getWaitTime('user-1');

      expect(waitTime).toBeGreaterThan(0);
      // With 20% jitter on 3000ms base: range is 2400-3600
      expect(waitTime).toBeGreaterThanOrEqual(1000); // Min jittered value
      expect(waitTime).toBeLessThanOrEqual(4000);
    });

    it('should vary with jitter', async () => {
      const results = new Set();
      for (let i = 0; i < 10; i++) {
        const waitTime = await limiter.getWaitTime('user-1');
        results.add(waitTime);
      }

      // With jitter, we should get different values (probabilistic test)
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('resetUserLimits', () => {
    it('should delete user rate limit state', async () => {
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      }));

      await limiter.resetUserLimits('user-1');

      const stateData = await redis.get('rate_limit:user-1:state');
      expect(stateData).toBeNull();
    });

    it('should do nothing when Redis is null', async () => {
      const noRedisLimiter = new AdaptiveRateLimiter(null);

      await noRedisLimiter.resetUserLimits('user-1');

      // Should not throw
    });
  });

  describe('getGlobalMetrics', () => {
    it('should return empty metrics when no users exist', async () => {
      const metrics = await limiter.getGlobalMetrics();

      expect(metrics).toEqual({
        totalUsers: 0,
        usersWithActiveLimit: 0,
        avgBaseDelay: 0,
        maxBaseDelay: 0,
      });
    });

    it('should calculate metrics for multiple users', async () => {
      // Add state for multiple users
      await redis.setex('rate_limit:user-1:state', 3600, JSON.stringify({
        retryAfter: Date.now() + 5000,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      }));

      await redis.setex('rate_limit:user-2:state', 3600, JSON.stringify({
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 6000,
      }));

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics.totalUsers).toBe(2);
      expect(metrics.usersWithActiveLimit).toBe(1);
      expect(metrics.avgBaseDelay).toBe(4500); // (3000 + 6000) / 2
      expect(metrics.maxBaseDelay).toBe(6000);
    });

    it('should return empty object when Redis is null', async () => {
      const noRedisLimiter = new AdaptiveRateLimiter(null);

      const metrics = await noRedisLimiter.getGlobalMetrics();

      expect(metrics).toEqual({});
    });

    it('should handle Redis errors gracefully', async () => {
      vi.spyOn(redis, 'keys').mockRejectedValueOnce(new Error('Redis error'));

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics).toEqual({});
      expect(console.error).toHaveBeenCalledWith(
        '[RateLimiter] Error getting global metrics:',
        expect.any(Error)
      );
    });
  });

  describe('Disabled Rate Limiter', () => {
    it('should bypass all checks when RATE_LIMITER_ENABLED is false', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const disabledLimiter = new AdaptiveRateLimiter(redis);

      const result = await disabledLimiter.shouldAllowRequest('user-1');
      expect(result.allowed).toBe(true);

      await disabledLimiter.recordSuccess('user-1');
      await disabledLimiter.recordFailure('user-1');

      // State should not be created
      const stateData = await redis.get('rate_limit:user-1:state');
      expect(stateData).toBeNull();
    });

    it('should bypass when RATE_LIMITER_ENABLED is 0', async () => {
      process.env.RATE_LIMITER_ENABLED = '0';
      const disabledLimiter = new AdaptiveRateLimiter(redis);

      const result = await disabledLimiter.shouldAllowRequest('user-1');
      expect(result.allowed).toBe(true);
    });
  });
});
