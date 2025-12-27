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
process.env.S3_ACCESS_KEY_ID = 'test-key';
process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.S3_PUBLIC_URL = 'https://cdn.example.com';

// Mock BullMQ
const mockQueueAdd = vi.fn();
const mockWorkerOn = vi.fn();
let workerProcessor: Function;

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueueAdd;
  },
  Worker: class MockWorker {
    constructor(name: string, processor: Function, options: any) {
      workerProcessor = processor;
    }
    on = mockWorkerOn;
  },
}));

// Mock ioredis
vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { Redis: RedisMock };
});

// Mock shared storage module
const mockDelete = vi.fn();
vi.mock('@isekai/shared/storage', () => ({
  createStorageService: vi.fn(() => ({
    delete: mockDelete,
    upload: vi.fn(),
    getPresignedUploadUrl: vi.fn(),
    getPublicUrl: vi.fn(),
    getClient: vi.fn(),
    getBucket: vi.fn().mockReturnValue('test-bucket'),
  })),
  getS3ConfigFromEnv: vi.fn(() => ({
    endpoint: 'https://test.s3.amazonaws.com',
    region: 'auto',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    publicUrl: 'https://cdn.example.com',
  })),
}));

// Mock StructuredLogger
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerDebug = vi.fn();

vi.mock('../lib/structured-logger.js', () => ({
  StructuredLogger: {
    createJobLogger: () => ({
      info: mockLoggerInfo,
      error: mockLoggerError,
      debug: mockLoggerDebug,
    }),
  },
}));

