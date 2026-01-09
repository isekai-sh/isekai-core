/**
 * Adaptive Rate Limiter for DeviantArt API
 *
 * Features:
 * - Parses Retry-After headers (seconds or HTTP-date formats)
 * - Redis-backed state for cross-worker coordination
 * - Adaptive delays that decrease on success, increase on failure
 * - Jittered backoff to prevent thundering herd
 * - Per-user rate limit tracking
 */

import type { Redis } from 'ioredis';

export interface RateLimitState {
  retryAfter: number | null; // Unix timestamp when rate limit expires
  lastRequestTime: number; // Last request timestamp
  consecutiveSuccesses: number; // Track success pattern
  consecutiveFailures: number; // Track failure pattern
  baseDelay: number; // Current adaptive delay in ms
}

export interface RateLimitCheck {
  allowed: boolean;
  waitMs?: number;
  reason?: string;
}

/**
 * Adaptive Rate Limiter
 *
 * Coordinates rate limiting across multiple workers using Redis
 */
export class AdaptiveRateLimiter {
  private redis: Redis | null;
  private baseDelayMs: number;
  private maxDelayMs: number;
  private jitterPercent: number;
  private successDecreaseFactor: number;
  private failureIncreaseFactor: number;

  constructor(redis: Redis | null) {
    this.redis = redis;

    // Configuration from environment
    this.baseDelayMs = parseInt(process.env.RATE_LIMITER_BASE_DELAY_MS || '3000');
    this.maxDelayMs = parseInt(process.env.RATE_LIMITER_MAX_DELAY_MS || '300000');
    this.jitterPercent = parseInt(process.env.RATE_LIMITER_JITTER_PERCENT || '20');
    this.successDecreaseFactor = parseFloat(
      process.env.RATE_LIMITER_SUCCESS_DECREASE_FACTOR || '0.9'
    );
    this.failureIncreaseFactor = parseFloat(
      process.env.RATE_LIMITER_FAILURE_INCREASE_FACTOR || '2.0'
    );
  }

  /**
   * Check if a request should be allowed for a user
   *
   * Uses Redis Lua script for atomic check-and-update to prevent race conditions
   * when multiple workers check rate limits simultaneously
   */
  async shouldAllowRequest(userId: string): Promise<RateLimitCheck> {
    if (!this.isEnabled()) {
      return { allowed: true };
    }

    const state = await this.getState(userId);

    // Check if we're in a rate limit period (from Retry-After header)
    if (state.retryAfter && state.retryAfter > Date.now()) {
      const waitMs = state.retryAfter - Date.now();
      return {
        allowed: false,
        waitMs,
        reason: 'RETRY_AFTER',
      };
    }

    // Use atomic check-and-update for lastRequestTime to prevent race conditions
    // Apply jitter to required delay to further spread out concurrent requests
    const baseDelay = this.getRequiredDelay(state);
    const requiredDelay = this.addJitter(baseDelay);
    const allowed = await this.atomicCheckAndUpdate(userId, requiredDelay);

    if (!allowed) {
      // Re-fetch state to get accurate wait time
      const freshState = await this.getState(userId);
      const timeSinceLastRequest = Date.now() - freshState.lastRequestTime;
      const waitMs = requiredDelay - timeSinceLastRequest;

      return {
        allowed: false,
        waitMs: Math.max(0, waitMs),
        reason: 'ADAPTIVE_DELAY',
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful request (decrease delays)
   */
  async recordSuccess(userId: string): Promise<void> {
    if (!this.isEnabled()) return;

    const state = await this.getState(userId);

    // Increase consecutive successes
    state.consecutiveSuccesses++;
    state.consecutiveFailures = 0;

    // Decrease base delay on consecutive successes
    if (state.consecutiveSuccesses >= 3) {
      state.baseDelay = Math.max(this.baseDelayMs, state.baseDelay * this.successDecreaseFactor);
      state.consecutiveSuccesses = 0; // Reset counter after adjustment
    }

    // Clear retry-after if set
    state.retryAfter = null;

    await this.setState(userId, state);
  }

  /**
   * Record a failed request (increase delays, parse Retry-After)
   */
  async recordFailure(userId: string, retryAfterHeader?: string): Promise<void> {
    if (!this.isEnabled()) return;

    const state = await this.getState(userId);

    // Increase consecutive failures
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;

    // Parse and store Retry-After if provided
    if (retryAfterHeader) {
      const retryAfterSeconds = this.parseRetryAfter(retryAfterHeader);
      if (retryAfterSeconds > 0) {
        state.retryAfter = Date.now() + retryAfterSeconds * 1000;
      }
    }

    // Increase base delay on consecutive failures
    state.baseDelay = Math.min(this.maxDelayMs, state.baseDelay * this.failureIncreaseFactor);

    await this.setState(userId, state);
  }

  /**
   * Parse Retry-After header
   *
   * Supports two formats:
   * - Seconds: "120" (retry after 120 seconds)
   * - HTTP-date: "Wed, 21 Oct 2015 07:28:00 GMT"
   */
  parseRetryAfter(header: string): number {
    if (!header) return 0;

    // Try parsing as integer (seconds)
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds;
    }

    // Try parsing as HTTP-date
    try {
      const date = new Date(header);
      if (!isNaN(date.getTime())) {
        const secondsUntil = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
        return secondsUntil;
      }
    } catch (error) {
      // Invalid date format
    }

    return 0;
  }

  /**
   * Get wait time for a user with jitter
   */
  async getWaitTime(userId: string): Promise<number> {
    const state = await this.getState(userId);
    const baseDelay = this.getRequiredDelay(state);
    return this.addJitter(baseDelay);
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserLimits(userId: string): Promise<void> {
    if (!this.redis) return;

    const key = this.getRedisKey(userId);
    await this.redis.del(key);
  }

  /**
   * Get global metrics for monitoring
   */
  async getGlobalMetrics(): Promise<Record<string, any>> {
    if (!this.redis) return {};

    try {
      // Get all rate limit keys
      const keys = await this.redis.keys('rate_limit:*:state');

      const metrics = {
        totalUsers: keys.length,
        usersWithActiveLimit: 0,
        avgBaseDelay: 0,
        maxBaseDelay: 0,
      };

      let totalBaseDelay = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const state: RateLimitState = JSON.parse(data);

          if (state.retryAfter && state.retryAfter > Date.now()) {
            metrics.usersWithActiveLimit++;
          }

          totalBaseDelay += state.baseDelay;
          metrics.maxBaseDelay = Math.max(metrics.maxBaseDelay, state.baseDelay);
        }
      }

      if (keys.length > 0) {
        metrics.avgBaseDelay = Math.round(totalBaseDelay / keys.length);
      }

      return metrics;
    } catch (error) {
      console.error('[RateLimiter] Error getting global metrics:', error);
      return {};
    }
  }

  /**
   * Atomically check if enough time has passed and update lastRequestTime
   *
   * Uses Redis Lua script to ensure only ONE job can pass the rate limit check
   * at a time, preventing race conditions with concurrent workers
   *
   * @returns true if request is allowed, false if rate limited
   */
  private async atomicCheckAndUpdate(userId: string, requiredDelayMs: number): Promise<boolean> {
    if (!this.redis) {
      // Fallback for no Redis (local dev)
      const state = await this.getState(userId);
      const timeSinceLastRequest = Date.now() - state.lastRequestTime;

      if (timeSinceLastRequest < requiredDelayMs) {
        return false;
      }

      await this.updateLastRequestTime(userId);
      return true;
    }

    // Lua script for atomic check-and-update
    // KEYS[1] = state key
    // ARGV[1] = required delay in ms
    // ARGV[2] = current timestamp
    const luaScript = `
      local key = KEYS[1]
      local requiredDelay = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])

      -- Get current state
      local data = redis.call('GET', key)
      if not data then
        -- No state exists, allow and set initial state
        local newState = {
          retryAfter = cjson.null,
          lastRequestTime = now,
          consecutiveSuccesses = 0,
          consecutiveFailures = 0,
          baseDelay = requiredDelay
        }
        redis.call('SETEX', key, 3600, cjson.encode(newState))
        return 1
      end

      -- Parse existing state
      local state = cjson.decode(data)
      local lastRequestTime = state.lastRequestTime or 0
      local timeSinceLastRequest = now - lastRequestTime

      -- Check if enough time has passed
      if timeSinceLastRequest < requiredDelay then
        return 0
      end

      -- Update lastRequestTime
      state.lastRequestTime = now
      redis.call('SETEX', key, 3600, cjson.encode(state))
      return 1
    `;

    try {
      const key = this.getRedisKey(userId);
      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        requiredDelayMs.toString(),
        Date.now().toString()
      );

      return result === 1;
    } catch (error) {
      console.error('[RateLimiter] Error in atomic check-and-update:', error);
      // On error, be conservative and deny request
      return false;
    }
  }

