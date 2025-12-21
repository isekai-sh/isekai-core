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

// Mock node-cron
const mockCronSchedule = vi.fn();
vi.mock('node-cron', () => ({
  default: {
    schedule: (...args: any[]) => mockCronSchedule(...args),
  },
}));

// Mock date-fns-tz
const mockToZonedTime = vi.fn();
const mockFromZonedTime = vi.fn();
vi.mock('date-fns-tz', () => ({
  toZonedTime: (...args: any[]) => mockToZonedTime(...args),
  fromZonedTime: (...args: any[]) => mockFromZonedTime(...args),
}));

// Mock scheduleDeviation
const mockScheduleDeviation = vi.fn();
vi.mock('../queues/deviation-publisher.js', () => ({
  scheduleDeviation: (...args: any[]) => mockScheduleDeviation(...args),
}));

// Mock prisma
const mockPrismaAutomationFindMany = vi.fn();
const mockPrismaAutomationUpdate = vi.fn();
const mockPrismaAutomationUpdateMany = vi.fn();
const mockPrismaDeviationFindMany = vi.fn();
const mockPrismaDeviationUpdate = vi.fn();
const mockPrismaDeviationUpdateMany = vi.fn();
const mockPrismaAutomationExecutionLogFindFirst = vi.fn();
const mockPrismaAutomationExecutionLogAggregate = vi.fn();
const mockPrismaAutomationExecutionLogCreate = vi.fn();
const mockPrismaTransaction = vi.fn();

vi.mock('../db/index.js', () => ({
  prisma: {
    automation: {
      findMany: mockPrismaAutomationFindMany,
      update: mockPrismaAutomationUpdate,
      updateMany: mockPrismaAutomationUpdateMany,
    },
    deviation: {
      findMany: mockPrismaDeviationFindMany,
      update: mockPrismaDeviationUpdate,
      updateMany: mockPrismaDeviationUpdateMany,
    },
    automationExecutionLog: {
      findFirst: mockPrismaAutomationExecutionLogFindFirst,
      aggregate: mockPrismaAutomationExecutionLogAggregate,
      create: mockPrismaAutomationExecutionLogCreate,
    },
    $transaction: mockPrismaTransaction,
  },
}));

