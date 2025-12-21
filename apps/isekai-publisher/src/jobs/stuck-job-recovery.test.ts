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
import { startStuckJobRecovery } from './stuck-job-recovery';

// Mock node-cron
const mockSchedule = vi.fn();
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: any[]) => mockSchedule(...args),
  },
}));

// Mock deviation-publisher
const mockScheduleDeviation = vi.fn();
vi.mock('../queues/deviation-publisher.js', () => ({
  scheduleDeviation: (...args: any[]) => mockScheduleDeviation(...args),
}));

// Mock r2-cleanup
const mockQueueR2Cleanup = vi.fn();
vi.mock('../queues/r2-cleanup.js', () => ({
  queueR2Cleanup: (...args: any[]) => mockQueueR2Cleanup(...args),
}));

// Mock prisma
vi.mock('../db/index.js', async () => {
  const actual = await vi.importActual('../db/index.js');
  return {
    ...actual,
    prisma: {
      deviation: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      deviationFile: {
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

describe('stuck-job-recovery', () => {
  let prisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();

    const db = await import('../db/index.js');
    prisma = db.prisma;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('recoverStuckJobs', () => {
    it('should return early when no stuck jobs found', async () => {
      prisma.deviation.findMany.mockResolvedValueOnce([]);

      // Trigger via cron
      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(console.log).toHaveBeenCalledWith('[Stuck Job Recovery] No stuck jobs found');
    });

    it('should complete ghost publish (Case 1: has deviationId)', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        deviationId: 'da-123',
        deviationUrl: 'https://deviantart.com/deviation/123',
        executionLockId: 'lock-1',
        executionLockedAt: new Date(),
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);

      // Mock transaction
      const mockTx = {
        deviation: {
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        deviationFile: {
          count: vi.fn().mockResolvedValue(1),
        },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));

      prisma.deviation.update.mockResolvedValue({}); // For releasing lock
      mockQueueR2Cleanup.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      // Should release lock first
      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          executionLockId: null,
          executionLockedAt: null,
          updatedAt: expect.any(Date),
        },
      });

      // Should complete ghost publish
      expect(mockTx.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          status: 'published',
          publishedAt: expect.any(Date),
          errorMessage: null,
          updatedAt: expect.any(Date),
        },
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Completing ghost publish')
      );
    });

    it('should reset and retry (Case 2: has stashItemId)', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        stashItemId: 'stash-123',
        deviationId: null,
        retryCount: 2,
        executionLockId: null,
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      prisma.deviation.update.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          status: 'scheduled',
          retryCount: 0,
          errorMessage: 'Job was stuck and has been automatically retried',
          updatedAt: expect.any(Date),
        },
      });

      expect(mockScheduleDeviation).toHaveBeenCalledWith(
        'dev-1',
        'user-1',
        expect.any(Date),
        'single'
      );

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Reset and queued retry')
      );
    });

    it('should skip retry if retryCount >= 7 (Case 2 fallthrough to Case 3)', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        stashItemId: 'stash-123',
        deviationId: null,
        retryCount: 7, // Too many retries
        executionLockId: null,
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      prisma.deviation.update.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      // Should reset to draft instead
      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          status: 'draft',
          errorMessage: 'Job failed after timeout. Please try scheduling again.',
          updatedAt: expect.any(Date),
        },
      });

      expect(mockScheduleDeviation).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Reset to draft')
      );
    });

    it('should reset to draft (Case 3: no external IDs)', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        stashItemId: null,
        deviationId: null,
        executionLockId: null,
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      prisma.deviation.update.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          status: 'draft',
          errorMessage: 'Job failed after timeout. Please try scheduling again.',
          updatedAt: expect.any(Date),
        },
      });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Reset to draft')
      );
    });

    it('should handle errors during recovery', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        deviationId: null,
        stashItemId: null,
        executionLockId: null,
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      prisma.deviation.update.mockRejectedValueOnce(new Error('Database error'));

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to recover deviation dev-1'),
        expect.any(Error)
      );
    });

    it('should warn when failure rate is high', async () => {
      const mockDeviations = Array.from({ length: 10 }, (_, i) => ({
        id: `dev-${i}`,
        userId: `user-${i}`,
        uploadMode: 'single',
        deviationId: null,
        stashItemId: null,
        executionLockId: null,
        user: { id: `user-${i}` },
      }));

      prisma.deviation.findMany.mockResolvedValueOnce(mockDeviations);
      // First 7 succeed, last 3 fail
      prisma.deviation.update
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValue(new Error('Database error'));

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: High failure rate')
      );
    });

    it('should handle critical errors gracefully', async () => {
      prisma.deviation.findMany.mockRejectedValueOnce(new Error('Database error'));

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(console.error).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Critical error in recovery process:',
        expect.any(Error)
      );
    });

    it('should release lock only if present', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        deviationId: null,
        stashItemId: null,
        executionLockId: null, // No lock
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      prisma.deviation.update.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      // Should not attempt to release lock
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Releasing stale lock')
      );
    });

    it('should handle multiple deviations', async () => {
      const mockDeviations = [
        {
          id: 'dev-1',
          userId: 'user-1',
          uploadMode: 'single',
          deviationId: 'da-1',
          deviationUrl: 'url-1',
          executionLockId: null,
          user: { id: 'user-1' },
        },
        {
          id: 'dev-2',
          userId: 'user-2',
          uploadMode: 'single',
          stashItemId: 'stash-2',
          deviationId: null,
          retryCount: 1,
          executionLockId: null,
          user: { id: 'user-2' },
        },
      ];

      prisma.deviation.findMany.mockResolvedValueOnce(mockDeviations);

      // Mock transaction for ghost publish
      const mockTx = {
        deviation: {
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        deviationFile: {
          count: vi.fn().mockResolvedValue(1),
        },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));

      prisma.deviation.update.mockResolvedValue({});
      mockQueueR2Cleanup.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue({});

      startStuckJobRecovery();
      await vi.advanceTimersByTimeAsync(5000); // Trigger initial recovery

      expect(console.log).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Recovery complete: 2 recovered, 0 failed'
      );
    });
  });

  describe('startStuckJobRecovery', () => {
    it('should schedule cron job to run every 15 minutes', () => {
      startStuckJobRecovery();

      expect(mockSchedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));
      expect(console.log).toHaveBeenCalledWith(
        '[Stuck Job Recovery] Cron job started (runs every 15 minutes)'
      );
    });

    it('should run initial recovery after 5 seconds', async () => {
      prisma.deviation.findMany.mockResolvedValue([]);

      startStuckJobRecovery();

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      expect(console.log).toHaveBeenCalledWith('[Stuck Job Recovery] Running initial recovery check...');
      expect(prisma.deviation.findMany).toHaveBeenCalled();
    });

    it('should handle errors in initial recovery', async () => {
      prisma.deviation.findMany.mockRejectedValueOnce(new Error('Database error'));

      startStuckJobRecovery();

      await vi.advanceTimersByTimeAsync(5000);

      // Error is caught and logged
      expect(console.error).toHaveBeenCalled();
    });
  });
});
