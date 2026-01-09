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
import {
  CircuitBreaker,
  CircuitState,
  withCircuitBreaker,
  type CircuitBreakerConfig,
} from './circuit-breaker.js';

// Mock dependencies
vi.mock('./redis-client.js', () => ({
  RedisClientManager: {
    getClient: vi.fn(),
  },
}));

// Mock logger
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { RedisClientManager } from './redis-client.js';

const mockRedisClientManager = vi.mocked(RedisClientManager);

describe('circuit-breaker', () => {
  const mockRedisClient = {
    get: vi.fn(),
    setex: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    CircuitBreaker.resetAll();
    mockRedisClientManager.getClient.mockResolvedValue(mockRedisClient as any);
    delete process.env.CIRCUIT_BREAKER_ENABLED;
    delete process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS;
    delete process.env.CIRCUIT_BREAKER_THRESHOLD;
  });

  describe('CircuitState transitions', () => {
    it('should start in CLOSED state', async () => {
      const allowed = await CircuitBreaker.shouldAllowRequest('test-circuit');
      expect(allowed).toBe(true);

      const status = CircuitBreaker.getStatus('test-circuit');
      expect(status?.state).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after failure threshold', async () => {
      const key = 'test-circuit';

      // Record 3 failures (default threshold)
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
      expect(status?.failures).toBe(3);
    });

    it('should reject requests when OPEN', async () => {
      const key = 'test-circuit';

      // Open the circuit
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      const allowed = await CircuitBreaker.shouldAllowRequest(key);
      expect(allowed).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Circuit OPEN, rejecting request')
      );
    });

    it('should transition to HALF_OPEN after openDuration', async () => {
      const key = 'test-circuit';
      const config = { openDuration: 100 }; // 100ms

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.OPEN);

      // Wait for openDuration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);
      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.HALF_OPEN);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Transitioning to HALF_OPEN')
      );
    });

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
      const key = 'test-circuit';

      // Manually set to HALF_OPEN
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      // Move to HALF_OPEN by checking after delay
      const config = { openDuration: 50 };
      await new Promise((resolve) => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      // Record success
      await CircuitBreaker.recordSuccess(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Success in HALF_OPEN, transitioning to CLOSED')
      );
    });

    it('should transition from HALF_OPEN to OPEN on failure', async () => {
      const key = 'test-circuit';

      // Open circuit
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      // Move to HALF_OPEN
      const config = { openDuration: 50 };
      await new Promise((resolve) => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.HALF_OPEN);

      // Record failure in HALF_OPEN
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failure in HALF_OPEN, returning to OPEN')
      );
    });

    it('should limit test requests in HALF_OPEN state', async () => {
      const key = 'test-circuit';
      const config = { openDuration: 50, halfOpenMaxAttempts: 2 };

      // Open circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      // Move to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Transition to HALF_OPEN (first call allowed without count)
      expect(await CircuitBreaker.shouldAllowRequest(key, config)).toBe(true);

      // Next 2 requests should be allowed (halfOpenMaxAttempts = 2)
      expect(await CircuitBreaker.shouldAllowRequest(key, config)).toBe(true);
      expect(await CircuitBreaker.shouldAllowRequest(key, config)).toBe(true);

      // Fourth request should be denied
      expect(await CircuitBreaker.shouldAllowRequest(key, config)).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('HALF_OPEN max attempts reached')
      );
    });

    it('should stay CLOSED when failures below threshold', async () => {
      const key = 'test-circuit';

      // Record 2 failures (below threshold of 3)
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(2);
    });
  });

  describe('recordSuccess', () => {
    it('should reset failure count', async () => {
      const key = 'test-circuit';

      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      expect(CircuitBreaker.getStatus(key)?.failures).toBe(2);

      await CircuitBreaker.recordSuccess(key);
      expect(CircuitBreaker.getStatus(key)?.failures).toBe(0);
    });

    it('should not throw if circuit does not exist', async () => {
      await expect(CircuitBreaker.recordSuccess('non-existent')).resolves.not.toThrow();
    });

    it('should persist to Redis when enabled', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const key = 'test-circuit';
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordSuccess(key);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `circuit:${key}`,
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should not change state if already CLOSED', async () => {
      const key = 'test-circuit';

      // Create circuit in CLOSED state
      await CircuitBreaker.shouldAllowRequest(key);
      await CircuitBreaker.recordSuccess(key);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', async () => {
      const key = 'test-circuit';

      await CircuitBreaker.recordFailure(key);
      expect(CircuitBreaker.getStatus(key)?.failures).toBe(1);

      await CircuitBreaker.recordFailure(key);
      expect(CircuitBreaker.getStatus(key)?.failures).toBe(2);
    });

    it('should update lastFailureTime', async () => {
      const key = 'test-circuit';
      const before = Date.now();

      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.lastFailureTime).not.toBeNull();
      expect(status?.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('should persist to Redis when enabled', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      await CircuitBreaker.recordFailure('test-circuit');

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'circuit:test-circuit',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should use custom config', async () => {
      const key = 'test-circuit';
      const config = { failureThreshold: 5 };

      // Record 4 failures - should not open
      for (let i = 0; i < 4; i++) {
        await CircuitBreaker.recordFailure(key, config);
      }
      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.CLOSED);

      // 5th failure should open
      await CircuitBreaker.recordFailure(key, config);
      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.OPEN);
    });

    it('should increment failures in OPEN state', async () => {
      const key = 'test-circuit';

      // Open the circuit
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.OPEN);

      // Record another failure
      await CircuitBreaker.recordFailure(key);
      expect(CircuitBreaker.getStatus(key)?.failures).toBe(4);
    });
  });

  describe('getStatus', () => {
    it('should return null for non-existent circuit', () => {
      expect(CircuitBreaker.getStatus('non-existent')).toBeNull();
    });

    it('should return circuit status', async () => {
      const key = 'test-circuit';
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status).toMatchObject({
        state: CircuitState.CLOSED,
        failures: 1,
      });
    });

    it('should calculate nextAttemptTime for OPEN circuit', async () => {
      const key = 'test-circuit';
      const config = { openDuration: 5 * 60 * 1000 }; // 5 minutes

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
      expect(status?.nextAttemptTime).not.toBeNull();
      expect(status?.nextAttemptTime!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should have null nextAttemptTime for CLOSED circuit', async () => {
      const key = 'test-circuit';
      await CircuitBreaker.shouldAllowRequest(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.nextAttemptTime).toBeNull();
    });

    it('should have null nextAttemptTime for HALF_OPEN circuit', async () => {
      const key = 'test-circuit';
      const config = { openDuration: 50 };

      // Open and transition to HALF_OPEN
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await new Promise((resolve) => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.HALF_OPEN);
      expect(status?.nextAttemptTime).toBeNull();
    });
  });

  describe('getAllStatuses', () => {
    it('should return empty object when no circuits', () => {
      expect(CircuitBreaker.getAllStatuses()).toEqual({});
    });

    it('should return all circuit statuses', async () => {
      await CircuitBreaker.recordFailure('circuit-1');
      await CircuitBreaker.recordFailure('circuit-2');

      const statuses = CircuitBreaker.getAllStatuses();
      expect(Object.keys(statuses)).toEqual(['circuit-1', 'circuit-2']);
      expect(statuses['circuit-1'].failures).toBe(1);
      expect(statuses['circuit-2'].failures).toBe(1);
    });

    it('should include all circuit states', async () => {
      await CircuitBreaker.recordFailure('closed-circuit');

      await CircuitBreaker.recordFailure('open-circuit');
      await CircuitBreaker.recordFailure('open-circuit');
      await CircuitBreaker.recordFailure('open-circuit');

      const statuses = CircuitBreaker.getAllStatuses();
      expect(statuses['closed-circuit'].state).toBe(CircuitState.CLOSED);
      expect(statuses['open-circuit'].state).toBe(CircuitState.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED', async () => {
      const key = 'test-circuit';

      // Open the circuit
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.OPEN);

      CircuitBreaker.reset(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Circuit reset to CLOSED'));
    });

    it('should do nothing for non-existent circuit', () => {
      expect(() => CircuitBreaker.reset('non-existent')).not.toThrow();
    });

    it('should reset HALF_OPEN circuit', async () => {
      const key = 'test-circuit';
      const config = { openDuration: 50 };

      // Open and transition to HALF_OPEN
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await new Promise((resolve) => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      CircuitBreaker.reset(key);

      expect(CircuitBreaker.getStatus(key)?.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('resetAll', () => {
    it('should clear all circuits', async () => {
      await CircuitBreaker.recordFailure('circuit-1');
      await CircuitBreaker.recordFailure('circuit-2');

      expect(Object.keys(CircuitBreaker.getAllStatuses()).length).toBe(2);

      CircuitBreaker.resetAll();

      expect(Object.keys(CircuitBreaker.getAllStatuses()).length).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('All circuits reset'));
    });

    it('should work when no circuits exist', () => {
      expect(() => CircuitBreaker.resetAll()).not.toThrow();
      expect(Object.keys(CircuitBreaker.getAllStatuses()).length).toBe(0);
    });
  });

  describe('Redis persistence', () => {
    it('should load circuit from Redis', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const savedCircuit = {
        state: CircuitState.OPEN,
        failures: 5,
        lastFailureTime: Date.now(),
        halfOpenAttempts: 0,
        config: {
          failureThreshold: 3,
          openDuration: 300000,
          halfOpenMaxAttempts: 1,
        },
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(savedCircuit));

      const allowed = await CircuitBreaker.shouldAllowRequest('persisted-circuit');

      expect(mockRedisClient.get).toHaveBeenCalledWith('circuit:persisted-circuit');
      expect(allowed).toBe(false); // OPEN circuit
    });

    it('should handle Redis load errors', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      // Should create new circuit instead
      const allowed = await CircuitBreaker.shouldAllowRequest('test-circuit');
      expect(allowed).toBe(true);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle Redis save errors', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      await CircuitBreaker.recordFailure('test-circuit');

      expect(console.error).toHaveBeenCalled();
    });

    it('should not persist when Redis client unavailable', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';
      mockRedisClientManager.getClient.mockResolvedValue(null);

      await CircuitBreaker.recordFailure('test-circuit');

      // Should not throw
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should not persist when disabled', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'false';

      await CircuitBreaker.recordFailure('test-circuit');

      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should calculate correct TTL for Redis', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const config = { openDuration: 5 * 60 * 1000 }; // 5 minutes

      await CircuitBreaker.recordFailure('test-circuit', config);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'circuit:test-circuit',
        360, // (5 * 60) + 60 seconds
        expect.any(String)
      );
    });

    it('should handle null data from Redis', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';
      mockRedisClient.get.mockResolvedValue(null);

      // Should create new circuit
      const allowed = await CircuitBreaker.shouldAllowRequest('test-circuit');
      expect(allowed).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(CircuitBreaker.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';
      expect(CircuitBreaker.isEnabled()).toBe(false);
    });

    it('should return false when set to 0', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = '0';
      expect(CircuitBreaker.isEnabled()).toBe(false);
    });

    it('should return true when explicitly enabled', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'true';
      expect(CircuitBreaker.isEnabled()).toBe(true);
    });
  });

  describe('getFailureThreshold', () => {
    it('should return default threshold', () => {
      expect(CircuitBreaker.getFailureThreshold()).toBe(3);
    });

    it('should return configured threshold', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = '10';
      expect(CircuitBreaker.getFailureThreshold()).toBe(10);
    });

    it('should return default for invalid threshold', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = 'invalid';
      expect(CircuitBreaker.getFailureThreshold()).toBe(3);
    });

    it('should return default for empty string', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = '';
      expect(CircuitBreaker.getFailureThreshold()).toBe(3);
    });
  });

  describe('withCircuitBreaker', () => {
    it('should execute function when circuit CLOSED', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when circuit OPEN', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback');

      // Open the circuit
      await CircuitBreaker.recordFailure('test');
      await CircuitBreaker.recordFailure('test');
      await CircuitBreaker.recordFailure('test');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Using fallback (circuit OPEN)')
      );
    });

    it('should record success on successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn();

      await withCircuitBreaker('test', fn, fallback);

      const status = CircuitBreaker.getStatus('test');
      expect(status?.failures).toBe(0);
    });

    it('should use fallback on 429 error with status', async () => {
      const error = new Error('Rate limit');
      (error as any).status = 429;

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
      expect(CircuitBreaker.getStatus('test')?.failures).toBe(1);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('429 error, recorded failure')
      );
    });

    it('should use fallback on 429 error with statusCode', async () => {
      const error = new Error('Rate limit');
      (error as any).statusCode = 429;

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
      expect(CircuitBreaker.getStatus('test')?.failures).toBe(1);
    });

    it('should use fallback on rate limit message', async () => {
      const error = new Error('Rate limit exceeded');

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
      expect(CircuitBreaker.getStatus('test')?.failures).toBe(1);
    });

    it('should use fallback on 429 in message', async () => {
      const error = new Error('HTTP 429 Too Many Requests');

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
    });

    it('should throw non-429 errors', async () => {
      const error = new Error('Server error');
      (error as any).status = 500;

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn();

      await expect(withCircuitBreaker('test', fn, fallback)).rejects.toThrow('Server error');

      // Should not record failure
      const status = CircuitBreaker.getStatus('test');
      expect(status?.failures).toBe(0); // Circuit created but no failure recorded
    });

    it('should execute normally when circuit breaker disabled', async () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';

      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn();

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should pass custom config to circuit breaker', async () => {
      const config = { failureThreshold: 1 };
      const error = new Error('429');
      (error as any).status = 429;

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      // First call should fail and open circuit
      await withCircuitBreaker('test', fn, fallback, config);

      // Circuit should be open now
      expect(CircuitBreaker.getStatus('test')?.state).toBe(CircuitState.OPEN);
    });

    it('should handle error without message property', async () => {
      const error = { status: 429 }; // No message

      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test', fn, fallback);

      expect(result).toBe('fallback');
    });
  });
});