// Mock prisma
vi.mock('../db/index.js', async () => {
  const actual = await vi.importActual('../db/index.js');
  return {
    ...actual,
    prisma: {
      deviationFile: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

describe('r2-cleanup', () => {
  let prisma: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set up environment
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      REDIS_URL: 'redis://localhost:6379',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_BUCKET_NAME: 'test-bucket',
      S3_PUBLIC_URL: 'https://cdn.example.com',
    };

    // Import mocked prisma
    const db = await import('../db/index.js');
    prisma = db.prisma;

    // Import module to initialize queue and worker
    await import('./r2-cleanup.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('R2 Cleanup Worker Processor', () => {
    it('should clean up files successfully', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      const mockFiles = [
        { id: 'file-1', deviationId: 'dev-1', r2Key: 'key-1', originalFilename: 'file1.jpg', fileSize: 1000 },
        { id: 'file-2', deviationId: 'dev-1', r2Key: 'key-2', originalFilename: 'file2.jpg', fileSize: 2000 },
      ];

      prisma.deviationFile.findMany.mockResolvedValueOnce(mockFiles);
      mockDelete.mockResolvedValue(undefined);
      prisma.deviationFile.deleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await workerProcessor(mockJob);

      expect(result).toEqual({
        filesDeleted: 2,
        bytesFreed: 3000,
      });

      expect(mockDelete).toHaveBeenCalledTimes(2);
      expect(mockDelete).toHaveBeenCalledWith('key-1');
      expect(mockDelete).toHaveBeenCalledWith('key-2');

      expect(prisma.deviationFile.deleteMany).toHaveBeenCalledWith({
        where: { deviationId: 'dev-1' },
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting R2 cleanup job', expect.any(Object));
      expect(mockLoggerInfo).toHaveBeenCalledWith('R2 cleanup completed successfully', expect.any(Object));
    });

    it('should handle case with no files to clean up', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      prisma.deviationFile.findMany.mockResolvedValueOnce([]);

      const result = await workerProcessor(mockJob);

      expect(result).toEqual({
        filesDeleted: 0,
        bytesFreed: 0,
      });

      expect(mockDelete).not.toHaveBeenCalled();
      expect(prisma.deviationFile.deleteMany).not.toHaveBeenCalled();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'No files to clean up for published deviation',
        { deviationId: 'dev-1' }
      );
    });

    it('should throw error if file deletion fails', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      const mockFiles = [
        { id: 'file-1', deviationId: 'dev-1', r2Key: 'key-1', originalFilename: 'file1.jpg', fileSize: 1000 },
      ];

      prisma.deviationFile.findMany.mockResolvedValueOnce(mockFiles);
      mockDelete.mockRejectedValueOnce(new Error('S3 error'));

      await expect(workerProcessor(mockJob)).rejects.toThrow(
        'Failed to delete 1 of 1 files from storage'
      );

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to delete file from storage',
        expect.any(Error),
        expect.any(Object)
      );

      // Should not delete DB records if storage deletion fails
      expect(prisma.deviationFile.deleteMany).not.toHaveBeenCalled();
    });

    it('should handle partial deletion failures', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      const mockFiles = [
        { id: 'file-1', deviationId: 'dev-1', r2Key: 'key-1', originalFilename: 'file1.jpg', fileSize: 1000 },
        { id: 'file-2', deviationId: 'dev-1', r2Key: 'key-2', originalFilename: 'file2.jpg', fileSize: 2000 },
        { id: 'file-3', deviationId: 'dev-1', r2Key: 'key-3', originalFilename: 'file3.jpg', fileSize: 3000 },
      ];

      prisma.deviationFile.findMany.mockResolvedValueOnce(mockFiles);

      // First and third succeed, second fails
      mockDelete
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 error'))
        .mockResolvedValueOnce(undefined);

      await expect(workerProcessor(mockJob)).rejects.toThrow(
        'Failed to delete 1 of 3 files from storage'
      );

      expect(mockDelete).toHaveBeenCalledTimes(3);
      expect(prisma.deviationFile.deleteMany).not.toHaveBeenCalled();
    });

    it('should log attempt number correctly', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 2, // Third attempt
      };

      prisma.deviationFile.findMany.mockResolvedValueOnce([]);

      await workerProcessor(mockJob);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting R2 cleanup job', {
        deviationId: 'dev-1',
        userId: 'user-1',
        attemptNumber: 3,
      });
    });

    it('should log file count and total size', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      const mockFiles = [
        { id: 'file-1', deviationId: 'dev-1', r2Key: 'key-1', originalFilename: 'file1.jpg', fileSize: 5000 },
        { id: 'file-2', deviationId: 'dev-1', r2Key: 'key-2', originalFilename: 'file2.jpg', fileSize: 3000 },
      ];

      prisma.deviationFile.findMany.mockResolvedValueOnce(mockFiles);
      mockDelete.mockResolvedValue(undefined);
      prisma.deviationFile.deleteMany.mockResolvedValueOnce({ count: 2 });

      await workerProcessor(mockJob);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Starting R2 file deletion', {
        fileCount: 2,
        totalSizeBytes: 8000,
      });
    });

    it('should log each file deletion', async () => {
      const mockJob = {
        data: { deviationId: 'dev-1', userId: 'user-1' },
        attemptsMade: 0,
      };

      const mockFiles = [
        { id: 'file-1', deviationId: 'dev-1', r2Key: 'key-1', originalFilename: 'test.jpg', fileSize: 1000 },
      ];

      prisma.deviationFile.findMany.mockResolvedValueOnce(mockFiles);
      mockDelete.mockResolvedValue(undefined);
      prisma.deviationFile.deleteMany.mockResolvedValueOnce({ count: 1 });

      await workerProcessor(mockJob);

      expect(mockLoggerDebug).toHaveBeenCalledWith('Deleted file from storage', {
        r2Key: 'key-1',
        fileName: 'test.jpg',
      });
    });
  });

  describe('queueR2Cleanup', () => {
    it('should queue cleanup job with correct data', async () => {
      mockQueueAdd.mockResolvedValueOnce({ id: 'job-1' });

      const { queueR2Cleanup } = await import('./r2-cleanup.js');
      await queueR2Cleanup('dev-1', 'user-1');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'cleanup',
        { deviationId: 'dev-1', userId: 'user-1' },
        { jobId: 'r2-cleanup-dev-1' }
      );
    });

    it('should use deviationId in jobId to prevent duplicates', async () => {
      mockQueueAdd.mockResolvedValueOnce({ id: 'job-1' });

      const { queueR2Cleanup } = await import('./r2-cleanup.js');
      await queueR2Cleanup('dev-123', 'user-456');

      const call = mockQueueAdd.mock.calls[0];
      expect(call[2].jobId).toBe('r2-cleanup-dev-123');
    });
  });

});