  /**
   * Get required delay for current state
   */
  private getRequiredDelay(state: RateLimitState): number {
    return state.baseDelay || this.baseDelayMs;
  }

  /**
   * Add jitter to a delay
   */
  private addJitter(delayMs: number): number {
    const jitter = delayMs * (this.jitterPercent / 100) * (Math.random() * 2 - 1);
    return Math.max(1000, Math.round(delayMs + jitter));
  }

  /**
   * Get rate limit state from Redis
   */
  private async getState(userId: string): Promise<RateLimitState> {
    const defaultState: RateLimitState = {
      retryAfter: null,
      lastRequestTime: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      baseDelay: this.baseDelayMs,
    };

    if (!this.redis) {
      return defaultState;
    }

    try {
      const key = this.getRedisKey(userId);
      const data = await this.redis.get(key);

      if (!data) {
        return defaultState;
      }

      return JSON.parse(data) as RateLimitState;
    } catch (error) {
      console.error('[RateLimiter] Error getting state:', error);
      return defaultState;
    }
  }

  /**
   * Save rate limit state to Redis
   */
  private async setState(userId: string, state: RateLimitState): Promise<void> {
    if (!this.redis) return;

    try {
      const key = this.getRedisKey(userId);
      const ttl = 3600; // 1 hour TTL

      await this.redis.setex(key, ttl, JSON.stringify(state));
    } catch (error) {
      console.error('[RateLimiter] Error setting state:', error);
    }
  }

  /**
   * Update last request time
   */
  private async updateLastRequestTime(userId: string): Promise<void> {
    const state = await this.getState(userId);
    state.lastRequestTime = Date.now();
    await this.setState(userId, state);
  }

  /**
   * Get Redis key for user
   */
  private getRedisKey(userId: string): string {
    return `rate_limit:${userId}:state`;
  }

  /**
   * Check if rate limiter is enabled
   */
  private isEnabled(): boolean {
    const enabled = process.env.RATE_LIMITER_ENABLED?.toLowerCase();
    return enabled !== 'false' && enabled !== '0';
  }
}
