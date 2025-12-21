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
import { runLockCleanup, startLockCleanup } from './lock-cleanup';

// Mock node-cron
const mockSchedule = vi.fn();
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: any[]) => mockSchedule(...args),
  },
}));

// Mock prisma
vi.mock('../db/index.js', async () => {
  const actual = await vi.importActual('../db/index.js');
  return {
    ...actual,
    prisma: {
      deviation: {
        updateMany: vi.fn(),
      },
    },
  };
});

describe('lock-cleanup', () => {
  let mockUpdateMany: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();

    // Import prisma mock
    const { prisma } = await import('../db/index.js');
    mockUpdateMany = prisma.deviation.updateMany as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('runLockCleanup', () => {
    it('should release stale locks older than 30 minutes', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      mockUpdateMany.mockResolvedValueOnce({ count: 3 });

      await runLockCleanup();

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          executionLockId: { not: null },
          executionLockedAt: { lt: new Date('2025-01-01T11:30:00Z') }, // 30 mins ago
          status: { in: ['scheduled', 'draft'] },
        },
        data: {
          executionLockId: null,
          executionLockedAt: null,
          updatedAt: expect.any(Date),
        },
      });

      expect(console.log).toHaveBeenCalledWith('[Lock Cleanup] Released 3 stale locks');
    });

    it('should not log when no locks are released', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });

      await runLockCleanup();

      expect(mockUpdateMany).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Released'));
    });

    it('should handle prisma errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockUpdateMany.mockRejectedValueOnce(error);

      await runLockCleanup();

      expect(console.error).toHaveBeenCalledWith(
        '[Lock Cleanup] Failed to cleanup stale locks:',
        error
      );
    });

    it('should only target scheduled and draft deviations', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await runLockCleanup();

      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['scheduled', 'draft'] });
    });

    it('should only clear locks that are not null', async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await runLockCleanup();

      const call = mockUpdateMany.mock.calls[0][0];
      expect(call.where.executionLockId).toEqual({ not: null });
    });
  });

  describe('startLockCleanup', () => {
    it('should schedule cron job to run every 5 minutes', () => {
      startLockCleanup();

      expect(mockSchedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function)
      );
    });

    it('should log startup message', () => {
      startLockCleanup();

      expect(console.log).toHaveBeenCalledWith(
        '[Lock Cleanup] Cron job started (runs every 5 minutes)'
      );
    });

    it('should run initial cleanup after 15 seconds', async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      startLockCleanup();

      // Initial message
      expect(console.log).toHaveBeenCalledWith(
        '[Lock Cleanup] Cron job started (runs every 5 minutes)'
      );

      // Fast-forward 15 seconds
      await vi.advanceTimersByTimeAsync(15000);

      expect(console.log).toHaveBeenCalledWith('[Lock Cleanup] Running initial cleanup check...');
      expect(mockUpdateMany).toHaveBeenCalled();
    });

    it('should handle errors in cron job execution', async () => {
      const error = new Error('Cron execution failed');

      // Capture the cron callback
      let cronCallback: Function | undefined;
      mockSchedule.mockImplementation((schedule: string, callback: Function) => {
        cronCallback = callback;
      });

      startLockCleanup();

      expect(cronCallback).toBeDefined();

      // Simulate error in cron execution
      mockUpdateMany.mockRejectedValueOnce(error);
      await cronCallback!();

      expect(console.error).toHaveBeenCalledWith(
        '[Lock Cleanup] Failed to cleanup stale locks:',
        error
      );
    });

    it('should handle errors in initial cleanup', async () => {
      const error = new Error('Initial cleanup failed');
      mockUpdateMany.mockRejectedValueOnce(error);

      startLockCleanup();

      // Fast-forward 15 seconds
      await vi.advanceTimersByTimeAsync(15000);

      // Error is caught inside cleanupStaleLocks and logged there
      expect(console.error).toHaveBeenCalledWith(
        '[Lock Cleanup] Failed to cleanup stale locks:',
        error
      );
    });

    it('should successfully execute cron callback', async () => {
      mockUpdateMany.mockResolvedValue({ count: 2 });

      // Capture the cron callback
      let cronCallback: Function | undefined;
      mockSchedule.mockImplementation((schedule: string, callback: Function) => {
        cronCallback = callback;
      });

      startLockCleanup();

      expect(cronCallback).toBeDefined();

      // Execute the cron callback
      await cronCallback!();

      expect(mockUpdateMany).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('[Lock Cleanup] Released 2 stale locks');
    });
  });
});
