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

// Set environment before imports
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.PUBLISHER_MAX_ATTEMPTS = '7';
process.env.PUBLISHER_CONCURRENCY = '2';
process.env.PUBLISHER_JOB_TIMEOUT_MS = '1200000';

// Mock BullMQ
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockQueueClose = vi.fn();
const mockQueuePause = vi.fn();
const mockQueueGetJobs = vi.fn();
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn();
const mockWorkerPause = vi.fn();
let workerProcessor: Function;
let queueOptions: any = {};
let workerOptions: any = {};
let eventHandlers: Map<string, Function> = new Map();

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name: string;
    opts: any;

    constructor(name: string, options: any) {
      this.name = name;
      this.opts = options;
      queueOptions = options;
    }

    add = mockQueueAdd;
    getJob = mockQueueGetJob;
    close = mockQueueClose;
    pause = mockQueuePause;
    getJobs = mockQueueGetJobs;
  },
  Worker: class MockWorker {
    constructor(name: string, processor: Function, options: any) {
      workerProcessor = processor;
      workerOptions = options;
    }
    on(event: string, handler: Function) {
      eventHandlers.set(event, handler);
      return mockWorkerOn(event, handler);
    }
    close = mockWorkerClose;
    pause = mockWorkerPause;
  },
  QueueEvents: class MockQueueEvents {
    constructor(queueName: string, options: any) {}
  },
}));

// Mock ioredis
vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { Redis: RedisMock };
});

// Mock publishToDeviantArt
const mockPublishToDeviantArt = vi.fn();
vi.mock('../lib/deviantart.js', () => ({
  publishToDeviantArt: (...args: any[]) => mockPublishToDeviantArt(...args),
}));

// Mock queueStorageCleanup
const mockQueueStorageCleanup = vi.fn();
vi.mock('./storage-cleanup.js', () => ({
  queueStorageCleanup: (...args: any[]) => mockQueueStorageCleanup(...args),
}));

// Mock email service
const mockSendRefreshTokenExpiredJobNotification = vi.fn();
vi.mock('../lib/email-service.js', () => ({
  sendRefreshTokenExpiredJobNotification: (...args: any[]) => mockSendRefreshTokenExpiredJobNotification(...args),
}));

// Mock StructuredLogger
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerDebug = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('../lib/structured-logger.js', () => ({
  StructuredLogger: {
    createJobLogger: () => ({
      info: mockLoggerInfo,
      error: mockLoggerError,
      debug: mockLoggerDebug,
      warn: mockLoggerWarn,
    }),
  },
}));

// Mock shared publisher core
const mockPublishDeviationJob = vi.fn();
vi.mock('@isekai/shared', () => ({
  publishDeviationJob: (...args: any[]) => mockPublishDeviationJob(...args),
}));

// Mock error categorizer
vi.mock('../lib/error-categorizer.js', () => ({
  ErrorCategorizer: class MockErrorCategorizer {
    categorize = vi.fn();
  },
}));

// Mock rate limiter
vi.mock('../lib/rate-limiter.js', () => ({
  AdaptiveRateLimiter: class MockRateLimiter {
    shouldAllowRequest = vi.fn();
    recordSuccess = vi.fn();
    recordFailure = vi.fn();
  },
}));

// Mock metrics collector
const mockRecordStalledJob = vi.fn();
vi.mock('../lib/publisher-metrics.js', () => ({
  PublisherMetricsCollector: class MockMetricsCollector {
    recordJobStart = vi.fn();
    recordJobSuccess = vi.fn();
    recordJobFailure = vi.fn();
    recordStalledJob = mockRecordStalledJob;
    recordRateLimitHit = vi.fn();
    getMetrics = vi.fn(() => ({ success: 0, failure: 0 }));
    shutdown = vi.fn();
  },
}));

// Mock circuit breaker
vi.mock('../lib/circuit-breaker.js', () => ({
  CircuitBreaker: {
    shouldAllowRequest: vi.fn(),
  },
  withCircuitBreaker: vi.fn(),
}));

