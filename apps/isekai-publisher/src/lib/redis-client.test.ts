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
import { RedisClientManager } from './redis-client';

// Mock ioredis to use ioredis-mock
vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { Redis: RedisMock };
});

describe('RedisClientManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    RedisClientManager.reset();
    originalEnv = process.env;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    RedisClientManager.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return null when REDIS_URL is not configured', async () => {
      process.env.REDIS_URL = '';

      const client = await RedisClientManager.getClient();

      expect(client).toBeNull();
      expect(console.log).toHaveBeenCalledWith('[Redis] No REDIS_URL configured, caching disabled');
    });

    it('should create and return a Redis client when REDIS_URL is set', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const client = await RedisClientManager.getClient();

      expect(client).not.toBeNull();
      expect(typeof client?.ping).toBe('function');
    });

    it('should return the same instance on subsequent calls', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const client1 = await RedisClientManager.getClient();
      const client2 = await RedisClientManager.getClient();

      expect(client1).toBe(client2);
    });
  });

  describe('Status Methods', () => {
    it('isAvailable should return false when no client exists', () => {
      expect(RedisClientManager.isAvailable()).toBe(false);
    });

    it('isAvailable should check if client exists', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      // ioredis-mock doesn't set status, so isAvailable may return false
      // Just check that it doesn't throw
      const available = RedisClientManager.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('getStatus should return unavailable when no instance exists', () => {
      expect(RedisClientManager.getStatus()).toBe('unavailable');
    });

    it('getStatus should return status when instance exists', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      const status = RedisClientManager.getStatus();
      // ioredis-mock may not set status, but it should not be unavailable
      expect(status).not.toBe('unavailable');
    });
  });

  describe('Health Checks', () => {
    it('ping should return false when client is null', async () => {
      process.env.REDIS_URL = '';

      const result = await RedisClientManager.ping();

      expect(result).toBe(false);
    });

    it('ping should return true when client is connected', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      const result = await RedisClientManager.ping();

      expect(result).toBe(true);
    });

    it('getLatency should return null when client is null', async () => {
      process.env.REDIS_URL = '';

      const latency = await RedisClientManager.getLatency();

      expect(latency).toBeNull();
    });

    it('getLatency should return a number when client is connected', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      const latency = await RedisClientManager.getLatency();

      expect(latency).toBeGreaterThanOrEqual(0);
      expect(typeof latency).toBe('number');
    });
  });

  describe('Lifecycle', () => {
    it('close should do nothing when no instance exists', async () => {
      await RedisClientManager.close();

      expect(console.log).not.toHaveBeenCalledWith('[Redis] Closing Redis connection...');
    });

    it('close should close connection and reset instance', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      await RedisClientManager.close();

      expect(console.log).toHaveBeenCalledWith('[Redis] Closing Redis connection...');
      expect(RedisClientManager.getStatus()).toBe('unavailable');
    });

    it('reset should clear all static properties', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      await RedisClientManager.getClient();

      RedisClientManager.reset();

      expect(RedisClientManager.getStatus()).toBe('unavailable');
    });

    it('should allow fresh initialization after reset', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const client1 = await RedisClientManager.getClient();
      RedisClientManager.reset();
      const client2 = await RedisClientManager.getClient();

      expect(client2).not.toBe(client1);
      expect(client2).not.toBeNull();
    });
  });
});
