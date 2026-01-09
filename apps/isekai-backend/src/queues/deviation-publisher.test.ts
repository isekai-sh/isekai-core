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

// Mock dependencies
const mockPublishDeviationJob = vi.fn();
const mockQueueStorageCleanup = vi.fn();
const mockPublishToDeviantArt = vi.fn();
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockQueueGetJobs = vi.fn();
const mockQueueClose = vi.fn();
const mockJobRemove = vi.fn();
const mockJobGetState = vi.fn();
const mockJobWaitUntilFinished = vi.fn();
const mockWorkerPause = vi.fn();
const mockWorkerClose = vi.fn();
const mockRedisQuit = vi.fn();
const mockMetricsCollectorGetMetrics = vi.fn();
const mockMetricsCollectorRecordStalledJob = vi.fn();
const mockMetricsCollectorShutdown = vi.fn();

vi.mock('@isekai/shared', () => ({
  publishDeviationJob: mockPublishDeviationJob,
}));

vi.mock('./storage-cleanup.js', () => ({
  queueStorageCleanup: mockQueueStorageCleanup,
}));

vi.mock('../lib/deviantart.js', () => ({
  publishToDeviantArt: mockPublishToDeviantArt,
}));

vi.mock('../db/index.js', () => ({
  prisma: {},
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    quit = mockRedisQuit;
  },
}));

let capturedWorkerProcessor: ((job: Job) => Promise<any>) | null = null;
const workerEventListeners: Record<string, Function[]> = {};

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name = 'deviation-publisher';
    add = mockQueueAdd;
    getJob = mockQueueGetJob;
    getJobs = mockQueueGetJobs;
    close = mockQueueClose;
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
    pause = mockWorkerPause;
    close = mockWorkerClose;
  },
  QueueEvents: class MockQueueEvents {},
}));

vi.mock('../lib/error-categorizer.js', () => ({
  ErrorCategorizer: class MockErrorCategorizer {},
}));

