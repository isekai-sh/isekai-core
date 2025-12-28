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
import type { Job } from 'bullmq';

// Set environment variables before imports
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock dependencies
const mockPrismaUserFindMany = vi.fn();
const mockPrismaUserUpdate = vi.fn();
const mockPrismaDeviationUpdateMany = vi.fn();
const mockRefreshTokenIfNeeded = vi.fn();
const mockSendRefreshTokenWarningEmail = vi.fn();
const mockSendRefreshTokenExpiredEmail = vi.fn();

vi.mock('../db/index.js', () => ({
  prisma: {
    user: {
      findMany: mockPrismaUserFindMany,
      update: mockPrismaUserUpdate,
    },
    deviation: {
      updateMany: mockPrismaDeviationUpdateMany,
    },
  },
}));

vi.mock('../lib/deviantart.js', () => ({
  refreshTokenIfNeeded: mockRefreshTokenIfNeeded,
}));

vi.mock('../lib/email-service.js', () => ({
  sendRefreshTokenWarningEmail: mockSendRefreshTokenWarningEmail,
  sendRefreshTokenExpiredEmail: mockSendRefreshTokenExpiredEmail,
}));

vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return {
    Redis: class MockRedis extends RedisMock {
      constructor() {
        super();
      }
    },
  };
});

let capturedWorkerProcessor: ((job: Job) => Promise<any>) | null = null;
const mockQueueAdd = vi.fn();
const mockQueueGetRepeatableJobs = vi.fn();
const mockQueueRemoveRepeatableByKey = vi.fn();
const workerEventListeners: Record<string, Function[]> = {};

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
    getRepeatableJobs = mockQueueGetRepeatableJobs;
    removeRepeatableByKey = mockQueueRemoveRepeatableByKey;
  },
  Worker: class MockWorker {
    constructor(queueName: string, processor: (job: Job) => Promise<any>) {
      capturedWorkerProcessor = processor;
    }
    on(event: string, handler: Function) {
      if (!workerEventListeners[event]) {
        workerEventListeners[event] = [];
      }
      workerEventListeners[event].push(handler);
      return this;
    }
  },
}));

