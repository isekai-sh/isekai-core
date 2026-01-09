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

// Mock dependencies
const mockPrismaDeviationFindMany = vi.fn();
const mockPrismaDeviationUpdate = vi.fn();
const mockPrismaDeviationUpdateMany = vi.fn();
const mockPrismaDeviationFileCount = vi.fn();
const mockPrismaTransaction = vi.fn();
const mockScheduleDeviation = vi.fn();
const mockQueueStorageCleanup = vi.fn();
const mockPublisherAlertsHighStuckJobRecoveryRate = vi.fn();
const mockCronSchedule = vi.fn();

vi.mock('../db/index.js', () => ({
  prisma: {
    deviation: {
      findMany: mockPrismaDeviationFindMany,
      update: mockPrismaDeviationUpdate,
      updateMany: mockPrismaDeviationUpdateMany,
    },
    deviationFile: {
      count: mockPrismaDeviationFileCount,
    },
    $transaction: mockPrismaTransaction,
  },
}));

vi.mock('../queues/deviation-publisher.js', () => ({
  scheduleDeviation: mockScheduleDeviation,
}));

vi.mock('../queues/storage-cleanup.js', () => ({
  queueStorageCleanup: mockQueueStorageCleanup,
}));

vi.mock('../lib/alerting.js', () => ({
  PublisherAlerts: {
    highStuckJobRecoveryRate: mockPublisherAlertsHighStuckJobRecoveryRate,
  },
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
  },
}));

