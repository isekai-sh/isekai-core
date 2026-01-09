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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

// Mock dependencies
const mockDeleteFromStorage = vi.fn();
const mockPrismaDeviationFileFindMany = vi.fn();
const mockPrismaDeviationFileDeleteMany = vi.fn();

vi.mock('../lib/upload-service.js', () => ({
  deleteFromStorage: mockDeleteFromStorage,
}));

vi.mock('../db/index.js', () => ({
  prisma: {
    deviationFile: {
      findMany: mockPrismaDeviationFileFindMany,
      deleteMany: mockPrismaDeviationFileDeleteMany,
    },
  },
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    constructor() {
      // Mock constructor
    }
  },
}));

let capturedWorkerProcessor: ((job: Job) => Promise<any>) | null = null;
const mockQueueAdd = vi.fn();
const workerEventListeners: Record<string, Function[]> = {};

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
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

const mockLoggerInfo = vi.fn();
const mockLoggerDebug = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('../lib/structured-logger.js', () => ({
  StructuredLogger: {
    createJobLogger: vi.fn(() => ({
      info: mockLoggerInfo,
      debug: mockLoggerDebug,
      error: mockLoggerError,
      warn: vi.fn(),
    })),
  },
}));

describe('storage-cleanup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedWorkerProcessor = null;
    Object.keys(workerEventListeners).forEach((key) => delete workerEventListeners[key]);
    process.env.REDIS_URL = 'redis://localhost:6379';

    // Import the module to initialize everything
    await vi.resetModules();
    await import('./storage-cleanup.js');
  });

  describe('storageCleanupWorker processor', () => {
    it('should handle deviation with no files', async () => {
      mockPrismaDeviationFileFindMany.mockResolvedValue([]);

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 0,
      };

      const result = await capturedWorkerProcessor!(mockJob as Job);

      expect(result).toEqual({
        filesDeleted: 0,
        bytesFreed: 0,
      });
      expect(mockPrismaDeviationFileFindMany).toHaveBeenCalledWith({
        where: { deviationId: 'dev-123' },
      });
      expect(mockDeleteFromStorage).not.toHaveBeenCalled();
      expect(mockPrismaDeviationFileDeleteMany).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('No files to clean up for published deviation', {
        deviationId: 'dev-123',
      });
    });

    it('should successfully clean up files', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          deviationId: 'dev-123',
          storageKey: 'uploads/file1.png',
          originalFilename: 'file1.png',
          fileSize: 1024,
        },
        {
          id: 'file-2',
          deviationId: 'dev-123',
          storageKey: 'uploads/file2.png',
          originalFilename: 'file2.png',
          fileSize: 2048,
        },
      ];

      mockPrismaDeviationFileFindMany.mockResolvedValue(mockFiles);
      mockDeleteFromStorage.mockResolvedValue(undefined);
      mockPrismaDeviationFileDeleteMany.mockResolvedValue({ count: 2 });

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 0,
      };

      const result = await capturedWorkerProcessor!(mockJob as Job);

      expect(result).toEqual({
        filesDeleted: 2,
        bytesFreed: 3072,
      });
      expect(mockDeleteFromStorage).toHaveBeenCalledTimes(2);
      expect(mockDeleteFromStorage).toHaveBeenCalledWith('uploads/file1.png');
      expect(mockDeleteFromStorage).toHaveBeenCalledWith('uploads/file2.png');
      expect(mockPrismaDeviationFileDeleteMany).toHaveBeenCalledWith({
        where: { deviationId: 'dev-123' },
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith('Storage cleanup completed successfully', {
        deviationId: 'dev-123',
        filesDeleted: 2,
        bytesFreed: 3072,
      });
    });

    it('should throw error when file deletion fails', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          deviationId: 'dev-123',
          storageKey: 'uploads/file1.png',
          originalFilename: 'file1.png',
          fileSize: 1024,
        },
      ];

      mockPrismaDeviationFileFindMany.mockResolvedValue(mockFiles);
      mockDeleteFromStorage.mockRejectedValue(new Error('S3 error'));

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 0,
      };

      await expect(capturedWorkerProcessor!(mockJob as Job)).rejects.toThrow(
        'Failed to delete 1 of 1 files from storage'
      );
      expect(mockPrismaDeviationFileDeleteMany).not.toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle partial file deletion failure', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          deviationId: 'dev-123',
          storageKey: 'uploads/file1.png',
          originalFilename: 'file1.png',
          fileSize: 1024,
        },
        {
          id: 'file-2',
          deviationId: 'dev-123',
          storageKey: 'uploads/file2.png',
          originalFilename: 'file2.png',
          fileSize: 2048,
        },
      ];

      mockPrismaDeviationFileFindMany.mockResolvedValue(mockFiles);
      mockDeleteFromStorage
        .mockResolvedValueOnce(undefined) // First file succeeds
        .mockRejectedValueOnce(new Error('S3 error')); // Second file fails

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 0,
      };

      await expect(capturedWorkerProcessor!(mockJob as Job)).rejects.toThrow(
        'Failed to delete 1 of 2 files from storage'
      );
    });

    it('should track attempt number correctly', async () => {
      mockPrismaDeviationFileFindMany.mockResolvedValue([]);

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 2, // Third attempt
      };

      await capturedWorkerProcessor!(mockJob as Job);

      // Verify logger was created with the job
      expect(mockLoggerInfo).toHaveBeenCalled();
    });
  });

  describe('queueStorageCleanup', () => {
    it('should queue cleanup job with correct parameters', async () => {
      const { queueStorageCleanup } = await import('./storage-cleanup.js');

      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await queueStorageCleanup('dev-123', 'user-123');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'cleanup',
        { deviationId: 'dev-123', userId: 'user-123' },
        { jobId: 'storage-cleanup-dev-123' }
      );
    });

    it('should use jobId to prevent duplicate jobs', async () => {
      const { queueStorageCleanup } = await import('./storage-cleanup.js');

      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      await queueStorageCleanup('dev-456', 'user-456');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'cleanup',
        { deviationId: 'dev-456', userId: 'user-456' },
        { jobId: 'storage-cleanup-dev-456' }
      );
    });
  });

  describe('event handlers', () => {
    it('should register completed event handler', async () => {
      expect(workerEventListeners['completed']).toBeDefined();
      expect(workerEventListeners['completed'].length).toBeGreaterThan(0);
    });

    it('should log on job completion', async () => {
      const completedHandler = workerEventListeners['completed'][0];
      expect(completedHandler).toBeDefined();

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        returnvalue: {
          filesDeleted: 3,
          bytesFreed: 5000,
        },
      };

      completedHandler(mockJob);

      expect(mockLoggerInfo).toHaveBeenCalled();
    });

    it('should register failed event handler', async () => {
      expect(workerEventListeners['failed']).toBeDefined();
      expect(workerEventListeners['failed'].length).toBeGreaterThan(0);
    });

    it('should log on job failure', async () => {
      const failedHandler = workerEventListeners['failed'][0];
      expect(failedHandler).toBeDefined();

      const mockJob: Partial<Job> = {
        id: 'job-123',
        data: {
          deviationId: 'dev-123',
          userId: 'user-123',
        },
        attemptsMade: 2,
        opts: { attempts: 5 },
      };

      const error = new Error('Cleanup failed');
      failedHandler(mockJob, error);

      expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should handle failed event without job', async () => {
      const failedHandler = workerEventListeners['failed'][0];
      const error = new Error('Cleanup failed');

      // Should not throw when job is null
      expect(() => failedHandler(null, error)).not.toThrow();
    });

    it('should register stalled event handler', async () => {
      expect(workerEventListeners['stalled']).toBeDefined();
      expect(workerEventListeners['stalled'].length).toBeGreaterThan(0);
    });

    it('should log on job stall', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const stalledHandler = workerEventListeners['stalled'][0];
      expect(stalledHandler).toBeDefined();

      stalledHandler('job-123');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Storage cleanup job job-123 has stalled');

      consoleErrorSpy.mockRestore();
    });
  });
});
