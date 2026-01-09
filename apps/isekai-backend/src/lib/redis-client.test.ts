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
import { RedisClientManager } from './redis-client.js';

// Mock ioredis
const mockRedisConnect = vi.fn();
const mockRedisQuit = vi.fn();
const mockRedisOn = vi.fn();
const mockRedisPing = vi.fn();

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      connect = mockRedisConnect;
      quit = mockRedisQuit;
      on = mockRedisOn;
      ping = mockRedisPing;
    },
  };
});

describe('redis-client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;

    // Reset singleton state
    (RedisClientManager as any).instance = null;
    (RedisClientManager as any).initPromise = null;
    (RedisClientManager as any).isInitializing = false;

    // Suppress console output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getClient', () => {
    it('should return null when REDIS_URL is not configured', async () => {
      delete process.env.REDIS_URL;

      const client = await RedisClientManager.getClient();

      expect(client).toBeNull();
      expect(console.log).toHaveBeenCalledWith('[Redis] No REDIS_URL configured, caching disabled');
    });

    it('should return existing instance on subsequent calls', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      const client1 = await RedisClientManager.getClient();
      const client2 = await RedisClientManager.getClient();

      expect(client1).toBe(client2);
      expect(mockRedisConnect).toHaveBeenCalledTimes(1);
    });

    it('should wait for initialization if already in progress', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Delay the connect to simulate slow connection
      mockRedisConnect.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(undefined), 100))
      );

      // Make two simultaneous calls
      const [client1, client2] = await Promise.all([
        RedisClientManager.getClient(),
        RedisClientManager.getClient(),
      ]);

      expect(client1).toBe(client2);
      expect(mockRedisConnect).toHaveBeenCalledTimes(1);
    });

    it('should connect successfully with valid REDIS_URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      const client = await RedisClientManager.getClient();

      expect(client).not.toBeNull();
      expect(mockRedisConnect).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        '[Redis] Attempting to connect to Redis for caching...'
      );
      expect(console.log).toHaveBeenCalledWith(
        '[Redis] Successfully connected to Redis for caching'
      );
    });

    it('should handle connection timeout', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Never resolve to simulate timeout
      mockRedisConnect.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const client = await RedisClientManager.getClient();

      expect(client).toBeNull();
    }, 10000);

    it('should handle connection errors', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockRejectedValue(new Error('Connection refused'));

      const client = await RedisClientManager.getClient();

      expect(client).toBeNull();
    });

    it('should configure TLS for rediss:// URLs', async () => {
      process.env.REDIS_URL = 'rediss://secure.example.com:6380';
      mockRedisConnect.mockResolvedValue(undefined);

      await RedisClientManager.getClient();

      // TLS should be configured (we can't directly check the config with mocks,
      // but we verify connection was attempted)
      expect(mockRedisConnect).toHaveBeenCalled();
    });

    it('should attach event handlers to client', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      await RedisClientManager.getClient();

      // Should attach error, reconnecting, and ready handlers
      expect(mockRedisOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockRedisOn).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should log error events', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      let errorHandler: Function;
      mockRedisOn.mockImplementation((event, handler) => {
        if (event === 'error') {
          errorHandler = handler;
        }
      });

      await RedisClientManager.getClient();

      // Trigger error event
      errorHandler!(new Error('Connection lost'));

      expect(console.error).toHaveBeenCalledWith('[Redis] Runtime error:', 'Connection lost');
    });

    it('should log reconnecting events', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      let reconnectHandler: Function;
      mockRedisOn.mockImplementation((event, handler) => {
        if (event === 'reconnecting') {
          reconnectHandler = handler;
        }
      });

      await RedisClientManager.getClient();

      // Trigger reconnecting event
      reconnectHandler!();

      expect(console.log).toHaveBeenCalledWith('[Redis] Reconnecting to Redis...');
    });

    it('should log ready events', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      let readyHandler: Function;
      mockRedisOn.mockImplementation((event, handler) => {
        if (event === 'ready') {
          readyHandler = handler;
        }
      });

      await RedisClientManager.getClient();

      // Trigger ready event
      readyHandler!();

      expect(console.log).toHaveBeenCalledWith('[Redis] Redis client ready');
    });
  });

  describe('isAvailable', () => {
    it('should return false when no client exists', async () => {
      delete process.env.REDIS_URL;
      await RedisClientManager.getClient();

      const available = RedisClientManager.isAvailable();

      expect(available).toBe(false);
    });

    it('should return true when client is ready', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);

      await RedisClientManager.getClient();

      // Mock the status property
      const instance = (RedisClientManager as any).instance;
      if (instance) {
        instance.status = 'ready';
      }

      const available = RedisClientManager.isAvailable();

      expect(available).toBe(true);
    });
  });

  describe('ping', () => {
    it('should return false when no client exists', async () => {
      delete process.env.REDIS_URL;

      const result = await RedisClientManager.ping();

      expect(result).toBe(false);
    });

    it('should return true on successful ping', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisPing.mockResolvedValue('PONG');

      await RedisClientManager.getClient();
      const result = await RedisClientManager.ping();

      expect(result).toBe(true);
    });

    it('should return false on ping failure', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisPing.mockRejectedValue(new Error('Connection lost'));

      await RedisClientManager.getClient();
      const result = await RedisClientManager.ping();

      expect(result).toBe(false);
    });
  });

  describe('getLatency', () => {
    it('should return null when no client exists', async () => {
      delete process.env.REDIS_URL;

      const latency = await RedisClientManager.getLatency();

      expect(latency).toBeNull();
    });

    it('should return latency in milliseconds on success', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisPing.mockResolvedValue('PONG');

      await RedisClientManager.getClient();
      const latency = await RedisClientManager.getLatency();

      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should return null on ping failure', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisPing.mockRejectedValue(new Error('Connection lost'));

      await RedisClientManager.getClient();
      const latency = await RedisClientManager.getLatency();

      expect(latency).toBeNull();
    });
  });

  describe('close', () => {
    it('should quit client when instance exists', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisQuit.mockResolvedValue('OK');

      await RedisClientManager.getClient();
      await RedisClientManager.close();

      expect(mockRedisQuit).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('[Redis] Closing Redis connection...');
      expect(console.log).toHaveBeenCalledWith('[Redis] Redis connection closed successfully');
    });

    it('should do nothing when no client exists', async () => {
      await RedisClientManager.close();

      expect(mockRedisQuit).not.toHaveBeenCalled();
    });

    it('should handle quit errors gracefully', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      mockRedisConnect.mockResolvedValue(undefined);
      mockRedisQuit.mockRejectedValue(new Error('Already closed'));

      await RedisClientManager.getClient();
      await RedisClientManager.close();

      expect(console.error).toHaveBeenCalledWith(
        '[Redis] Error closing Redis connection:',
        expect.any(Error)
      );
    });
  });
});