const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('../lib/structured-logger.js', () => ({
  StructuredLogger: {
    createJobLogger: vi.fn(() => ({
      info: mockLoggerInfo,
      error: mockLoggerError,
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('../lib/rate-limiter.js', () => ({
  AdaptiveRateLimiter: class MockAdaptiveRateLimiter {},
}));

vi.mock('../lib/publisher-metrics.js', () => ({
  PublisherMetricsCollector: class MockPublisherMetricsCollector {
    getMetrics = mockMetricsCollectorGetMetrics;
    recordStalledJob = mockMetricsCollectorRecordStalledJob;
    shutdown = mockMetricsCollectorShutdown;
  },
}));

vi.mock('../lib/circuit-breaker.js', () => ({
  CircuitBreaker: class MockCircuitBreaker {},
  withCircuitBreaker: vi.fn(),
}));

describe('deviation-publisher', () => {
  const originalEnv = process.env;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
    capturedWorkerProcessor = null;
    Object.keys(workerEventListeners).forEach((key) => delete workerEventListeners[key]);

    process.env = { ...originalEnv };
    process.env.REDIS_URL = 'redis://localhost:6379';

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await vi.resetModules();
    await import('./deviation-publisher.js');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe('worker processor', () => {
    it('should call publishDeviationJob with correct dependencies', async () => {
      mockPublishDeviationJob.mockResolvedValue({ success: true });

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'REPLACE' as any,
        },
        attemptsMade: 0,
      };

      const result = await capturedWorkerProcessor!(mockJob as Job);

      expect(mockPublishDeviationJob).toHaveBeenCalled();
      expect(result).toEqual({ success: true });

      // Verify dependencies passed
      const deps = mockPublishDeviationJob.mock.calls[0][1];
      expect(deps.prisma).toBeDefined();
      expect(deps.logger).toBeDefined();
      expect(deps.rateLimiter).toBeDefined();
      expect(deps.metricsCollector).toBeDefined();
      expect(deps.publishToDeviantArt).toBeDefined();
      expect(deps.queueStorageCleanup).toBeDefined();
      expect(deps.errorCategorizer).toBeDefined();
    });

    it('should call queueStorageCleanup when provided in dependencies', async () => {
      mockPublishDeviationJob.mockImplementation(async (job, deps) => {
        await deps.queueStorageCleanup('dev-123', 'user-123');
        return { success: true };
      });

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'REPLACE' as any,
        },
        attemptsMade: 0,
      };

      await capturedWorkerProcessor!(mockJob as Job);

      expect(mockQueueStorageCleanup).toHaveBeenCalledWith('dev-123', 'user-123');
    });
  });

  describe('event handlers', () => {
    it('should register completed event handler', () => {
      expect(workerEventListeners['completed']).toBeDefined();
      expect(workerEventListeners['completed'].length).toBeGreaterThan(0);
    });

    it('should log on job completion', () => {
      const completedHandler = workerEventListeners['completed'][0];

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'REPLACE' as any,
        },
      };

      const result = { success: true, deviationUrl: 'https://deviantart.com/...' };
      completedHandler(mockJob, result);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Job completed successfully', { result });
    });

    it('should register failed event handler', () => {
      expect(workerEventListeners['failed']).toBeDefined();
      expect(workerEventListeners['failed'].length).toBeGreaterThan(0);
    });

    it('should log on job failure', () => {
      const failedHandler = workerEventListeners['failed'][0];

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
          uploadMode: 'REPLACE' as any,
        },
      };

      const error = new Error('Publishing failed');
      failedHandler(mockJob, error);

      expect(mockLoggerError).toHaveBeenCalledWith('Job failed permanently', error);
    });

    it('should handle failed event without job', () => {
      const failedHandler = workerEventListeners['failed'][0];
      const error = new Error('Publishing failed');

      expect(() => failedHandler(null, error)).not.toThrow();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should register stalled event handler', () => {
      expect(workerEventListeners['stalled']).toBeDefined();
      expect(workerEventListeners['stalled'].length).toBeGreaterThan(0);
    });

    it('should log and record metrics on job stall', () => {
      const stalledHandler = workerEventListeners['stalled'][0];

      stalledHandler('job-123');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Publisher] Job job-123 stalled - may be stuck'
      );
      expect(mockMetricsCollectorRecordStalledJob).toHaveBeenCalledWith('job-123');
    });

    it('should register error event handler', () => {
      expect(workerEventListeners['error']).toBeDefined();
      expect(workerEventListeners['error'].length).toBeGreaterThan(0);
    });

    it('should log worker errors', () => {
      const errorHandler = workerEventListeners['error'][0];
      const error = new Error('Worker error');

      errorHandler(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[Publisher] Worker error:', error);
    });
  });

  describe('scheduleDeviation', () => {
    it('should schedule deviation with delay', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000); // 1 minute from now

      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        { deviationId: 'dev-123', userId: 'user-123', uploadMode: 'REPLACE' },
        { delay: expect.any(Number), jobId: 'deviation-dev-123' }
      );
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should skip if job already exists and is active', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('active');

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      expect(mockQueueAdd).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('already exists with state active')
      );
    });

    it('should skip if job already exists and is waiting', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('waiting');

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should skip if job already exists and is delayed', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('delayed');

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should remove and re-queue if job is completed', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
        remove: mockJobRemove,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('completed');
      mockJobRemove.mockResolvedValue(undefined);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() + 60000);
      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      expect(mockJobRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });

    it('should handle past publish date with 0 delay', async () => {
      const { scheduleDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const publishAt = new Date(Date.now() - 60000); // Past date

      await scheduleDeviation('dev-123', 'user-123', publishAt, 'REPLACE' as any);

      const callArgs = mockQueueAdd.mock.calls[0][2];
      expect(callArgs.delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('publishDeviationNow', () => {
    it('should queue deviation for immediate publishing', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await publishDeviationNow('dev-123', 'user-123', 'REPLACE' as any);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'publish-deviation',
        { deviationId: 'dev-123', userId: 'user-123', uploadMode: 'REPLACE' },
        { jobId: 'deviation-dev-123' }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('immediate publishing'));
    });

    it('should skip if job already exists and is active', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('active');

      await publishDeviationNow('dev-123', 'user-123', 'REPLACE' as any);

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should remove and re-queue if job is failed', async () => {
      const { publishDeviationNow } = await import('./deviation-publisher.js');

      const mockExistingJob = {
        getState: mockJobGetState,
        remove: mockJobRemove,
      };
      mockQueueGetJob.mockResolvedValue(mockExistingJob);
      mockJobGetState.mockResolvedValue('failed');
      mockJobRemove.mockResolvedValue(undefined);
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await publishDeviationNow('dev-123', 'user-123', 'REPLACE' as any);

      expect(mockJobRemove).toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalled();
    });
  });

  describe('cancelScheduledDeviation', () => {
    it('should cancel scheduled deviation and return true', async () => {
      const { cancelScheduledDeviation } = await import('./deviation-publisher.js');

      const mockJob = {
        remove: mockJobRemove,
      };
      mockQueueGetJob.mockResolvedValue(mockJob);
      mockJobRemove.mockResolvedValue(undefined);

      const result = await cancelScheduledDeviation('dev-123');

      expect(result).toBe(true);
      expect(mockJobRemove).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Deviation Publisher] Cancelled scheduled deviation dev-123'
      );
    });

    it('should return false if no job found', async () => {
      const { cancelScheduledDeviation } = await import('./deviation-publisher.js');

      mockQueueGetJob.mockResolvedValue(null);

      const result = await cancelScheduledDeviation('dev-123');

      expect(result).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Deviation Publisher] No scheduled job found for deviation dev-123'
      );
    });
  });
});
