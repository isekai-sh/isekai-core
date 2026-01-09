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
import { AdaptiveRateLimiter, type RateLimitState } from './rate-limiter.js';

// Mock logger
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('rate-limiter', () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    eval: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RATE_LIMITER_ENABLED;
    delete process.env.RATE_LIMITER_BASE_DELAY_MS;
    delete process.env.RATE_LIMITER_MAX_DELAY_MS;
    delete process.env.RATE_LIMITER_JITTER_PERCENT;
    delete process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR;
    delete process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR;
  });

  describe('constructor', () => {
    it('should use default configuration', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      expect(limiter).toBeDefined();
    });

    it('should read configuration from environment', () => {
      process.env.RATE_LIMITER_BASE_DELAY_MS = '5000';
      process.env.RATE_LIMITER_MAX_DELAY_MS = '600000';
      process.env.RATE_LIMITER_JITTER_PERCENT = '30';
      process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR = '0.8';
      process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR = '3.0';

      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      expect(limiter).toBeDefined();
    });

    it('should work without Redis', () => {
      const limiter = new AdaptiveRateLimiter(null);
      expect(limiter).toBeDefined();
    });
  });

  describe('shouldAllowRequest', () => {
    it('should allow request when no state exists', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.eval.mockResolvedValue(1); // Lua script returns 1 for allowed

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(true);
    });

    it('should block request during retry-after period', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const futureTime = Date.now() + 10000; // 10 seconds in future

      const state: RateLimitState = {
        retryAfter: futureTime,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('RETRY_AFTER');
      expect(result.waitMs).toBeGreaterThan(0);
      expect(result.waitMs).toBeLessThanOrEqual(10000);
    });

    it('should block request if rate limited by adaptive delay', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const recentTime = Date.now() - 1000; // 1 second ago

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: recentTime,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 5000, // Require 5 second delay
      };

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(state)) // First check
        .mockResolvedValueOnce(JSON.stringify(state)); // Re-fetch for wait time

      mockRedis.eval.mockResolvedValue(0); // Lua script returns 0 for denied

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('ADAPTIVE_DELAY');
      expect(result.waitMs).toBeDefined();
    });

    it('should allow request when disabled', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(true);
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('should allow request when retry-after expired', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const pastTime = Date.now() - 10000; // 10 seconds ago

      const state: RateLimitState = {
        retryAfter: pastTime,
        lastRequestTime: Date.now() - 10000,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));
      mockRedis.eval.mockResolvedValue(1); // Allowed

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(true);
    });

    it('should work without Redis (fallback mode)', async () => {
      const limiter = new AdaptiveRateLimiter(null);

      const result = await limiter.shouldAllowRequest('user-123');

      expect(result.allowed).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    it('should increment consecutive successes and reset failures', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 1,
        consecutiveFailures: 2,
        baseDelay: 5000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordSuccess('user-123');

      expect(mockRedis.setex).toHaveBeenCalled();
      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.consecutiveSuccesses).toBe(2);
      expect(savedState.consecutiveFailures).toBe(0);
    });

    it('should decrease base delay after 3 successes', async () => {
      process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR = '0.9';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 0,
        baseDelay: 10000, // Will decrease to 9000
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordSuccess('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.baseDelay).toBe(9000);
      expect(savedState.consecutiveSuccesses).toBe(0); // Reset after adjustment
    });

    it('should not decrease base delay below minimum', async () => {
      process.env.RATE_LIMITER_BASE_DELAY_MS = '3000';
      process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR = '0.5';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 0,
        baseDelay: 4000, // Will try to decrease to 2000, but clamped to 3000
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordSuccess('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.baseDelay).toBe(3000); // Clamped to minimum
    });

    it('should clear retry-after', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: Date.now() + 10000,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordSuccess('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.retryAfter).toBeNull();
    });

    it('should do nothing when disabled', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      await limiter.recordSuccess('user-123');

      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      await limiter.recordSuccess('user-123');

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    it('should increment consecutive failures and reset successes', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 1,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.consecutiveFailures).toBe(2);
      expect(savedState.consecutiveSuccesses).toBe(0);
    });

    it('should increase base delay', async () => {
      process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR = '2.0';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 5000, // Will increase to 10000
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.baseDelay).toBe(10000);
    });

    it('should not increase base delay above maximum', async () => {
      process.env.RATE_LIMITER_MAX_DELAY_MS = '300000'; // 5 minutes
      process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR = '2.0';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 200000, // Will try to increase to 400000, but clamped
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.baseDelay).toBe(300000); // Clamped
    });

    it('should parse and store retry-after header (seconds)', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123', '120'); // 120 seconds

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.retryAfter).toBeGreaterThan(Date.now() + 119000);
      expect(savedState.retryAfter).toBeLessThan(Date.now() + 121000);
    });

    it('should parse and store retry-after header (HTTP-date)', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123', futureDate.toUTCString());

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.retryAfter).toBeGreaterThan(Date.now() + 55000); // Allow 5s tolerance
      expect(savedState.retryAfter).toBeLessThan(Date.now() + 65000);
    });

    it('should ignore invalid retry-after header', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 3000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123', 'invalid');

      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.retryAfter).toBeNull();
    });

    it('should do nothing when disabled', async () => {
      process.env.RATE_LIMITER_ENABLED = 'false';
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      await limiter.recordFailure('user-123', '120');

      expect(mockRedis.get).not.toHaveBeenCalled();
    });
  });

  describe('parseRetryAfter', () => {
    it('should parse seconds format', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      expect(limiter.parseRetryAfter('120')).toBe(120);
      expect(limiter.parseRetryAfter('60')).toBe(60);
      expect(limiter.parseRetryAfter('1')).toBe(1);
    });

    it('should parse HTTP-date format', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const futureDate = new Date(Date.now() + 120000); // 2 minutes from now

      const result = limiter.parseRetryAfter(futureDate.toUTCString());

      expect(result).toBeGreaterThanOrEqual(118); // Allow 2s tolerance
      expect(result).toBeLessThanOrEqual(122);
    });

    it('should return 0 for invalid format', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      expect(limiter.parseRetryAfter('invalid')).toBe(0);
      expect(limiter.parseRetryAfter('')).toBe(0);
    });

    it('should return 0 for negative seconds', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      expect(limiter.parseRetryAfter('-10')).toBe(0);
      expect(limiter.parseRetryAfter('0')).toBe(0);
    });

    it('should return 0 for past date', () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago

      expect(limiter.parseRetryAfter(pastDate.toUTCString())).toBe(0);
    });
  });

  describe('getWaitTime', () => {
    it('should return wait time with jitter', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 5000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      const waitTime = await limiter.getWaitTime('user-123');

      // Should be close to 5000 +/- jitter (default 20%)
      expect(waitTime).toBeGreaterThanOrEqual(1000); // Min 1 second
      expect(waitTime).toBeLessThanOrEqual(7000); // 5000 + 20% jitter max
    });

    it('should handle default state', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.get.mockResolvedValue(null);

      const waitTime = await limiter.getWaitTime('user-123');

      // Should return base delay with jitter (default 3000ms)
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe('resetUserLimits', () => {
    it('should delete user rate limit state', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      await limiter.resetUserLimits('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('rate_limit:user-123:state');
    });

    it('should do nothing when no Redis', async () => {
      const limiter = new AdaptiveRateLimiter(null);

      await limiter.resetUserLimits('user-123');

      // Should not throw
    });
  });

  describe('getGlobalMetrics', () => {
    it('should return empty object when no Redis', async () => {
      const limiter = new AdaptiveRateLimiter(null);

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics).toEqual({});
    });

    it('should aggregate metrics across users', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state1: RateLimitState = {
        retryAfter: Date.now() + 10000, // Active limit
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 5000,
      };

      const state2: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        baseDelay: 10000,
      };

      mockRedis.keys.mockResolvedValue(['rate_limit:user1:state', 'rate_limit:user2:state']);

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(state1))
        .mockResolvedValueOnce(JSON.stringify(state2));

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics.totalUsers).toBe(2);
      expect(metrics.usersWithActiveLimit).toBe(1);
      expect(metrics.avgBaseDelay).toBe(7500); // (5000 + 10000) / 2
      expect(metrics.maxBaseDelay).toBe(10000);
    });

    it('should handle empty keys', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.keys.mockResolvedValue([]);

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics.totalUsers).toBe(0);
      expect(metrics.avgBaseDelay).toBe(0);
    });

    it('should handle Redis errors', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const metrics = await limiter.getGlobalMetrics();

      expect(metrics).toEqual({});
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle malformed state data', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      mockRedis.keys.mockResolvedValue(['rate_limit:user1:state']);
      mockRedis.get.mockResolvedValue('{ invalid json }');

      const metrics = await limiter.getGlobalMetrics();

      // Should use fallback values from safeJsonParse
      expect(metrics.totalUsers).toBe(1);
    });
  });

  describe('atomicCheckAndUpdate', () => {
    it('should use Lua script when Redis available', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.eval.mockResolvedValue(1); // Allowed

      const result = await limiter.shouldAllowRequest('user-123');

      expect(mockRedis.eval).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    it('should handle Lua script errors conservatively', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.eval.mockRejectedValue(new Error('Lua error'));

      const result = await limiter.shouldAllowRequest('user-123');

      // Should deny on error (conservative approach)
      expect(result.allowed).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow all requests without Redis (no persistence)', async () => {
      const limiter = new AdaptiveRateLimiter(null);

      // Without Redis, there's no state persistence across calls
      // So both requests will be allowed (lastRequestTime always starts at 0)
      const result1 = await limiter.shouldAllowRequest('user-123');
      expect(result1.allowed).toBe(true);

      const result2 = await limiter.shouldAllowRequest('user-123');
      expect(result2.allowed).toBe(true); // Also allowed (no shared state)
    });
  });

  describe('edge cases', () => {
    it('should handle very large delay values', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 0,
        consecutiveFailures: 10,
        baseDelay: 300000, // 5 minutes
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      await limiter.recordFailure('user-123');

      // Should not exceed max delay
      const savedState = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(savedState.baseDelay).toBeLessThanOrEqual(300000);
    });

    it('should handle concurrent success and failure records', async () => {
      const limiter = new AdaptiveRateLimiter(mockRedis as any);

      const state: RateLimitState = {
        retryAfter: null,
        lastRequestTime: Date.now(),
        consecutiveSuccesses: 2,
        consecutiveFailures: 0,
        baseDelay: 5000,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(state));

      // Record success and failure concurrently
      await Promise.all([limiter.recordSuccess('user-123'), limiter.recordFailure('user-123')]);

      // Both should complete without error
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });
});
