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
import { CircuitBreaker, CircuitState, withCircuitBreaker } from './circuit-breaker';
import { RedisClientManager } from './redis-client';

describe('CircuitBreaker', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      CIRCUIT_BREAKER_ENABLED: 'true',
      CIRCUIT_BREAKER_THRESHOLD: '3',
      CIRCUIT_BREAKER_OPEN_DURATION_MS: '60000', // 1 minute for testing
    };
    CircuitBreaker.resetAll();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    CircuitBreaker.resetAll();
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', async () => {
      const allowed = await CircuitBreaker.shouldAllowRequest('test-key');

      expect(allowed).toBe(true);

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 3 };

      // Record 3 failures
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });

    it('should stay CLOSED after failures below threshold', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 3 };

      // Record 2 failures (below threshold)
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
    });

    it('should transition to HALF_OPEN after open duration expires', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 2, openDuration: 100 }; // 100ms

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      // Verify it's open
      let status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);

      // Wait for open duration to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow request and transition to HALF_OPEN
      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit on success in HALF_OPEN state', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 2, openDuration: 50 };

      // Open circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      // Record success
      await CircuitBreaker.recordSuccess(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
    });

    it('should reopen circuit on failure in HALF_OPEN state', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 2, openDuration: 50 };

      // Open circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      // Record another failure
      await CircuitBreaker.recordFailure(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Success Recording', () => {
    it('should reset failure count on success', async () => {
      const key = 'test-key';

      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordSuccess(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.failures).toBe(0);
    });

    it('should keep circuit CLOSED on success', async () => {
      const key = 'test-key';

      // Create circuit first
      await CircuitBreaker.shouldAllowRequest(key);
      await CircuitBreaker.recordSuccess(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('getStatus', () => {
    it('should return null for unknown circuit', () => {
      const status = CircuitBreaker.getStatus('unknown-key');
      expect(status).toBeNull();
    });

    it('should return status for known circuit', async () => {
      await CircuitBreaker.shouldAllowRequest('test-key');

      const status = CircuitBreaker.getStatus('test-key');
      expect(status).not.toBeNull();
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
    });
  });

  describe('getAllStatuses', () => {
    it('should return all circuit statuses', async () => {
      await CircuitBreaker.shouldAllowRequest('key1');
      await CircuitBreaker.shouldAllowRequest('key2');

      const statuses = CircuitBreaker.getAllStatuses();

      expect(Object.keys(statuses)).toHaveLength(2);
      expect(statuses['key1']).toBeDefined();
      expect(statuses['key2']).toBeDefined();
    });

    it('should return empty object when no circuits exist', () => {
      const statuses = CircuitBreaker.getAllStatuses();
      expect(statuses).toEqual({});
    });
  });

  describe('reset', () => {
    it('should reset specific circuit to CLOSED state', async () => {
      const key = 'test-key';
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      let status = CircuitBreaker.getStatus(key);
      expect(status?.failures).toBeGreaterThan(0);

      CircuitBreaker.reset(key);

      status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
    });

    it('should not affect other circuits', async () => {
      await CircuitBreaker.recordFailure('key1');
      await CircuitBreaker.recordFailure('key2');

      CircuitBreaker.reset('key1');

      const status1 = CircuitBreaker.getStatus('key1');
      const status2 = CircuitBreaker.getStatus('key2');

      expect(status1?.failures).toBe(0);
      expect(status2?.failures).toBeGreaterThan(0);
    });
  });

  describe('resetAll', () => {
    it('should reset all circuits', async () => {
      await CircuitBreaker.shouldAllowRequest('key1');
      await CircuitBreaker.shouldAllowRequest('key2');

      CircuitBreaker.resetAll();

      const statuses = CircuitBreaker.getAllStatuses();
      expect(statuses).toEqual({});
    });
  });

  describe('Configuration', () => {
    it('should use custom failure threshold', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1 };

      await CircuitBreaker.recordFailure(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });

    it('should use default config when not provided', async () => {
      const key = 'test-key';

      // Default threshold is 3
      await CircuitBreaker.recordFailure(key);
      await CircuitBreaker.recordFailure(key);

      let status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);

      await CircuitBreaker.recordFailure(key);
      status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'true';
      expect(CircuitBreaker.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';
      expect(CircuitBreaker.isEnabled()).toBe(false);
    });

    it('should default to true when not set', () => {
      delete process.env.CIRCUIT_BREAKER_ENABLED;
      expect(CircuitBreaker.isEnabled()).toBe(true);
    });
  });

  describe('getFailureThreshold', () => {
    it('should return configured threshold', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = '5';
      expect(CircuitBreaker.getFailureThreshold()).toBe(5);
    });

    it('should default to 3 when not set', () => {
      delete process.env.CIRCUIT_BREAKER_THRESHOLD;
      expect(CircuitBreaker.getFailureThreshold()).toBe(3);
    });

    it('should default to 3 for invalid threshold', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = 'invalid';
      expect(CircuitBreaker.getFailureThreshold()).toBe(3);
    });
  });

  describe('HALF_OPEN State Behavior', () => {
    it('should allow requests up to halfOpenMaxAttempts plus transition', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 2, openDuration: 50, halfOpenMaxAttempts: 3 };

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));

      // Transition to HALF_OPEN (resets attempts to 0, returns true)
      let allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 0, increments to 1, returns true
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 1, increments to 2, returns true
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 2, increments to 3, returns true
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 3, NOT < 3, returns false
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);
    });

    it('should reject when halfOpenAttempts equals halfOpenMaxAttempts', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 50, halfOpenMaxAttempts: 1 };

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);

      // Wait and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));

      // Transition to HALF_OPEN (resets attempts to 0, returns true)
      let allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 0, increments to 1, returns true
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);

      // attempts = 1, NOT < 1, returns false
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('getStatus Edge Cases', () => {
    it('should return null lastFailureTime when no failures recorded', async () => {
      const key = 'test-key';
      await CircuitBreaker.shouldAllowRequest(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.lastFailureTime).toBeNull();
    });

    it('should return lastFailureTime as Date when failures recorded', async () => {
      const key = 'test-key';
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should calculate nextAttemptTime for OPEN circuit', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 60000 };

      await CircuitBreaker.recordFailure(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
      expect(status?.nextAttemptTime).toBeInstanceOf(Date);
      expect(status?.nextAttemptTime!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null nextAttemptTime for CLOSED circuit', async () => {
      const key = 'test-key';
      await CircuitBreaker.shouldAllowRequest(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.nextAttemptTime).toBeNull();
    });

    it('should return null nextAttemptTime for HALF_OPEN circuit', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 50 };

      await CircuitBreaker.recordFailure(key, config);
      await new Promise(resolve => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.HALF_OPEN);
      expect(status?.nextAttemptTime).toBeNull();
    });
  });

  describe('recordSuccess Edge Cases', () => {
    it('should handle recordSuccess for non-existent circuit gracefully', async () => {
      await CircuitBreaker.recordSuccess('non-existent-key');

      const status = CircuitBreaker.getStatus('non-existent-key');
      expect(status).toBeNull();
    });

    it('should reset failures in CLOSED state', async () => {
      const key = 'test-key';

      await CircuitBreaker.recordFailure(key);
      let status = CircuitBreaker.getStatus(key);
      expect(status?.failures).toBe(1);

      await CircuitBreaker.recordSuccess(key);
      status = CircuitBreaker.getStatus(key);
      expect(status?.failures).toBe(0);
    });

    it('should not change state when recording success in CLOSED state', async () => {
      const key = 'test-key';
      await CircuitBreaker.shouldAllowRequest(key);

      await CircuitBreaker.recordSuccess(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset Edge Cases', () => {
    it('should handle reset for non-existent circuit gracefully', () => {
      CircuitBreaker.reset('non-existent-key');

      const status = CircuitBreaker.getStatus('non-existent-key');
      expect(status).toBeNull();
    });

    it('should reset halfOpenAttempts', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 50, halfOpenMaxAttempts: 2 };

      // Open and transition to HALF_OPEN
      await CircuitBreaker.recordFailure(key, config);
      await new Promise(resolve => setTimeout(resolve, 60));
      await CircuitBreaker.shouldAllowRequest(key, config);

      CircuitBreaker.reset(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
    });

    it('should reset lastFailureTime to 0', async () => {
      const key = 'test-key';
      await CircuitBreaker.recordFailure(key);

      let status = CircuitBreaker.getStatus(key);
      expect(status?.lastFailureTime).not.toBeNull();

      CircuitBreaker.reset(key);

      status = CircuitBreaker.getStatus(key);
      expect(status?.lastFailureTime).toBeNull();
    });
  });

  describe('State Transition Edge Cases', () => {
    it('should not open circuit before reaching threshold', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 5 };

      for (let i = 0; i < 4; i++) {
        await CircuitBreaker.recordFailure(key, config);
      }

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(4);
    });

    it('should open circuit exactly at threshold', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 5 };

      for (let i = 0; i < 5; i++) {
        await CircuitBreaker.recordFailure(key, config);
      }

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });

    it('should reject requests while circuit is OPEN and time not expired', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 10000 };

      await CircuitBreaker.recordFailure(key, config);

      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);
    });

    it('should not increment failures in OPEN state', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 2 };

      // Open the circuit
      await CircuitBreaker.recordFailure(key, config);
      await CircuitBreaker.recordFailure(key, config);

      const status1 = CircuitBreaker.getStatus(key);
      expect(status1?.failures).toBe(2);

      // Record more failures while OPEN
      await CircuitBreaker.recordFailure(key, config);

      const status2 = CircuitBreaker.getStatus(key);
      expect(status2?.failures).toBe(3);
      expect(status2?.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Time Window Management', () => {
    it('should update lastFailureTime on each failure', async () => {
      const key = 'test-key';

      await CircuitBreaker.recordFailure(key);
      const status1 = CircuitBreaker.getStatus(key);
      const time1 = status1?.lastFailureTime?.getTime() || 0;

      await new Promise(resolve => setTimeout(resolve, 10));

      await CircuitBreaker.recordFailure(key);
      const status2 = CircuitBreaker.getStatus(key);
      const time2 = status2?.lastFailureTime?.getTime() || 0;

      expect(time2).toBeGreaterThan(time1);
    });

    it('should calculate time since open correctly', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 100 };

      await CircuitBreaker.recordFailure(key, config);

      // Should be OPEN immediately
      let allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);

      // Wait less than open duration
      await new Promise(resolve => setTimeout(resolve, 50));
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);

      // Wait for full duration
      await new Promise(resolve => setTimeout(resolve, 60));
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);
    });
  });

  describe('Configuration Merging', () => {
    it('should merge partial config with defaults', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1 };

      await CircuitBreaker.recordFailure(key, config);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
    });

    it('should use custom openDuration', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 100 };

      await CircuitBreaker.recordFailure(key, config);

      let allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 110));
      allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(true);
    });

    it('should use custom halfOpenMaxAttempts', async () => {
      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 50, halfOpenMaxAttempts: 5 };

      await CircuitBreaker.recordFailure(key, config);
      await new Promise(resolve => setTimeout(resolve, 60));

      // Transition + 5 attempts = 6 total allowed requests
      for (let i = 0; i < 6; i++) {
        const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
        expect(allowed).toBe(true);
      }

      // 7th request should be rejected
      const allowed = await CircuitBreaker.shouldAllowRequest(key, config);
      expect(allowed).toBe(false);
    });
  });

  describe('isEnabled Edge Cases', () => {
    it('should return false when set to "0"', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = '0';
      expect(CircuitBreaker.isEnabled()).toBe(false);
    });

    it('should return true for any value other than false/0', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'yes';
      expect(CircuitBreaker.isEnabled()).toBe(true);
    });
  });

  describe('Redis Persistence', () => {
    it('should save circuit state to Redis on failure', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);

      CircuitBreaker.resetAll();

      const key = 'test-key';
      const config = { failureThreshold: 2 };

      // Record a failure - should save to Redis
      await CircuitBreaker.recordFailure(key, config);

      // Verify Redis setex was called (twice: once for create, once for recordFailure)
      expect(mockRedis.setex).toHaveBeenCalled();
      const lastCall = mockRedis.setex.mock.calls[mockRedis.setex.mock.calls.length - 1];
      expect(lastCall[0]).toBe(`circuit:${key}`);
      expect(typeof lastCall[1]).toBe('number'); // TTL
      const savedState = JSON.parse(lastCall[2]);
      expect(savedState.failures).toBeGreaterThan(0);
    });

    it('should handle Redis get errors gracefully', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        setex: vi.fn().mockResolvedValue('OK'),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const key = 'test-key';

      // Should handle error and create new circuit
      const allowed = await CircuitBreaker.shouldAllowRequest(key);
      expect(allowed).toBe(true);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CircuitBreaker] Error loading from Redis:',
        expect.any(Error)
      );
    });

    it('should handle Redis save errors gracefully', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockRejectedValue(new Error('Redis write failed')),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const key = 'test-key';

      // Should handle error gracefully
      await CircuitBreaker.recordFailure(key);

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CircuitBreaker] Error saving to Redis:',
        expect.any(Error)
      );
    });

    it('should return null when Redis returns null data', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);

      CircuitBreaker.resetAll();

      const key = 'test-key';

      // Should create new circuit since Redis returns null
      const allowed = await CircuitBreaker.shouldAllowRequest(key);
      expect(allowed).toBe(true);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.CLOSED);
    });

    it('should skip Redis when persistence is disabled', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'false';

      const mockRedis = {
        get: vi.fn(),
        setex: vi.fn(),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);

      const key = 'test-key';

      await CircuitBreaker.recordFailure(key);

      // Redis should not be called when persistence is disabled
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle null Redis client gracefully', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(null);

      const key = 'test-key';

      // Should work without Redis
      await CircuitBreaker.recordFailure(key);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.failures).toBe(1);
    });

    it('should restore circuit state from Redis', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const savedState = {
        state: CircuitState.OPEN,
        failures: 5,
        lastFailureTime: Date.now(),
        halfOpenAttempts: 0,
        config: { failureThreshold: 3, openDuration: 60000, halfOpenMaxAttempts: 1 },
      };

      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify(savedState)),
        setex: vi.fn().mockResolvedValue('OK'),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);

      CircuitBreaker.resetAll();

      const key = 'test-key';

      // Should load from Redis and be in OPEN state
      const allowed = await CircuitBreaker.shouldAllowRequest(key);
      expect(allowed).toBe(false);

      const status = CircuitBreaker.getStatus(key);
      expect(status?.state).toBe(CircuitState.OPEN);
      expect(status?.failures).toBe(5);
    });

    it('should calculate correct TTL for Redis', async () => {
      process.env.CIRCUIT_BREAKER_PERSIST_TO_REDIS = 'true';

      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
      };

      vi.spyOn(RedisClientManager, 'getClient').mockResolvedValue(mockRedis as any);

      const key = 'test-key';
      const config = { failureThreshold: 1, openDuration: 300000 }; // 5 minutes

      await CircuitBreaker.recordFailure(key, config);

      // Verify TTL is openDuration/1000 + 60
      const setexArgs = mockRedis.setex.mock.calls[0];
      const expectedTtl = Math.floor(300000 / 1000) + 60; // 300 + 60 = 360
      expect(setexArgs[1]).toBe(expectedTtl);
    });
  });
});