describe('auto-scheduler', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let mathRandomSpy: any;

  // Helper to create a date with specific hour:minute (local time)
  const createZonedDate = (hours: number, minutes: number = 0): Date => {
    const date = new Date('2025-01-01T00:00:00Z');
    // Use setHours (not setUTCHours) so that getHours() returns the expected value
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock Math.random for predictable tests
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // Reset modules to ensure clean imports
    await vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    mathRandomSpy?.mockRestore();
  });

  describe('startAutoScheduler', () => {
    it('should schedule cron job to run every 5 minutes', async () => {
      const { startAutoScheduler } = await import('./auto-scheduler.js');
      startAutoScheduler();

      expect(mockCronSchedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Auto-Scheduler] Cron job started (runs every 5 minutes)'
      );
    });

    it('should run initial check after 30 seconds', async () => {
      mockPrismaAutomationFindMany.mockResolvedValue([]);

      const { startAutoScheduler } = await import('./auto-scheduler.js');
      startAutoScheduler();

      // Advance timers by 30 seconds
      await vi.advanceTimersByTimeAsync(30000);

      expect(consoleLogSpy).toHaveBeenCalledWith('[Auto-Scheduler] Running initial check...');
      expect(mockPrismaAutomationFindMany).toHaveBeenCalled();
    });

    it('should handle errors in initial check', async () => {
      mockPrismaAutomationFindMany.mockRejectedValue(new Error('Database error'));

      const { startAutoScheduler } = await import('./auto-scheduler.js');
      startAutoScheduler();

      await vi.advanceTimersByTimeAsync(30000);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Auto-Scheduler] Critical error in scheduler:',
        expect.any(Error)
      );
    });

    it('should handle cron job execution errors', async () => {
      mockPrismaAutomationFindMany.mockRejectedValue(new Error('Cron error'));

      const { startAutoScheduler } = await import('./auto-scheduler.js');
      startAutoScheduler();

      const cronCallback = mockCronSchedule.mock.calls[0][1];
      await cronCallback();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical error in scheduler:'),
        expect.any(Error)
      );
    });
  });

  describe('runAutoScheduler', () => {
    it('should log when no enabled automations are found', async () => {
      mockPrismaAutomationFindMany.mockResolvedValue([]);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith('[Auto-Scheduler] No enabled automations found');
    });

    it('should find and process enabled automations', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 enabled automation(s)')
      );
    });

    it('should handle automation processing errors and log them', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockRejectedValue(new Error('Lock acquisition failed'));
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process automation'),
        expect.any(Error)
      );
      expect(mockPrismaAutomationExecutionLogCreate).toHaveBeenCalledWith({
        data: {
          automationId: 'auto-1',
          scheduledCount: 0,
          errorMessage: 'Lock acquisition failed',
          triggeredByRuleType: null,
        },
      });
    });

    it('should handle critical errors gracefully', async () => {
      mockPrismaAutomationFindMany.mockRejectedValue(new Error('Database connection lost'));

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Auto-Scheduler] Critical error in scheduler:',
        expect.any(Error)
      );
    });
  });

  describe('processAutomation - lock acquisition', () => {
    it('should acquire execution lock successfully', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaAutomationUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'auto-1',
          OR: [
            { isExecuting: false },
            { lastExecutionLock: null },
            { lastExecutionLock: { lt: new Date('2025-01-01T11:55:00Z') } },
          ],
        },
        data: {
          isExecuting: true,
          lastExecutionLock: expect.any(Date),
        },
      });
    });

    it('should skip automation if lock cannot be acquired', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 0 }); // Lock not acquired

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('is already executing, skipping')
      );
    });

    it('should always release lock in finally block', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      // Verify lock was released
      expect(mockPrismaAutomationUpdate).toHaveBeenCalledWith({
        where: { id: 'auto-1' },
        data: {
          isExecuting: false,
          lastExecutionLock: null,
        },
      });
    });
  });

  describe('evaluateScheduleRules - fixed_time', () => {
    it('should trigger fixed_time rule when time matches within 7-minute window', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      // Create a date with getHours() returning 10 and getMinutes() returning 5
      mockToZonedTime.mockReturnValue(createZonedDate(10, 5)); // 10:05

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'America/New_York' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 rule(s) triggered')
      );
    });

    it('should not trigger fixed_time rule when time is in future', async () => {
      const now = new Date('2025-01-01T09:55:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(9, 55)); // 09:55

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rules triggered')
      );
    });

    it('should not trigger fixed_time rule when time window has passed', async () => {
      const now = new Date('2025-01-01T10:10:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 10)); // 10:10 (7+ minutes past)

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rules triggered')
      );
    });

    it('should respect daysOfWeek filter for fixed_time rule', async () => {
      const now = new Date('2025-01-01T10:05:00Z'); // Wednesday
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5)); // January 1, 2025 is a Wednesday

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: ['monday', 'friday'], // Not Wednesday
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rules triggered')
      );
    });
  });

  describe('evaluateScheduleRules - fixed_interval', () => {
    it('should trigger fixed_interval rule when no previous execution', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_interval',
            intervalMinutes: 60,
            deviationsPerInterval: 2,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogFindFirst.mockResolvedValue(null); // No previous execution
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});
      mockToZonedTime.mockImplementation((date) => date);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 rule(s) triggered')
      );
    });

    it('should trigger fixed_interval rule when interval has elapsed', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_interval',
            intervalMinutes: 60,
            deviationsPerInterval: 1,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogFindFirst.mockResolvedValue({
        executedAt: new Date('2025-01-01T10:00:00Z'), // 2 hours ago
      });
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});
      mockToZonedTime.mockImplementation((date) => date);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 rule(s) triggered')
      );
    });

    it('should not trigger fixed_interval rule when interval has not elapsed', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_interval',
            intervalMinutes: 60,
            deviationsPerInterval: 1,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogFindFirst.mockResolvedValue({
        executedAt: new Date('2025-01-01T11:30:00Z'), // 30 minutes ago (< 60)
      });
      mockToZonedTime.mockImplementation((date) => date);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rules triggered')
      );
    });
  });

  describe('evaluateScheduleRules - daily_quota', () => {
    it('should trigger daily_quota rule when quota not met', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockImplementation((date) => date);
      mockFromZonedTime.mockImplementation((date) => date);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'daily_quota',
            dailyQuota: 10,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogAggregate.mockResolvedValue({
        _sum: { scheduledCount: 5 }, // 5 out of 10
      });
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 rule(s) triggered')
      );
    });

    it('should not trigger daily_quota rule when quota is met', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockImplementation((date) => date);
      mockFromZonedTime.mockImplementation((date) => date);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'daily_quota',
            dailyQuota: 10,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogAggregate.mockResolvedValue({
        _sum: { scheduledCount: 10 }, // Quota met
      });
      mockToZonedTime.mockImplementation((date) => date);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No rules triggered')
      );
    });

    it('should handle null scheduledCount in aggregate', async () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockImplementation((date) => date);
      mockFromZonedTime.mockImplementation((date) => date);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'daily_quota',
            dailyQuota: 10,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogAggregate.mockResolvedValue({
        _sum: { scheduledCount: null }, // No executions today
      });
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 rule(s) triggered')
      );
    });
  });

  describe('calculateScheduleCount', () => {
    it('should return 1 for fixed_time rule', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Will schedule 1 deviation(s)')
      );
    });

    it('should return deviationsPerInterval for fixed_interval rule', async () => {
      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_interval',
            intervalMinutes: 60,
            deviationsPerInterval: 3,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogFindFirst.mockResolvedValue(null);
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});
      mockToZonedTime.mockImplementation((date) => date);

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Will schedule 3 deviation(s)')
      );
    });

    it('should return 1 for daily_quota rule', async () => {
      mockToZonedTime.mockImplementation((date) => date);
      mockFromZonedTime.mockImplementation((date) => date);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'daily_quota',
            dailyQuota: 10,
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaAutomationExecutionLogAggregate.mockResolvedValue({
        _sum: { scheduledCount: 5 },
      });
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Will schedule 1 deviation(s)')
      );
    });
  });

  describe('selectDrafts - FIFO', () => {
    it('should select drafts in FIFO order (oldest first)', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDrafts = [
        {
          id: 'draft-1',
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionVersion: 1,
          files: [{ id: 'file-1' }],
          createdAt: new Date('2025-01-01T08:00:00Z'),
        },
        {
          id: 'draft-2',
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionVersion: 1,
          files: [{ id: 'file-2' }],
          createdAt: new Date('2025-01-01T09:00:00Z'),
        },
      ];

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue(mockDrafts);
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaDeviationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        })
      );
    });
  });

  describe('selectDrafts - LIFO', () => {
    it('should select drafts in LIFO order (newest first)', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDrafts = [
        {
          id: 'draft-2',
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionVersion: 1,
          files: [{ id: 'file-2' }],
          createdAt: new Date('2025-01-01T09:00:00Z'),
        },
        {
          id: 'draft-1',
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionVersion: 1,
          files: [{ id: 'file-1' }],
          createdAt: new Date('2025-01-01T08:00:00Z'),
        },
      ];

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'lifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue(mockDrafts);
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaDeviationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('selectDrafts - random', () => {
    it('should select drafts randomly from pool of 1000', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDrafts = [
        {
          id: 'draft-1',
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionVersion: 1,
          files: [{ id: 'file-1' }],
        },
      ];

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'random',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue(mockDrafts);
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaDeviationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000,
        })
      );
    });
  });

  describe('selectDrafts - optimistic locking', () => {
    it('should use optimistic locking with executionVersion', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 5,
        files: [{ id: 'file-1' }],
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: mockTxUpdateMany,
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            executionVersion: 5,
          }),
          data: expect.objectContaining({
            executionVersion: { increment: 1 },
          }),
        })
      );
    });

    it('should skip draft when optimistic lock fails (count: 0)', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 5,
        files: [{ id: 'file-1' }],
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Lock failed
          },
        });
      });
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      // When lock fails, selected array is empty, so we get "No drafts available"
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No drafts available')
      );
    });

    it('should handle lock error gracefully', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 5,
        files: [{ id: 'file-1' }],
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);
      mockPrismaTransaction.mockRejectedValue(new Error('Lock error'));
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to lock draft')
      );
    });
  });

  describe('selectDrafts - no drafts available', () => {
    it('should log and return when no drafts are available', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No drafts available')
      );
      expect(mockPrismaAutomationExecutionLogCreate).toHaveBeenCalledWith({
        data: {
          automationId: 'auto-1',
          scheduledCount: 0,
          errorMessage: 'No drafts available',
          triggeredByRuleType: null,
        },
      });
    });
  });

  describe('scheduleDraft - default values', () => {
    it('should apply default values when applyIfEmpty is true and field is empty', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        title: null, // Empty
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'title',
            value: 'Default Title',
            applyIfEmpty: true,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Default Title',
          }),
        })
      );
    });

    it('should not apply default values when applyIfEmpty is true but field has value', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        title: 'Existing Title',
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'title',
            value: 'Default Title',
            applyIfEmpty: true,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      // Should not override existing title
      const updateCall = mockTxUpdate.mock.calls[0][0];
      expect(updateCall.data.title).toBeUndefined();
    });

    it('should apply default values when applyIfEmpty is false', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        title: 'Existing Title',
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'title',
            value: 'Force Override',
            applyIfEmpty: false,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Force Override',
          }),
        })
      );
    });
  });

  describe('scheduleDraft - sale queue protection', () => {
    it('should apply sale queue protection defaults when enabled', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        displayResolution: 0, // Original
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: true,
        saleQueuePresetId: 'preset-1',
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: { id: 'preset-1' },
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayResolution: 8, // Force 1920px
            addWatermark: true,
            allowFreeDownload: false,
          }),
        })
      );
    });

    it('should not override displayResolution if already set to non-zero', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        displayResolution: 5,
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: true,
        saleQueuePresetId: 'preset-1',
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: { id: 'preset-1' },
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      const updateCall = mockTxUpdate.mock.calls[0][0];
      expect(updateCall.data.displayResolution).toBeUndefined();
    });
  });

  describe('scheduleDraft - jitter calculation', () => {
    it('should calculate jitter within min/max range', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 60,
        jitterMaxSeconds: 120,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      const updateCall = mockTxUpdate.mock.calls[0][0];
      const jitterSeconds = updateCall.data.jitterSeconds;

      expect(jitterSeconds).toBeGreaterThanOrEqual(60);
      expect(jitterSeconds).toBeLessThanOrEqual(120);
    });
  });

  describe('scheduleDraft - transaction atomicity', () => {
    it('should update deviation and queue in transaction', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(mockTxUpdate).toHaveBeenCalled();
      expect(mockScheduleDeviation).toHaveBeenCalledWith(
        'draft-1',
        'user-1',
        expect.any(Date),
        'single'
      );
    });

    it('should handle scheduling errors', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });
      mockScheduleDeviation.mockRejectedValue(new Error('Queue error'));
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to schedule draft'),
        expect.any(Error)
      );
    });
  });

  describe('logExecution', () => {
    it('should log execution with all parameters', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockPrismaAutomationExecutionLogCreate).toHaveBeenCalledWith({
        data: {
          automationId: 'auto-1',
          scheduledCount: 1,
          errorMessage: null,
          triggeredByRuleType: 'fixed_time',
        },
      });
    });
  });

  describe('isEmpty helper', () => {
    it('should treat null as empty', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        title: null,
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'title',
            value: 'Default',
            applyIfEmpty: true,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Default',
          }),
        })
      );
    });

    it('should treat false as empty', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        isMature: false,
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'isMature',
            value: true,
            applyIfEmpty: true,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isMature: true,
          }),
        })
      );
    });

    it('should treat 0 as empty', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        displayResolution: 0,
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [
          {
            fieldName: 'displayResolution',
            value: 5,
            applyIfEmpty: true,
          },
        ],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayResolution: 5,
          }),
        })
      );
    });
  });

  describe('timezone handling', () => {
    it('should use user timezone for time evaluation', async () => {
      const now = new Date('2025-01-01T15:05:00Z'); // 3:05 PM UTC
      vi.setSystemTime(now);

      // Mock returns 10:05 AM in America/New_York
      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'America/New_York' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockToZonedTime).toHaveBeenCalledWith(expect.any(Date), 'America/New_York');
    });

    it('should default to UTC when user timezone is not set', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockImplementation((date) => date);

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: false,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: null },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([]);
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockToZonedTime).toHaveBeenCalledWith(expect.any(Date), 'UTC');
    });
  });

  describe('stashOnly default', () => {
    it('should apply stashOnly default when draft has null value', async () => {
      const now = new Date('2025-01-01T10:05:00Z');
      vi.setSystemTime(now);

      mockToZonedTime.mockReturnValue(createZonedDate(10, 5));

      const mockDraft = {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionVersion: 1,
        files: [{ id: 'file-1' }],
        stashOnly: null,
        uploadMode: 'single',
      };

      const mockAutomation = {
        id: 'auto-1',
        userId: 'user-1',
        enabled: true,
        draftSelectionMethod: 'fifo',
        jitterMinSeconds: 0,
        jitterMaxSeconds: 60,
        stashOnlyByDefault: true,
        autoAddToSaleQueue: false,
        saleQueuePresetId: null,
        user: { id: 'user-1', timezone: 'UTC' },
        scheduleRules: [
          {
            id: 'rule-1',
            type: 'fixed_time',
            timeOfDay: '10:00',
            enabled: true,
            priority: 1,
            daysOfWeek: null,
          },
        ],
        defaultValues: [],
        saleQueuePreset: null,
      };

      mockPrismaAutomationFindMany.mockResolvedValue([mockAutomation]);
      mockPrismaAutomationUpdateMany.mockResolvedValue({ count: 1 });
      mockPrismaAutomationUpdate.mockResolvedValue({});
      mockPrismaDeviationFindMany.mockResolvedValue([mockDraft]);

      const mockTxUpdate = vi.fn().mockResolvedValue({});
      mockPrismaTransaction.mockImplementation(async (callback) => {
        return await callback({
          deviation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: mockTxUpdate,
          },
        });
      });
      mockScheduleDeviation.mockResolvedValue({});
      mockPrismaAutomationExecutionLogCreate.mockResolvedValue({});

      const { runAutoSchedulerManually } = await import('./auto-scheduler.js');
      await runAutoSchedulerManually();

      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stashOnly: true,
          }),
        })
      );
    });
  });
});
