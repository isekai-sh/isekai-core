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
import { publishDeviationJob } from './core.js';
import type { PublisherDependencies, DeviationPublishJobData } from './types.js';

describe('publishDeviationJob', () => {
  let mockPrisma: any;
  let mockDeps: PublisherDependencies;
  let mockJob: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Mock console to suppress logs during tests
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    };

    // Mock Prisma client
    mockPrisma = {
      deviation: {
        updateMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    // Mock dependencies
    mockDeps = {
      prisma: mockPrisma,
      logger: {
        createJobLogger: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          getCorrelationId: vi.fn(() => 'test-correlation-id'),
        })),
      },
      rateLimiter: {
        shouldAllowRequest: vi.fn(),
        recordSuccess: vi.fn(),
        recordFailure: vi.fn(),
      },
      metricsCollector: {
        recordJobStart: vi.fn(),
        recordJobSuccess: vi.fn(),
        recordJobFailure: vi.fn(),
        recordRateLimitHit: vi.fn(),
      },
      CircuitBreaker: {
        shouldAllowRequest: vi.fn(),
      },
      withCircuitBreaker: vi.fn(),
      publishToDeviantArt: vi.fn(),
      queueStorageCleanup: vi.fn(),
      errorCategorizer: {
        categorize: vi.fn(),
      },
    };

    // Mock job
    mockJob = {
      id: 'job-123',
      attemptsMade: 0,
      data: {
        deviationId: 'dev-123',
        userId: 'user-123',
        uploadMode: 'single',
      } as DeviationPublishJobData,
      opts: {
        attempts: 7,
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execution lock', () => {
    it('should acquire lock before processing', async () => {
      // Mock lock acquisition success
      mockPrisma.deviation.updateMany.mockResolvedValueOnce({ count: 1 });
      // Mock lock release
      mockPrisma.deviation.updateMany.mockResolvedValueOnce({ count: 1 });
      // Mock deviation not found to exit early
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce(null);

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow();

      // Verify lock was attempted
      expect(mockPrisma.deviation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'dev-123',
          }),
          data: expect.objectContaining({
            executionLockId: expect.any(String),
          }),
        })
      );
    });

    it('should return success if lock already held by another worker', async () => {
      // Mock lock acquisition failure (count: 0)
      mockPrisma.deviation.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.alreadyRunning).toBe(true);
      expect(result.results).toEqual([]);
    });

    it('should release lock after successful execution', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 }) // Lock acquisition
        .mockResolvedValueOnce({ count: 1 }); // Lock release

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'published',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/dev/123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.alreadyPublished).toBe(true);

      // Verify lock release was called
      expect(mockPrisma.deviation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'dev-123',
            executionLockId: expect.any(String),
          }),
          data: expect.objectContaining({
            executionLockId: null,
            executionLockedAt: null,
          }),
        })
      );
    });

    it('should release lock even on error', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 }) // Lock acquisition
        .mockResolvedValueOnce({ count: 1 }); // Lock release

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce(null);

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow();

      // Verify lock release was still called
      expect(mockPrisma.deviation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionLockId: null,
          }),
        })
      );
    });
  });

  describe('circuit breaker', () => {
    it('should check circuit breaker before processing', async () => {
      mockPrisma.deviation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.deviation.updateMany.mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(false);

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow('CIRCUIT_OPEN');

      expect(mockDeps.CircuitBreaker.shouldAllowRequest).toHaveBeenCalledWith(
        'deviantart:publish:user-123'
      );
    });

    it('should proceed when circuit breaker allows', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'published',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/dev/123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should check rate limiter before processing', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({
        allowed: false,
        waitMs: 5000,
        reason: 'Rate limit exceeded',
      });

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow('RATE_LIMITED');

      expect(mockDeps.rateLimiter.shouldAllowRequest).toHaveBeenCalledWith('user-123');
    });

    it('should proceed when rate limiter allows', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'published',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/dev/123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      await publishDeviationJob(mockJob, mockDeps);

      expect(mockDeps.rateLimiter.shouldAllowRequest).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should skip already published deviations', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'published',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/dev/123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.alreadyPublished).toBe(true);
      expect(result.results).toEqual([
        { deviationId: 'da-123', url: 'https://deviantart.com/dev/123' },
      ]);
    });

    it('should handle Sta.sh-only already published', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        stashOnly: true,
        stashItemId: 'stash-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.alreadyPublished).toBe(true);
    });
  });

  describe('validation', () => {
    it('should throw error if deviation not found', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce(null);

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow(
        'Deviation dev-123 not found'
      );
    });

    it('should throw error if user not found', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        files: [{ id: 'file-1' }],
        user: null,
      });

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow(
        'User user-123 not found'
      );
    });

    it('should throw error if no files', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        files: [],
        user: { id: 'user-123' },
      });

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow(
        'Deviation dev-123 has no files'
      );
    });
  });

  describe('successful publish', () => {
    it('should publish deviation and update status', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 }) // Lock
        .mockResolvedValueOnce({ count: 0 }) // Idempotency check in transaction
        .mockResolvedValueOnce({ count: 1 }); // Release lock

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update
        .mockResolvedValueOnce({}) // Retry tracking
        .mockResolvedValueOnce({}); // Status update in transaction

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123', username: 'testuser' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([
        { deviationId: 'da-123', url: 'https://deviantart.com/dev/123' },
      ]);
      expect(mockDeps.publishToDeviantArt).toHaveBeenCalled();
      expect(mockDeps.rateLimiter.recordSuccess).toHaveBeenCalledWith('user-123');
    });

    it('should publish deviation in Sta.sh-only mode', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        stashOnly: true,
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'stash-123',
        url: '',
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.results).toEqual([{ deviationId: 'stash-123', url: '' }]);
    });

    it('should create sale queue entry with automation', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        automationId: 'auto-123',
        userId: 'user-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      // Mock transaction with automation and sale queue preset
      const mockTx = {
        ...mockPrisma,
        automation: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'auto-123',
            autoAddToSaleQueue: true,
            saleQueuePresetId: 'preset-123',
            saleQueuePreset: {
              id: 'preset-123',
              price: 1000,
              minPrice: null,
              maxPrice: null,
            },
          }),
        },
        saleQueue: {
          create: vi.fn().mockResolvedValueOnce({}),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(mockTx.saleQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            price: 1000,
            status: 'pending',
          }),
        })
      );
    });

    it('should create sale queue entry with random price', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        automationId: 'auto-123',
        userId: 'user-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      const mockTx = {
        ...mockPrisma,
        automation: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'auto-123',
            autoAddToSaleQueue: true,
            saleQueuePresetId: 'preset-123',
            saleQueuePreset: {
              id: 'preset-123',
              price: 1000,
              minPrice: 500,
              maxPrice: 1500,
            },
          }),
        },
        saleQueue: {
          create: vi.fn().mockResolvedValueOnce({}),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(mockTx.saleQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            price: expect.any(Number),
            status: 'pending',
          }),
        })
      );

      // Verify price is within range
      const call = mockTx.saleQueue.create.mock.calls[0][0];
      expect(call.data.price).toBeGreaterThanOrEqual(500);
      expect(call.data.price).toBeLessThanOrEqual(1500);
    });

    it('should skip sale queue for Sta.sh-only mode', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        automationId: 'auto-123',
        stashOnly: true,
        userId: 'user-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'stash-123',
        url: '',
      });

      const mockTx = {
        ...mockPrisma,
        automation: {
          findUnique: vi.fn(),
        },
        saleQueue: {
          create: vi.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      // Should not attempt to create sale queue
      expect(mockTx.automation.findUnique).not.toHaveBeenCalled();
      expect(mockTx.saleQueue.create).not.toHaveBeenCalled();
    });

    it('should handle duplicate sale queue entry', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        automationId: 'auto-123',
        userId: 'user-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      const duplicateError: any = new Error('Unique constraint failed');
      duplicateError.code = 'P2002';

      const mockTx = {
        ...mockPrisma,
        automation: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'auto-123',
            autoAddToSaleQueue: true,
            saleQueuePresetId: 'preset-123',
            saleQueuePreset: {
              id: 'preset-123',
              price: 1000,
              minPrice: null,
              maxPrice: null,
            },
          }),
        },
        saleQueue: {
          create: vi.fn().mockRejectedValueOnce(duplicateError),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      // Should still succeed despite duplicate error
      expect(result.success).toBe(true);
    });

    it('should handle sale queue creation errors', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        automationId: 'auto-123',
        userId: 'user-123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      const mockTx = {
        ...mockPrisma,
        automation: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 'auto-123',
            autoAddToSaleQueue: true,
            saleQueuePresetId: 'preset-123',
            saleQueuePreset: {
              id: 'preset-123',
              price: 1000,
              minPrice: null,
              maxPrice: null,
            },
          }),
        },
        saleQueue: {
          create: vi.fn().mockRejectedValueOnce(new Error('Database error')),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      // Should still succeed despite sale queue error
      expect(result.success).toBe(true);
    });

    it('should handle multiple results in multiple mode', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }, { id: 'file-2' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce([
        { deviationId: 'da-123', url: 'https://deviantart.com/dev/123' },
        { deviationId: 'da-124', url: 'https://deviantart.com/dev/124' },
      ]);

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      mockJob.data.uploadMode = 'multiple';

      const result = await publishDeviationJob(mockJob, mockDeps);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should handle R2 cleanup failure gracefully', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      // R2 cleanup fails but shouldn't affect the result
      mockDeps.queueStorageCleanup.mockRejectedValueOnce(new Error('R2 service unavailable'));
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      const result = await publishDeviationJob(mockJob, mockDeps);

      // Should still succeed despite R2 cleanup failure
      expect(result.success).toBe(true);
      expect(result.results).toEqual([
        { deviationId: 'da-123', url: 'https://deviantart.com/dev/123' },
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle publish errors and reset to draft on final attempt', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({}); // Status update to draft

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const error = new Error('DeviantArt API error');
      mockDeps.withCircuitBreaker.mockRejectedValueOnce(error);
      mockDeps.errorCategorizer.categorize.mockReturnValueOnce({
        category: 'API_ERROR',
        isRetryable: false,
        errorContext: { message: 'DeviantArt API error' },
      });

      mockJob.attemptsMade = 6; // Final attempt

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow('DeviantArt API error');

      // Verify status was reset to draft
      expect(mockPrisma.deviation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'draft',
          }),
        })
      );
    });

    it('should handle rate limit errors', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      const error: any = new Error('Rate limited');
      error.retryAfter = '60';

      mockDeps.withCircuitBreaker.mockRejectedValueOnce(error);
      mockDeps.errorCategorizer.categorize.mockReturnValueOnce({
        category: 'RATE_LIMIT',
        isRetryable: true,
        errorContext: { message: 'Rate limited' },
      });

      await expect(publishDeviationJob(mockJob, mockDeps)).rejects.toThrow();

      expect(mockDeps.rateLimiter.recordFailure).toHaveBeenCalledWith('user-123', '60');
      expect(mockDeps.metricsCollector.recordRateLimitHit).toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should record job start when lock is acquired', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 }) // Lock acquired
        .mockResolvedValueOnce({ count: 1 }); // Lock release

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });
      mockPrisma.deviation.update.mockResolvedValueOnce({});
      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'published',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/dev/123',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      await publishDeviationJob(mockJob, mockDeps);

      expect(mockDeps.metricsCollector.recordJobStart).toHaveBeenCalledWith('job-123', 'dev-123');
    });

    it('should record job success with latency', async () => {
      mockPrisma.deviation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      mockDeps.CircuitBreaker.shouldAllowRequest.mockResolvedValueOnce(true);
      mockDeps.rateLimiter.shouldAllowRequest.mockResolvedValueOnce({ allowed: true });

      mockPrisma.deviation.update.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      mockPrisma.deviation.findFirst.mockResolvedValueOnce({
        id: 'dev-123',
        status: 'scheduled',
        files: [{ id: 'file-1' }],
        user: { id: 'user-123' },
      });

      mockDeps.withCircuitBreaker.mockImplementation(async (key, operation) => {
        return await operation();
      });

      mockDeps.publishToDeviantArt.mockResolvedValueOnce({
        deviationId: 'da-123',
        url: 'https://deviantart.com/dev/123',
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockDeps.queueStorageCleanup.mockResolvedValueOnce(undefined);
      mockDeps.rateLimiter.recordSuccess.mockResolvedValueOnce(undefined);

      await publishDeviationJob(mockJob, mockDeps);

      expect(mockDeps.metricsCollector.recordJobSuccess).toHaveBeenCalledWith(
        'job-123',
        expect.any(Number)
      );
    });
  });
});