describe('withCircuitBreaker', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      CIRCUIT_BREAKER_ENABLED: 'true',
    };
    CircuitBreaker.resetAll();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    CircuitBreaker.resetAll();
  });

  describe('Normal Operation', () => {
    it('should execute function and record success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(0);
    });

    it('should execute function when circuit breaker is disabled', async () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';

      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });
  });

  describe('429 Error Handling', () => {
    it('should handle 429 error with status property', async () => {
      const error = new Error('Rate limit exceeded');
      (error as any).status = 429;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledTimes(1);

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(1);
    });

    it('should handle 429 error with statusCode property', async () => {
      const error = new Error('Rate limit exceeded');
      (error as any).statusCode = 429;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledTimes(1);

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(1);
    });

    it('should handle 429 error with rate limit in message (lowercase)', async () => {
      const error = new Error('rate limit exceeded');
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledTimes(1);

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(1);
    });

    it('should handle error with 429 in message', async () => {
      const error = new Error('Error 429: Too Many Requests');
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await withCircuitBreaker('test-key', fn, fallback);

      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledTimes(1);

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(1);
    });

    it('should open circuit after threshold 429 errors', async () => {
      const error = new Error('Rate limit exceeded');
      (error as any).status = 429;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');
      const config = { failureThreshold: 2, openDuration: 60000 };

      // First failure
      await withCircuitBreaker('test-key', fn, fallback, config);
      expect(fn).toHaveBeenCalledTimes(1);

      // Second failure - should open circuit
      await withCircuitBreaker('test-key', fn, fallback, config);
      expect(fn).toHaveBeenCalledTimes(2);

      let status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.OPEN);

      // Third call should use fallback without calling fn
      await withCircuitBreaker('test-key', fn, fallback, config);
      expect(fn).toHaveBeenCalledTimes(2); // Still 2, not called again
      expect(fallback).toHaveBeenCalledTimes(3);
    });
  });

  describe('Non-429 Error Handling', () => {
    it('should throw non-429 errors', async () => {
      const error = new Error('Database connection failed');
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      await expect(withCircuitBreaker('test-key', fn, fallback)).rejects.toThrow(
        'Database connection failed'
      );

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();

      // Should not record failure for non-429 errors
      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.failures).toBe(0);
    });

    it('should throw errors with status 500', async () => {
      const error = new Error('Internal server error');
      (error as any).status = 500;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      await expect(withCircuitBreaker('test-key', fn, fallback)).rejects.toThrow(
        'Internal server error'
      );

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should not affect circuit breaker for non-429 errors', async () => {
      const error = new Error('Validation error');
      (error as any).status = 400;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      await expect(withCircuitBreaker('test-key', fn, fallback)).rejects.toThrow(
        'Validation error'
      );

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
    });
  });

  describe('Circuit Open Behavior', () => {
    it('should use fallback when circuit is open', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback-result');
      const config = { failureThreshold: 1, openDuration: 60000 };

      // Open the circuit
      const error = new Error('Rate limit');
      (error as any).status = 429;
      const failingFn = vi.fn().mockRejectedValue(error);
      await withCircuitBreaker('test-key', failingFn, fallback, config);

      // Circuit should be open, use fallback
      const result = await withCircuitBreaker('test-key', fn, fallback, config);

      expect(result).toBe('fallback-result');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(2); // Once from failure, once from open circuit
    });
  });

  describe('Half-Open State', () => {
    it('should attempt request in half-open state and close on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback-result');
      const config = { failureThreshold: 1, openDuration: 50 };

      // Open the circuit
      const error = new Error('Rate limit');
      (error as any).status = 429;
      const failingFn = vi.fn().mockRejectedValue(error);
      await withCircuitBreaker('test-key', failingFn, fallback, config);

      let status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.OPEN);

      // Wait for circuit to go half-open
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should attempt request and close circuit on success
      const result = await withCircuitBreaker('test-key', fn, fallback, config);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);

      status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(0);
    });

    it('should return to open on failure in half-open state', async () => {
      const error = new Error('Rate limit');
      (error as any).status = 429;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');
      const config = { failureThreshold: 1, openDuration: 50 };

      // Open the circuit
      await withCircuitBreaker('test-key', fn, fallback, config);

      let status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.OPEN);

      // Wait for circuit to go half-open
      await new Promise(resolve => setTimeout(resolve, 60));

      // Should attempt request and return to open on failure
      await withCircuitBreaker('test-key', fn, fallback, config);

      status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Configuration', () => {
    it('should use custom config', async () => {
      const error = new Error('Rate limit');
      (error as any).status = 429;
      const fn = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('fallback-result');
      const config = { failureThreshold: 5 };

      // Should require 5 failures to open
      for (let i = 0; i < 4; i++) {
        await withCircuitBreaker('test-key', fn, fallback, config);
      }

      const status = CircuitBreaker.getStatus('test-key');
      expect(status?.state).toBe(CircuitState.CLOSED);
      expect(status?.failures).toBe(4);
    });

    it('should work with empty config', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const fallback = vi.fn().mockResolvedValue('fallback-result');

      const result = await withCircuitBreaker('test-key', fn, fallback, {});

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
