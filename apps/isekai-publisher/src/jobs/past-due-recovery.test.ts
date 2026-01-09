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
import { runPastDueRecovery, startPastDueRecovery } from './past-due-recovery';

// Mock node-cron
const mockSchedule = vi.fn();
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: any[]) => mockSchedule(...args),
  },
}));

// Mock deviation-publisher queue
const mockGetJob = vi.fn();
const mockScheduleDeviation = vi.fn();

vi.mock('../queues/deviation-publisher.js', () => ({
  deviationPublisherQueue: {
    getJob: (...args: any[]) => mockGetJob(...args),
  },
  scheduleDeviation: (...args: any[]) => mockScheduleDeviation(...args),
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
      },
    },
  };
});

describe('past-due-recovery', () => {
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

  describe('runPastDueRecovery', () => {
    it('should find no past due deviations and return early', async () => {
      prisma.deviation.findMany.mockResolvedValueOnce([]);

      await runPastDueRecovery();

      expect(console.log).toHaveBeenCalledWith('[Past Due Recovery] No past due deviations found');
      expect(mockGetJob).not.toHaveBeenCalled();
    });

    it('should re-queue deviation when job not found in queue', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        actualPublishAt: new Date('2025-01-01T10:00:00Z'),
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(null); // No job in queue
      prisma.deviation.update.mockResolvedValueOnce({});
      mockScheduleDeviation.mockResolvedValueOnce({});

      await runPastDueRecovery();

      expect(mockGetJob).toHaveBeenCalledWith('deviation-dev-1');
      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          retryCount: 0,
          errorMessage: 'Scheduled job was lost and has been automatically recovered',
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
        '[Past Due Recovery] Re-queued deviation dev-1 (no job found)'
      );
    });

    it('should re-queue when job is in completed state', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        user: { id: 'user-1' },
      };

      const mockJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn(),
        attemptsMade: 1,
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(mockJob);
      prisma.deviation.update.mockResolvedValueOnce({});
      mockScheduleDeviation.mockResolvedValueOnce({});

      await runPastDueRecovery();

      expect(mockJob.remove).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Re-queued deviation dev-1 (old job state: completed)'
      );
    });

    it('should re-queue when job is in failed state', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        user: { id: 'user-1' },
      };

      const mockJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        remove: vi.fn(),
        attemptsMade: 3,
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(mockJob);
      prisma.deviation.update.mockResolvedValueOnce({});
      mockScheduleDeviation.mockResolvedValueOnce({});

      await runPastDueRecovery();

      expect(mockJob.remove).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Re-queued deviation dev-1 (old job state: failed)'
      );
    });

    it('should reset waiting job with burned attempts', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        user: { id: 'user-1' },
      };

      const mockJob = {
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn(),
        attemptsMade: 3, // >= 2
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(mockJob);
      prisma.deviation.update.mockResolvedValueOnce({});
      mockScheduleDeviation.mockResolvedValueOnce({});

      await runPastDueRecovery();

      expect(mockJob.remove).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Reset job with 3 burned attempts (state: waiting) - deviation dev-1'
      );
    });

    it('should warn about active job with high attempts', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        user: { id: 'user-1' },
      };

      const mockJob = {
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
        attemptsMade: 4, // >= 4
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(mockJob);

      await runPastDueRecovery();

      expect(mockJob.remove).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        '[Past Due Recovery] Job dev-1 is active but has 4 attempts - monitoring'
      );
    });

    it('should skip job processing normally', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        user: { id: 'user-1' },
      };

      const mockJob = {
        getState: vi.fn().mockResolvedValue('waiting'),
        attemptsMade: 1, // < 2
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockResolvedValueOnce(mockJob);

      await runPastDueRecovery();

      expect(prisma.deviation.update).not.toHaveBeenCalled();
      expect(mockScheduleDeviation).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Deviation dev-1 already in queue (state: waiting, attempts: 1), skipping'
      );
    });

    it('should handle errors during recovery and update deviation', async () => {
      const mockDeviation = {
        id: 'dev-1',
        userId: 'user-1',
        uploadMode: 'single',
        user: { id: 'user-1' },
      };

      prisma.deviation.findMany.mockResolvedValueOnce([mockDeviation]);
      mockGetJob.mockRejectedValueOnce(new Error('Queue error'));
      prisma.deviation.update.mockResolvedValueOnce({});

      await runPastDueRecovery();

      expect(console.error).toHaveBeenCalledWith(
        '[Past Due Recovery] Failed to recover deviation dev-1:',
        expect.any(Error)
      );
      expect(prisma.deviation.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          errorMessage: 'Recovery failed: Queue error',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle multiple deviations', async () => {
      const mockDeviations = [
        { id: 'dev-1', userId: 'user-1', uploadMode: 'single', user: { id: 'user-1' } },
        { id: 'dev-2', userId: 'user-2', uploadMode: 'multiple', user: { id: 'user-2' } },
      ];

      prisma.deviation.findMany.mockResolvedValueOnce(mockDeviations);
      mockGetJob.mockResolvedValue(null); // Both not in queue
      prisma.deviation.update.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue({});

      await runPastDueRecovery();

      expect(mockGetJob).toHaveBeenCalledTimes(2);
      expect(prisma.deviation.update).toHaveBeenCalledTimes(2);
      expect(mockScheduleDeviation).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Recovery complete: 2 recovered, 0 already queued, 0 failed'
      );
    });

    it('should warn when recovery rate is high', async () => {
      const mockDeviations = Array.from({ length: 15 }, (_, i) => ({
        id: `dev-${i}`,
        userId: `user-${i}`,
        uploadMode: 'single',
        user: { id: `user-${i}` },
      }));

      prisma.deviation.findMany.mockResolvedValueOnce(mockDeviations);
      mockGetJob.mockResolvedValue(null); // All not in queue
      prisma.deviation.update.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue({});

      await runPastDueRecovery();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: High recovery rate')
      );
    });

    it('should warn when failure rate is high', async () => {
      const mockDeviations = Array.from({ length: 10 }, (_, i) => ({
        id: `dev-${i}`,
        userId: `user-${i}`,
        uploadMode: 'single',
        user: { id: `user-${i}` },
      }));

      prisma.deviation.findMany.mockResolvedValueOnce(mockDeviations);
      // First 2 succeed, rest fail
      mockGetJob
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new Error('Queue error'));
      prisma.deviation.update.mockResolvedValue({});
      mockScheduleDeviation.mockResolvedValue({});

      await runPastDueRecovery();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: High failure rate')
      );
    });

    it('should handle critical errors gracefully', async () => {
      prisma.deviation.findMany.mockRejectedValueOnce(new Error('Database error'));

      await runPastDueRecovery();

      expect(console.error).toHaveBeenCalledWith(
        '[Past Due Recovery] Critical error in recovery process:',
        expect.any(Error)
      );
    });
  });

  describe('startPastDueRecovery', () => {
    it('should schedule cron job to run every 10 minutes', () => {
      startPastDueRecovery();

      expect(mockSchedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Cron job started (runs every 10 minutes)'
      );
    });

    it('should run initial recovery after 10 seconds', async () => {
      prisma.deviation.findMany.mockResolvedValue([]);

      startPastDueRecovery();

      // Fast-forward 10 seconds
      await vi.advanceTimersByTimeAsync(10000);

      expect(console.log).toHaveBeenCalledWith(
        '[Past Due Recovery] Running initial recovery check...'
      );
      expect(prisma.deviation.findMany).toHaveBeenCalled();
    });

    it('should handle errors in initial recovery', async () => {
      prisma.deviation.findMany.mockRejectedValueOnce(new Error('Database error'));

      startPastDueRecovery();

      await vi.advanceTimersByTimeAsync(10000);

      // Error is caught inside recoverPastDueDeviations and logged there
      expect(console.error).toHaveBeenCalledWith(
        '[Past Due Recovery] Critical error in recovery process:',
        expect.any(Error)
      );
    });
  });
});