describe('stuck-job-recovery', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset modules
    await vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('recoverStuckJobs', () => {
    it('should log when no stuck jobs are found', async () => {
      mockPrismaDeviationFindMany.mockResolvedValue([]);

      // Import and call startStuckJobRecovery to register cron job
      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();

      // Get the cron callback
      expect(mockCronSchedule).toHaveBeenCalled();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(consoleLogSpy).toHaveBeenCalledWith('[Stuck Job Recovery] No stuck jobs found');
    });

    it('should recover ghost publish (has deviationId)', async () => {
      const stuckDeviation = {
        id: 'dev-123',
        deviationId: 'da-123',
        userId: 'user-123',
        status: 'publishing',
        executionLockId: 'lock-123',
        executionLockedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        uploadMode: 'REPLACE',
        deviationUrl: 'https://deviantart.com/...',
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([stuckDeviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          deviation: {
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          deviationFile: {
            count: mockPrismaDeviationFileCount,
          },
        };
        mockPrismaDeviationFileCount.mockResolvedValue(3);
        return await callback(tx);
      });
      mockQueueStorageCleanup.mockResolvedValue(undefined);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPrismaDeviationUpdate).toHaveBeenCalledWith({
        where: { id: 'dev-123' },
        data: {
          executionLockId: null,
          executionLockedAt: null,
          updatedAt: expect.any(Date),
        },
      });
      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(mockQueueStorageCleanup).toHaveBeenCalledWith('dev-123', 'user-123');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Completed ghost publish')
      );
    });

    it('should reset and retry partial publish (has stashItemId, no deviationId)', async () => {
      const stuckDeviation = {
        id: 'dev-456',
        deviationId: null,
        stashItemId: 'stash-456',
        userId: 'user-456',
        status: 'publishing',
        retryCount: 3,
        executionLockId: 'lock-456',
        uploadMode: 'REPLACE',
        user: {
          id: 'user-456',
          email: 'test2@example.com',
        },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([stuckDeviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue(undefined);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPrismaDeviationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dev-456' },
        })
      );
      expect(mockScheduleDeviation).toHaveBeenCalledWith(
        'dev-456',
        'user-456',
        expect.any(Date),
        'REPLACE'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Reset and queued retry'));
    });

    it('should skip retry if retryCount >= 7', async () => {
      const stuckDeviation = {
        id: 'dev-789',
        deviationId: null,
        stashItemId: 'stash-789',
        userId: 'user-789',
        status: 'publishing',
        retryCount: 7,
        executionLockId: 'lock-789',
        uploadMode: 'REPLACE',
        user: {
          id: 'user-789',
          email: 'test3@example.com',
        },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([stuckDeviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockScheduleDeviation).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Reset to draft'));
    });

    it('should reset to draft (no external IDs)', async () => {
      const stuckDeviation = {
        id: 'dev-999',
        deviationId: null,
        stashItemId: null,
        userId: 'user-999',
        status: 'uploading',
        retryCount: 0,
        executionLockId: 'lock-999',
        uploadMode: 'REPLACE',
        user: {
          id: 'user-999',
          email: 'test4@example.com',
        },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([stuckDeviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPrismaDeviationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dev-999' },
          data: expect.objectContaining({
            status: 'draft',
          }),
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Reset to draft'));
    });

    it('should alert on high recovery rate', async () => {
      const stuckDeviations = Array.from({ length: 10 }, (_, i) => ({
        id: `dev-${i}`,
        deviationId: null,
        stashItemId: null,
        userId: `user-${i}`,
        status: 'uploading',
        retryCount: 0,
        executionLockId: `lock-${i}`,
        uploadMode: 'REPLACE' as any,
        user: {
          id: `user-${i}`,
          email: `test${i}@example.com`,
        },
      }));

      mockPrismaDeviationFindMany.mockResolvedValue(stuckDeviations);
      mockPrismaDeviationUpdate.mockResolvedValue({});

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPublisherAlertsHighStuckJobRecoveryRate).toHaveBeenCalledWith(
        1, // 100% recovery rate (10/10)
        10,
        10
      );
    });

    it('should handle individual deviation recovery errors', async () => {
      const stuckDeviations = [
        {
          id: 'dev-error',
          deviationId: null,
          stashItemId: null,
          userId: 'user-error',
          status: 'uploading',
          retryCount: 0,
          executionLockId: 'lock-error',
          uploadMode: 'REPLACE' as any,
          user: {
            id: 'user-error',
            email: 'error@example.com',
          },
        },
      ];

      mockPrismaDeviationFindMany.mockResolvedValue(stuckDeviations);
      mockPrismaDeviationUpdate
        .mockRejectedValueOnce(new Error('Database error'))
        .mockRejectedValueOnce(new Error('Database error'));

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to recover deviation'),
        expect.any(Error)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('0 recovered, 1 failed'));
    });

    it('should handle critical errors in recovery process', async () => {
      mockPrismaDeviationFindMany.mockRejectedValue(new Error('Database connection failed'));

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Critical error in recovery process:',
        expect.any(Error)
      );
    });
  });

  describe('startStuckJobRecovery', () => {
    it('should schedule cron job to run every 15 minutes', async () => {
      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();

      expect(mockCronSchedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Cron job started (runs every 15 minutes)'
      );
    });

    it('should run initial recovery check after 5 seconds', async () => {
      mockPrismaDeviationFindMany.mockResolvedValue([]);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();

      // Advance timers to trigger the setTimeout
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Running initial recovery check...'
      );
    });

    it('should handle initial recovery check errors', async () => {
      mockPrismaDeviationFindMany.mockRejectedValue(new Error('Initial check failed'));

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();

      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Critical error in recovery process:',
        expect.any(Error)
      );
    });

    it('should handle cron job execution errors', async () => {
      mockPrismaDeviationFindMany.mockRejectedValue(new Error('Cron error'));

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical error'),
        expect.any(Error)
      );
    });
  });

  describe('completeGhostPublish with post count increment', () => {
    it('should increment post count for REPLACE mode (fileCount 1)', async () => {
      const deviation = {
        id: 'dev-single',
        deviationId: 'da-single',
        userId: 'user-single',
        uploadMode: 'REPLACE' as any,
        deviationUrl: 'https://deviantart.com/...',
        executionLockId: 'lock-single',
        user: { id: 'user-single', email: 'single@example.com' },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([deviation]);
      mockPrismaDeviationUpdate.mockReset();
      mockPrismaDeviationUpdate.mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          deviation: {
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          deviationFile: {
            count: vi.fn().mockResolvedValue(1),
          },
        };
        return await callback(tx);
      });
      mockQueueStorageCleanup.mockResolvedValue(undefined);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPrismaTransaction).toHaveBeenCalled();
    });

    it('should increment post count for multiple mode (fileCount 5)', async () => {
      const deviation = {
        id: 'dev-multi',
        deviationId: 'da-multi',
        userId: 'user-multi',
        uploadMode: 'multiple' as any,
        deviationUrl: 'https://deviantart.com/...',
        executionLockId: 'lock-multi',
        user: { id: 'user-multi', email: 'multi@example.com' },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([deviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          deviation: {
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          deviationFile: {
            count: vi.fn().mockResolvedValue(5),
          },
        };
        return await callback(tx);
      });
      mockQueueStorageCleanup.mockResolvedValue(undefined);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(mockPrismaTransaction).toHaveBeenCalled();
    });

    it('should skip increment if already incremented (idempotent)', async () => {
      const deviation = {
        id: 'dev-idempotent',
        deviationId: 'da-idempotent',
        userId: 'user-idempotent',
        uploadMode: 'REPLACE' as any,
        deviationUrl: 'https://deviantart.com/...',
        executionLockId: 'lock-idempotent',
        user: { id: 'user-idempotent', email: 'idempotent@example.com' },
      };

      mockPrismaDeviationFindMany.mockResolvedValue([deviation]);
      mockPrismaDeviationUpdate.mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        const tx = {
          deviation: {
            update: vi.fn().mockResolvedValue({}),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Already incremented
          },
          deviationFile: {
            count: vi.fn().mockResolvedValue(1),
          },
        };
        return await callback(tx);
      });
      mockQueueStorageCleanup.mockResolvedValue(undefined);

      const { startStuckJobRecovery } = await import('./stuck-job-recovery.js');
      startStuckJobRecovery();
      const cronCallback = mockCronSchedule.mock.calls[0][1];

      await cronCallback();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Post count already incremented')
      );
    });
  });
});