describe('token-maintenance', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedWorkerProcessor = null;
    Object.keys(workerEventListeners).forEach(key => delete workerEventListeners[key]);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Import the module to initialize everything
    await vi.resetModules();
    await import('./token-maintenance.js');
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    vi.clearAllMocks();
  });

  describe('scheduleTokenMaintenance', () => {
    it('should remove existing repeatable jobs before scheduling', async () => {
      const { scheduleTokenMaintenance } = await import('./token-maintenance.js');

      mockQueueGetRepeatableJobs.mockResolvedValue([
        { key: 'old-job-1', pattern: '0 2 * * *' },
        { key: 'old-job-2', pattern: '0 3 * * *' },
      ]);
      mockQueueRemoveRepeatableByKey.mockResolvedValue(undefined);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await scheduleTokenMaintenance();

      expect(mockQueueGetRepeatableJobs).toHaveBeenCalled();
      expect(mockQueueRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(mockQueueRemoveRepeatableByKey).toHaveBeenCalledWith('old-job-1');
      expect(mockQueueRemoveRepeatableByKey).toHaveBeenCalledWith('old-job-2');
    });

    it('should schedule daily job at 2 AM UTC with correct cron pattern', async () => {
      const { scheduleTokenMaintenance } = await import('./token-maintenance.js');

      mockQueueGetRepeatableJobs.mockResolvedValue([]);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await scheduleTokenMaintenance();

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'check-expiring-tokens',
        { type: 'check_expiring_tokens' },
        {
          repeat: {
            pattern: '0 2 * * *',
          },
          jobId: 'token-maintenance-daily',
        }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Token Maintenance] Scheduled daily token check job at 2 AM UTC'
      );
    });

    it('should handle no existing repeatable jobs', async () => {
      const { scheduleTokenMaintenance } = await import('./token-maintenance.js');

      mockQueueGetRepeatableJobs.mockResolvedValue([]);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await scheduleTokenMaintenance();

      expect(mockQueueRemoveRepeatableByKey).not.toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });
  });

  describe('tokenMaintenanceWorker processor', () => {
    const createMockUser = (overrides = {}) => ({
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      refreshTokenExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      refreshTokenWarningEmailSent: false,
      refreshTokenExpiredEmailSent: false,
      deviations: [],
      ...overrides,
    });

    const createMockJob = (): Partial<Job> => ({
      id: 'job-123',
      data: {
        type: 'check_expiring_tokens',
      },
      attemptsMade: 0,
    });

    describe('CASE 1: Token already expired', () => {
      it('should pause scheduled posts when token is expired and user has scheduled posts', async () => {
        const expiredDate = new Date(Date.now() - 1000); // 1 second ago
        const mockUser = createMockUser({
          refreshTokenExpiresAt: expiredDate,
          deviations: [
            { id: 'dev-1', status: 'scheduled' },
            { id: 'dev-2', status: 'scheduled' },
          ],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 2 });
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenExpiredEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockPrismaDeviationUpdateMany).toHaveBeenCalledWith({
          where: {
            userId: 'user-123',
            status: 'scheduled',
          },
          data: {
            status: 'draft',
            errorMessage: 'DeviantArt authentication expired. Please re-connect your account to schedule posts.',
            updatedAt: expect.any(Date),
          },
        });
        expect(result.scheduledPostsPaused).toBe(2);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('refresh token expired')
        );
      });

      it('should send expiration email if not already sent', async () => {
        const expiredDate = new Date(Date.now() - 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: expiredDate,
          refreshTokenExpiredEmailSent: false,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 1 });
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenExpiredEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenExpiredEmail).toHaveBeenCalledWith(mockUser, 1);
        expect(mockPrismaUserUpdate).toHaveBeenCalledWith({
          where: { id: 'user-123' },
          data: { refreshTokenExpiredEmailSent: true },
        });
        expect(result.expiredNotifications).toBe(1);
      });

      it('should not send expiration email if already sent', async () => {
        const expiredDate = new Date(Date.now() - 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: expiredDate,
          refreshTokenExpiredEmailSent: true,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 1 });

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenExpiredEmail).not.toHaveBeenCalled();
        expect(result.expiredNotifications).toBe(0);
      });

      it('should handle expired token with no scheduled posts', async () => {
        const expiredDate = new Date(Date.now() - 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: expiredDate,
          deviations: [],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenExpiredEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockPrismaDeviationUpdateMany).not.toHaveBeenCalled();
        expect(result.scheduledPostsPaused).toBe(0);
        expect(result.expiredNotifications).toBe(1);
      });
    });

    describe('CASE 2: Token expiring in 60-80 days with scheduled posts - proactive refresh', () => {
      it('should proactively refresh token when expiring in 60-80 days with scheduled posts', async () => {
        const futureDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000); // 70 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockRefreshTokenIfNeeded.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(mockUser);
        expect(result.proactiveRefreshSuccess).toBe(1);
        expect(result.proactiveRefreshFailed).toBe(0);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Successfully refreshed token')
        );
      });

      it('should not proactively refresh if no scheduled posts', async () => {
        const futureDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockRefreshTokenIfNeeded).not.toHaveBeenCalled();
        expect(result.proactiveRefreshSuccess).toBe(0);
      });

      it('should not proactively refresh if token expires in less than 60 days', async () => {
        const futureDate = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000); // 50 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockRefreshTokenIfNeeded).not.toHaveBeenCalled();
        expect(result.proactiveRefreshSuccess).toBe(0);
      });

      it('should not proactively refresh if token expires in more than 80 days', async () => {
        const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockRefreshTokenIfNeeded).not.toHaveBeenCalled();
        expect(result.proactiveRefreshSuccess).toBe(0);
      });

      it('should handle proactive refresh failure and pause posts when token expired', async () => {
        const futureDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [
            { id: 'dev-1', status: 'scheduled' },
            { id: 'dev-2', status: 'scheduled' },
          ],
        });

        const expiredError = new Error('Refresh token expired');
        (expiredError as any).code = 'REFRESH_TOKEN_EXPIRED';

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockRefreshTokenIfNeeded.mockRejectedValue(expiredError);
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 2 });
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenExpiredEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(result.proactiveRefreshFailed).toBe(1);
        expect(mockPrismaDeviationUpdateMany).toHaveBeenCalledWith({
          where: {
            userId: 'user-123',
            status: 'scheduled',
          },
          data: {
            status: 'draft',
            errorMessage: 'DeviantArt authentication expired. Please re-connect your account.',
            updatedAt: expect.any(Date),
          },
        });
        expect(result.scheduledPostsPaused).toBe(2);
        expect(mockSendRefreshTokenExpiredEmail).toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Proactive refresh failed')
        );
      });

      it('should handle proactive refresh failure without REFRESH_TOKEN_EXPIRED code', async () => {
        const futureDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        const networkError = new Error('Network error');
        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockRefreshTokenIfNeeded.mockRejectedValue(networkError);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(result.proactiveRefreshFailed).toBe(1);
        expect(mockPrismaDeviationUpdateMany).not.toHaveBeenCalled();
        expect(mockSendRefreshTokenExpiredEmail).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to refresh token'),
          expect.any(String)
        );
      });

      it('should not send expired email again if already sent during proactive refresh failure', async () => {
        const futureDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenExpiredEmailSent: true,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        const expiredError = new Error('Refresh token expired');
        (expiredError as any).code = 'REFRESH_TOKEN_EXPIRED';

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockRefreshTokenIfNeeded.mockRejectedValue(expiredError);
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 1 });

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenExpiredEmail).not.toHaveBeenCalled();
        expect(result.expiredNotifications).toBe(0);
      });
    });

    describe('CASE 3: Token expiring in 7-14 days - send warning email', () => {
      it('should send warning email when token expires in 7-14 days', async () => {
        const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        // Due to timing, the days calculation might be 9 or 10
        expect(mockSendRefreshTokenWarningEmail).toHaveBeenCalledWith(mockUser, expect.any(Number), 1);
        expect(mockPrismaUserUpdate).toHaveBeenCalledWith({
          where: { id: 'user-123' },
          data: { refreshTokenWarningEmailSent: true },
        });
        expect(result.warningEmailsSent).toBe(1);
      });

      it('should not send warning email if already sent', async () => {
        const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: true,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenWarningEmail).not.toHaveBeenCalled();
        expect(result.warningEmailsSent).toBe(0);
      });

      it('should not send warning email if token expires in less than 7 days', async () => {
        const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenWarningEmail).not.toHaveBeenCalled();
        expect(result.warningEmailsSent).toBe(0);
      });

      it('should not send warning email if token expires in more than 14 days', async () => {
        const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenWarningEmail).not.toHaveBeenCalled();
        expect(result.warningEmailsSent).toBe(0);
      });

      it('should send warning email on day 7 boundary', async () => {
        // Add small buffer to ensure we're solidly at 7 days after timing
        const futureDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)); // 7 days + 1 hour
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenWarningEmail).toHaveBeenCalled();
        expect(result.warningEmailsSent).toBe(1);
      });

      it('should send warning email on day 14 boundary', async () => {
        // Add small buffer to ensure we're solidly at 14 days after timing
        const futureDate = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000)); // 14 days + 1 hour
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(mockSendRefreshTokenWarningEmail).toHaveBeenCalled();
        expect(result.warningEmailsSent).toBe(1);
      });
    });

    describe('Multiple users and edge cases', () => {
      it('should handle no users with expiring tokens', async () => {
        mockPrismaUserFindMany.mockResolvedValue([]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(result).toEqual({
          proactiveRefreshSuccess: 0,
          proactiveRefreshFailed: 0,
          warningEmailsSent: 0,
          expiredNotifications: 0,
          scheduledPostsPaused: 0,
        });
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Found 0 users')
        );
      });

      it('should process multiple users correctly', async () => {
        const user1 = createMockUser({
          id: 'user-1',
          username: 'user1',
          refreshTokenExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
          refreshTokenWarningEmailSent: false,
        });

        const user2 = createMockUser({
          id: 'user-2',
          username: 'user2',
          refreshTokenExpiresAt: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000), // 70 days
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        const user3 = createMockUser({
          id: 'user-3',
          username: 'user3',
          refreshTokenExpiresAt: new Date(Date.now() - 1000), // expired
          deviations: [{ id: 'dev-2', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([user1, user2, user3]);
        mockPrismaUserUpdate.mockResolvedValue({});
        mockPrismaDeviationUpdateMany.mockResolvedValue({ count: 1 });
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);
        mockSendRefreshTokenExpiredEmail.mockResolvedValue(undefined);
        mockRefreshTokenIfNeeded.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(result.warningEmailsSent).toBe(1); // user1
        expect(result.proactiveRefreshSuccess).toBe(1); // user2
        expect(result.expiredNotifications).toBe(1); // user3
        expect(result.scheduledPostsPaused).toBe(1); // user3
      });

      it('should handle user with multiple actions triggered', async () => {
        // User expires in 10 days, qualifies for warning
        // Has scheduled posts
        // Add 0.5 day buffer to ensure Math.floor gives exactly 10 despite timing drift
        const futureDate = new Date(Date.now() + 10.5 * 24 * 60 * 60 * 1000);
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
          deviations: [
            { id: 'dev-1', status: 'scheduled' },
            { id: 'dev-2', status: 'scheduled' },
          ],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        // Should send warning email (7-14 days)
        // Should NOT proactively refresh (not 60-80 days)
        expect(result.warningEmailsSent).toBe(1);
        expect(result.proactiveRefreshSuccess).toBe(0);
        expect(mockSendRefreshTokenWarningEmail).toHaveBeenCalledWith(mockUser, 10, 2);
      });

      it('should handle database query with correct date range', async () => {
        mockPrismaUserFindMany.mockResolvedValue([]);

        await capturedWorkerProcessor!(createMockJob() as Job);

        const callArgs = mockPrismaUserFindMany.mock.calls[0][0];
        expect(callArgs.where.refreshTokenExpiresAt.lte).toBeInstanceOf(Date);
        expect(callArgs.include.deviations.where.status).toBe('scheduled');
      });

      it('should calculate days until expiry correctly', async () => {
        const futureDate = new Date(Date.now() + 8.5 * 24 * 60 * 60 * 1000); // 8.5 days
        const mockUser = createMockUser({
          refreshTokenExpiresAt: futureDate,
          refreshTokenWarningEmailSent: false,
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        await capturedWorkerProcessor!(createMockJob() as Job);

        // Should round down to 8 days and send warning
        expect(mockSendRefreshTokenWarningEmail).toHaveBeenCalledWith(mockUser, 8, 0);
      });

      it('should log progress for each user checked', async () => {
        const mockUser = createMockUser({
          username: 'testuser',
          refreshTokenExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          deviations: [{ id: 'dev-1', status: 'scheduled' }],
        });

        mockPrismaUserFindMany.mockResolvedValue([mockUser]);
        mockPrismaUserUpdate.mockResolvedValue(mockUser);
        mockSendRefreshTokenWarningEmail.mockResolvedValue(undefined);

        await capturedWorkerProcessor!(createMockJob() as Job);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Checking user testuser')
        );
      });
    });

    describe('Result summary', () => {
      it('should return correct result summary with all counters', async () => {
        mockPrismaUserFindMany.mockResolvedValue([]);

        const result = await capturedWorkerProcessor!(createMockJob() as Job);

        expect(result).toHaveProperty('proactiveRefreshSuccess');
        expect(result).toHaveProperty('proactiveRefreshFailed');
        expect(result).toHaveProperty('warningEmailsSent');
        expect(result).toHaveProperty('expiredNotifications');
        expect(result).toHaveProperty('scheduledPostsPaused');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[Token Maintenance] Token maintenance completed:',
          result
        );
      });

      it('should log starting message', async () => {
        mockPrismaUserFindMany.mockResolvedValue([]);

        await capturedWorkerProcessor!(createMockJob() as Job);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[Token Maintenance] Starting token maintenance check'
        );
      });
    });
  });

  describe('event handlers', () => {
    it('should register completed event handler', () => {
      expect(workerEventListeners['completed']).toBeDefined();
      expect(workerEventListeners['completed'].length).toBeGreaterThan(0);
    });

    it('should log on job completion', () => {
      const completedHandler = workerEventListeners['completed'][0];
      expect(completedHandler).toBeDefined();

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          type: 'check_expiring_tokens',
        },
      };

      const result = {
        proactiveRefreshSuccess: 5,
        proactiveRefreshFailed: 1,
        warningEmailsSent: 3,
        expiredNotifications: 2,
        scheduledPostsPaused: 4,
      };

      completedHandler(mockJob, result);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Token Maintenance] Job completed:',
        result
      );
    });

    it('should register failed event handler', () => {
      expect(workerEventListeners['failed']).toBeDefined();
      expect(workerEventListeners['failed'].length).toBeGreaterThan(0);
    });

    it('should log on job failure', () => {
      const failedHandler = workerEventListeners['failed'][0];
      expect(failedHandler).toBeDefined();

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          type: 'check_expiring_tokens',
        },
      };

      const error = new Error('Database connection failed');
      failedHandler(mockJob, error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Token Maintenance] Job failed:',
        'Database connection failed'
      );
    });

    it('should handle failed event without error message', () => {
      const failedHandler = workerEventListeners['failed'][0];
      const error = {} as Error;

      expect(() => failedHandler(null, error)).not.toThrow();
    });

    it('should register error event handler', () => {
      expect(workerEventListeners['error']).toBeDefined();
      expect(workerEventListeners['error'].length).toBeGreaterThan(0);
    });

    it('should log worker errors', () => {
      const errorHandler = workerEventListeners['error'][0];
      expect(errorHandler).toBeDefined();

      const error = new Error('Worker crashed');
      errorHandler(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Token Maintenance] Worker error:',
        'Worker crashed'
      );
    });

    it('should handle error event without error message', () => {
      const errorHandler = workerEventListeners['error'][0];
      const error = {} as Error;

      expect(() => errorHandler(error)).not.toThrow();
    });
  });
});