// Mock prisma
vi.mock('../db/index.js', async () => {
  const actual = await vi.importActual('../db/index.js');
  return {
    ...actual,
    prisma: {
      deviation: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

describe('deviation-publisher', () => {
  let prisma: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Set up environment
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      REDIS_URL: 'redis://localhost:6379',
      PUBLISHER_MAX_ATTEMPTS: '7',
      PUBLISHER_CONCURRENCY: '2',
      PUBLISHER_JOB_TIMEOUT_MS: '1200000',
    };

    // Clear mocks AFTER setting up console spies but BEFORE import
    vi.clearAllMocks();

    // Import mocked prisma
    const db = await import('../db/index.js');
    prisma = db.prisma;

    // Import module to initialize queue and worker
    // This will call mockWorkerOn for each event handler
    await import('./deviation-publisher.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('Deviation Publisher Worker Processor', () => {
    it('should successfully publish a deviation', async () => {
      const mockResult = {
        success: true,
        results: [
          {
            deviationId: 'da-123',
            url: 'https://www.deviantart.com/deviation/da-123',
          },
        ],
      };

      mockPublishDeviationJob.mockResolvedValue(mockResult);

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      const result = await workerProcessor(mockJob);

      expect(result).toEqual(mockResult);
      expect(mockPublishDeviationJob).toHaveBeenCalledWith(
        mockJob,
        expect.objectContaining({
          prisma: expect.any(Object),
          logger: expect.any(Object),
          rateLimiter: expect.any(Object),
          metricsCollector: expect.any(Object),
          CircuitBreaker: expect.any(Object),
          withCircuitBreaker: expect.any(Function),
          publishToDeviantArt: expect.any(Function),
          queueStorageCleanup: expect.any(Function),
          errorCategorizer: expect.any(Object),
        })
      );
    });

    it('should handle refresh token expired error', async () => {
      const tokenExpiredError: any = new Error('REFRESH_TOKEN_EXPIRED: DeviantArt refresh token has expired');
      tokenExpiredError.code = 'REFRESH_TOKEN_EXPIRED';

      mockPublishDeviationJob.mockRejectedValue(tokenExpiredError);

      const mockDeviation = {
        id: 'dev-123',
        userId: 'user-123',
        title: 'Test Deviation',
        user: {
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
      };

      prisma.deviation.findFirst.mockResolvedValue(mockDeviation);
      prisma.deviation.updateMany.mockResolvedValue({ count: 5 });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      // Verify all scheduled posts were paused
      expect(prisma.deviation.updateMany).toHaveBeenCalledWith({
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

      // Verify notification was sent
      expect(mockSendRefreshTokenExpiredJobNotification).toHaveBeenCalledWith(
        mockDeviation.user,
        mockDeviation.title
      );
    });

    it('should handle refresh token expired error with message check', async () => {
      const tokenExpiredError = new Error('Something went wrong: REFRESH_TOKEN_EXPIRED');

      mockPublishDeviationJob.mockRejectedValue(tokenExpiredError);

      const mockDeviation = {
        id: 'dev-123',
        userId: 'user-123',
        title: 'Test Deviation',
        user: {
          id: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
      };

      prisma.deviation.findFirst.mockResolvedValue(mockDeviation);
      prisma.deviation.updateMany.mockResolvedValue({ count: 3 });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      expect(prisma.deviation.updateMany).toHaveBeenCalled();
      expect(mockSendRefreshTokenExpiredJobNotification).toHaveBeenCalled();
    });

    it('should skip notification if deviation not found', async () => {
      const tokenExpiredError: any = new Error('REFRESH_TOKEN_EXPIRED');
      tokenExpiredError.code = 'REFRESH_TOKEN_EXPIRED';

      mockPublishDeviationJob.mockRejectedValue(tokenExpiredError);
      prisma.deviation.findFirst.mockResolvedValue(null);

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      expect(prisma.deviation.updateMany).not.toHaveBeenCalled();
      expect(mockSendRefreshTokenExpiredJobNotification).not.toHaveBeenCalled();
    });

    it('should skip notification if user not found', async () => {
      const tokenExpiredError: any = new Error('REFRESH_TOKEN_EXPIRED');
      tokenExpiredError.code = 'REFRESH_TOKEN_EXPIRED';

      mockPublishDeviationJob.mockRejectedValue(tokenExpiredError);
      prisma.deviation.findFirst.mockResolvedValue({
        id: 'dev-123',
        userId: 'user-123',
        title: 'Test',
        user: null,
      });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      expect(prisma.deviation.updateMany).not.toHaveBeenCalled();
      expect(mockSendRefreshTokenExpiredJobNotification).not.toHaveBeenCalled();
    });

    it('should re-throw non-refresh-token errors', async () => {
      const regularError = new Error('Network error');

      mockPublishDeviationJob.mockRejectedValue(regularError);

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('Network error');

      expect(prisma.deviation.findFirst).not.toHaveBeenCalled();
      expect(prisma.deviation.updateMany).not.toHaveBeenCalled();
      expect(mockSendRefreshTokenExpiredJobNotification).not.toHaveBeenCalled();
    });

    it('should pass queueStorageCleanup function to publishDeviationJob', async () => {
      mockPublishDeviationJob.mockImplementation(async (job, deps) => {
        // Test that queueStorageCleanup works
        await deps.queueStorageCleanup('dev-456', 'user-456');
        return {
          success: true,
          results: [],
        };
      });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await workerProcessor(mockJob);

      expect(mockQueueStorageCleanup).toHaveBeenCalledWith('dev-456', 'user-456');
    });
  });

  describe('scheduleDeviation', () => {
    it('should schedule a deviation with correct delay', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000); // 1 minute in future

      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        {
          delay: expect.any(Number),
          jobId: 'deviation-dev-123',
          priority: 5,
        }
      );

      const addCall = mockQueueAdd.mock.calls[0];
      const delay = addCall[2].delay;
      expect(delay).toBeGreaterThan(55000);
      expect(delay).toBeLessThan(65000);
    });

    it('should handle past publish dates with zero delay', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() - 5000); // 5 seconds in past

      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      const addCall = mockQueueAdd.mock.calls[0];
      const delay = addCall[2].delay;
      expect(delay).toBe(0);
    });

    it('should skip if job already exists in waiting state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('waiting'),
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should skip if job already exists in delayed state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('delayed'),
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should skip if job already exists in active state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('active'),
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should remove and re-queue if job exists in completed state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('completed'),
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockQueueAdd.mockResolvedValue({ id: 'job-new' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it('should remove and re-queue if job exists in failed state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('failed'),
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockQueueAdd.mockResolvedValue({ id: 'job-new' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it('should use correct jobId format', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-456', 'user-123', publishAt, 'multiple');

      expect(mockQueueGetJob).toHaveBeenCalledWith('deviation-dev-456');
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        expect.any(Object),
        expect.objectContaining({
          jobId: 'deviation-dev-456',
        })
      );
    });
  });

  describe('publishDeviationNow', () => {
    it('should publish immediately with no delay', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await publishDeviationNow('dev-123', 'user-123', 'single');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        {
          jobId: 'deviation-dev-123',
          priority: 5,
        }
      );

      // Verify no delay property
      const addCall = mockQueueAdd.mock.calls[0];
      expect(addCall[2].delay).toBeUndefined();
    });

    it('should skip if job already exists', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('waiting'),
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);

      await publishDeviationNow('dev-123', 'user-123', 'single');

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should remove and re-queue if job exists in failed state', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('failed'),
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockQueueAdd.mockResolvedValue({ id: 'job-new' });

      await publishDeviationNow('dev-123', 'user-123', 'multiple');

      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });
  });

  describe('cancelScheduledDeviation', () => {
    it('should cancel existing job', async () => {
      const { cancelScheduledDeviation } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockJob = {
        id: 'job-123',
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockJob);

      const result = await cancelScheduledDeviation('dev-123');

      expect(result).toBe(true);
      expect(mockQueueGetJob).toHaveBeenCalledWith('deviation-dev-123');
      expect(mockRemove).toHaveBeenCalled();
    });

    it('should return false if job does not exist', async () => {
      const { cancelScheduledDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);

      const result = await cancelScheduledDeviation('dev-123');

      expect(result).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('should extract wait time from RATE_LIMITED error message', async () => {
      // Import the module to initialize the queue
      await import('./deviation-publisher.js');

      // Create a rate limit error
      const error = new Error('RATE_LIMITED: Wait 5000ms');

      // Access the backoff function from captured queue options
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(0, error);
      expect(backoff).toBe(5000);
    });

    it('should extract wait time from RATE_LIMIT error message', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('RATE_LIMIT: Wait 15000ms');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(0, error);
      expect(backoff).toBe(15000);
    });

    it('should handle CIRCUIT_OPEN error with 30 second wait', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('CIRCUIT_OPEN: Circuit breaker is open');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(2, error);
      expect(backoff).toBe(30000);
    });

    it('should use exponential backoff for regular errors - attempt 0', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('Network error');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(0, error);
      expect(backoff).toBe(2000); // 2s
    });

    it('should use exponential backoff for regular errors - attempt 1', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('Network error');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(1, error);
      expect(backoff).toBe(4000); // 4s
    });

    it('should use exponential backoff for regular errors - attempt 2', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('Network error');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(2, error);
      expect(backoff).toBe(8000); // 8s
    });

    it('should cap exponential backoff at 64 seconds', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('Network error');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(10, error);
      expect(backoff).toBe(64000); // Max 64s
    });

    it('should handle error without message gracefully', async () => {
      await import('./deviation-publisher.js');

      const error = {} as Error;
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(1, error);
      expect(backoff).toBe(4000); // Default exponential
    });

    it('should handle rate limit without wait time in message', async () => {
      await import('./deviation-publisher.js');

      const error = new Error('RATE_LIMITED: Too many requests');
      const backoffFn = queueOptions.defaultJobOptions.backoff;

      const backoff = backoffFn(1, error);
      expect(backoff).toBe(4000); // Falls back to exponential
    });
  });

  describe('Worker Event Handlers', () => {
    it('should handle completed event', async () => {
      await import('./deviation-publisher.js');

      // Get the 'completed' event handler from captured handlers
      const completedHandler = eventHandlers.get('completed');
      expect(completedHandler).toBeDefined();

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
      };

      const result = {
        success: true,
        results: [{ deviationId: 'da-123', url: 'https://deviantart.com/test' }],
      };

      completedHandler!(mockJob, result);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Job completed successfully', { result });
    });

    it('should handle failed event with job', async () => {
      await import('./deviation-publisher.js');

      const failedHandler = eventHandlers.get('failed');
      expect(failedHandler).toBeDefined();

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
      };

      const error = new Error('Publishing failed');

      failedHandler!(mockJob, error);

      expect(mockLoggerError).toHaveBeenCalledWith('Job failed permanently', error);
    });

    it('should handle failed event without job', async () => {
      await import('./deviation-publisher.js');

      const failedHandler = eventHandlers.get('failed');
      expect(failedHandler).toBeDefined();

      const error = new Error('Publishing failed');

      // Call with null job
      failedHandler!(null, error);

      // Should not call logger (because of the !job check)
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should handle stalled event', async () => {
      await import('./deviation-publisher.js');

      const stalledHandler = eventHandlers.get('stalled');
      expect(stalledHandler).toBeDefined();

      stalledHandler!('job-stalled-123');

      expect(mockRecordStalledJob).toHaveBeenCalledWith('job-stalled-123');
      expect(console.error).toHaveBeenCalledWith('[Publisher] Job job-stalled-123 stalled - may be stuck');
    });

    it('should handle error event', async () => {
      await import('./deviation-publisher.js');

      const errorHandler = eventHandlers.get('error');
      expect(errorHandler).toBeDefined();

      const error = new Error('Worker error');
      errorHandler!(error);

      expect(console.error).toHaveBeenCalledWith('[Publisher] Worker error:', error);
    });
  });

  describe('Queue Configuration', () => {
    it('should have correct default job options', async () => {
      await import('./deviation-publisher.js');

      expect(queueOptions.defaultJobOptions.attempts).toBe(7);
      expect(queueOptions.defaultJobOptions.backoff).toBeTypeOf('function');
      expect(queueOptions.defaultJobOptions.removeOnComplete).toEqual({
        age: 48 * 3600,
        count: 5000,
      });
      expect(queueOptions.defaultJobOptions.removeOnFail).toEqual({
        age: 7 * 24 * 3600,
        count: 1000,
      });
    });

    it('should respect PUBLISHER_MAX_ATTEMPTS environment variable', async () => {
      // This is already set in beforeEach, just verify
      await import('./deviation-publisher.js');

      expect(queueOptions.defaultJobOptions.attempts).toBe(7);
    });
  });

  describe('Job State Transitions', () => {
    it('should handle job transition from completed to new job', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('completed'),
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockQueueAdd.mockResolvedValue({ id: 'job-new' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockExistingJob.getState).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it('should handle job transition from failed to new immediate job', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      const mockRemove = vi.fn();
      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('failed'),
        remove: mockRemove,
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockQueueAdd.mockResolvedValue({ id: 'job-new' });

      await publishDeviationNow('dev-123', 'user-123', 'single');

      expect(mockExistingJob.getState).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it('should not re-queue if job is in active state', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        id: 'job-existing',
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn(),
      };

      mockQueueGetJob.mockResolvedValue(mockExistingJob);

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockExistingJob.remove).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling in Worker', () => {
    it('should propagate errors from publishDeviationJob', async () => {
      const networkError = new Error('Connection timeout');
      mockPublishDeviationJob.mockRejectedValue(networkError);

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('Connection timeout');
    });

    it('should handle refresh token error and still throw', async () => {
      const tokenError: any = new Error('REFRESH_TOKEN_EXPIRED');
      tokenError.code = 'REFRESH_TOKEN_EXPIRED';

      mockPublishDeviationJob.mockRejectedValue(tokenError);

      prisma.deviation.findFirst.mockResolvedValue({
        id: 'dev-123',
        userId: 'user-123',
        title: 'Test',
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      });

      prisma.deviation.updateMany.mockResolvedValue({ count: 1 });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      // Should throw after handling
      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      // But should still have handled the error
      expect(prisma.deviation.updateMany).toHaveBeenCalled();
    });
  });

  describe('Upload Mode Support', () => {
    it('should handle single upload mode', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'single');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        expect.objectContaining({
          uploadMode: 'single',
        }),
        expect.any(Object)
      );
    });

    it('should handle multiple upload mode', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'multiple');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        expect.objectContaining({
          uploadMode: 'multiple',
        }),
        expect.any(Object)
      );
    });

    it('should pass correct uploadMode to worker processor', async () => {
      mockPublishDeviationJob.mockResolvedValue({
        success: true,
        results: [],
      });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'multiple',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await workerProcessor(mockJob);

      expect(mockPublishDeviationJob).toHaveBeenCalledWith(
        mockJob,
        expect.any(Object)
      );
    });
  });

  describe('Dependency Injection', () => {
    it('should inject all required dependencies to publishDeviationJob', async () => {
      mockPublishDeviationJob.mockResolvedValue({
        success: true,
        results: [],
      });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await workerProcessor(mockJob);

      const deps = mockPublishDeviationJob.mock.calls[0][1];

      expect(deps).toHaveProperty('prisma');
      expect(deps).toHaveProperty('logger');
      expect(deps).toHaveProperty('rateLimiter');
      expect(deps).toHaveProperty('metricsCollector');
      expect(deps).toHaveProperty('CircuitBreaker');
      expect(deps).toHaveProperty('withCircuitBreaker');
      expect(deps).toHaveProperty('publishToDeviantArt');
      expect(deps).toHaveProperty('queueStorageCleanup');
      expect(deps).toHaveProperty('errorCategorizer');
    });

    it('should provide working queueStorageCleanup function', async () => {
      let capturedQueueStorageCleanup: Function | null = null;

      mockPublishDeviationJob.mockImplementation(async (job, deps) => {
        capturedQueueStorageCleanup = deps.queueStorageCleanup;
        return { success: true, results: [] };
      });

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await workerProcessor(mockJob);

      expect(capturedQueueStorageCleanup).toBeTruthy();

      // Test the captured function
      await capturedQueueStorageCleanup!('test-dev-id', 'test-user-id');
      expect(mockQueueStorageCleanup).toHaveBeenCalledWith('test-dev-id', 'test-user-id');
    });
  });

  describe('Worker Configuration', () => {
    it('should have correct worker configuration', async () => {
      await import('./deviation-publisher.js');

      expect(workerOptions.concurrency).toBe(2);
      expect(workerOptions.lockDuration).toBe(1200000);
      expect(workerOptions.stalledInterval).toBe(60000);
      expect(workerOptions.maxStalledCount).toBe(2);
      expect(workerOptions.limiter).toEqual({
        max: 2,
        duration: 1000,
      });
    });

    it('should respect environment variables for worker config', async () => {
      await import('./deviation-publisher.js');

      // Verify these match the env vars set in beforeEach
      expect(workerOptions.concurrency).toBe(parseInt(process.env.PUBLISHER_CONCURRENCY!));
      expect(workerOptions.lockDuration).toBe(parseInt(process.env.PUBLISHER_JOB_TIMEOUT_MS!));
    });
  });

  describe('Edge Cases', () => {
    it('should handle job with all upload modes', async () => {
      const modes: Array<'single' | 'multiple'> = ['single', 'multiple'];

      for (const mode of modes) {
        mockPublishDeviationJob.mockResolvedValue({
          success: true,
          results: [],
        });

        const mockJob = {
          id: `job-${mode}`,
          data: {
            deviationId: `dev-${mode}`,
            userId: 'user-123',
            uploadMode: mode,
          },
          attemptsMade: 0,
          opts: { attempts: 7 },
        };

        await workerProcessor(mockJob);

        expect(mockPublishDeviationJob).toHaveBeenCalledWith(
          mockJob,
          expect.any(Object)
        );
      }
    });

    it('should handle publishDeviationNow with different upload modes', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await publishDeviationNow('dev-123', 'user-123', 'multiple');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        expect.objectContaining({
          uploadMode: 'multiple',
        }),
        expect.any(Object)
      );
    });

    it('should handle refresh token expiration when deviation has no user', async () => {
      const tokenExpiredError: any = new Error('REFRESH_TOKEN_EXPIRED');
      tokenExpiredError.code = 'REFRESH_TOKEN_EXPIRED';

      mockPublishDeviationJob.mockRejectedValue(tokenExpiredError);
      prisma.deviation.findFirst.mockResolvedValue(null);

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'single',
        },
        attemptsMade: 0,
        opts: { attempts: 7 },
      };

      await expect(workerProcessor(mockJob)).rejects.toThrow('REFRESH_TOKEN_EXPIRED');

      // Should not try to update or send email
      expect(prisma.deviation.updateMany).not.toHaveBeenCalled();
      expect(mockSendRefreshTokenExpiredJobNotification).not.toHaveBeenCalled();
    });

    it('should handle completed event with different result types', async () => {
      await import('./deviation-publisher.js');

      const completedHandler = eventHandlers.get('completed');
      expect(completedHandler).toBeDefined();

      const mockJob = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'multiple',
        },
      };

      const result = {
        success: true,
        results: [
          { deviationId: 'da-123', url: 'https://deviantart.com/test1' },
          { deviationId: 'da-456', url: 'https://deviantart.com/test2' },
        ],
      };

      completedHandler!(mockJob, result);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Job completed successfully', { result });
    });
  });

});
