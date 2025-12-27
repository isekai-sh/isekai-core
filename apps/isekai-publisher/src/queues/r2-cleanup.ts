import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../db/index.js';
import { createStorageService, getS3ConfigFromEnv } from '@isekai/shared/storage';
import { StructuredLogger } from '../lib/structured-logger.js';

// Create storage service singleton for cleanup operations
const storageService = createStorageService(getS3ConfigFromEnv());

async function deleteFromStorage(key: string): Promise<void> {
  return storageService.delete(key);
}

const redisUrl = process.env.REDIS_URL!;

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? {
    rejectUnauthorized: false, // Accept self-signed certificates for internal Redis
  } : undefined,
});

export interface R2CleanupJobData {
  deviationId: string;
  userId: string;
}

/**
 * Queue for cleaning up R2 files after successful publish
 * Separate from main publisher queue to allow independent retries
 */
export const r2CleanupQueue = new Queue<R2CleanupJobData>('r2-cleanup', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
      count: 1000, // Prevent Redis memory exhaustion
    },
  },
});

/**
 * Worker to process R2 cleanup jobs
 * Deletes files from R2, updates storage quota, and removes DB records
 */
export const r2CleanupWorker = new Worker<R2CleanupJobData>(
  'r2-cleanup',
  async (job: Job<R2CleanupJobData>) => {
    const { deviationId, userId } = job.data;
    const attemptNumber = job.attemptsMade + 1;
    const logger = StructuredLogger.createJobLogger(job);

    logger.info('Starting R2 cleanup job', {
      deviationId,
      userId,
      attemptNumber,
    });

    // Query all files for this deviation
    const files = await prisma.deviationFile.findMany({
      where: { deviationId },
    });

    if (!files || files.length === 0) {
      logger.info('No files to clean up for published deviation', { deviationId });
      return { filesDeleted: 0, bytesFreed: 0 };
    }

    const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);

    logger.info('Starting R2 file deletion', {
      fileCount: files.length,
      totalSizeBytes: totalSize,
    });

    // Delete files from storage (parallel deletion with individual error handling)
    const deletionResults = await Promise.allSettled(
      files.map(async (file) => {
        try {
          await deleteFromStorage(file.r2Key);
          logger.debug('Deleted file from storage', {
            r2Key: file.r2Key,
            fileName: file.originalFilename,
          });
          return { success: true, key: file.r2Key };
        } catch (error) {
          logger.error('Failed to delete file from storage', error, {
            r2Key: file.r2Key,
            fileName: file.originalFilename,
          });
          throw error; // Trigger job retry
        }
      })
    );

    // Check if any deletions failed
    const failedDeletions = deletionResults.filter((r) => r.status === 'rejected');
    if (failedDeletions.length > 0) {
      throw new Error(
        `Failed to delete ${failedDeletions.length} of ${files.length} files from storage`
      );
    }

    // Delete file records (storage tracking removed in open-source version)
    await prisma.deviationFile.deleteMany({
      where: { deviationId },
    });

    logger.info('R2 cleanup completed successfully', {
      deviationId,
      filesDeleted: files.length,
      bytesFreed: totalSize,
    });

    return {
      filesDeleted: files.length,
      bytesFreed: totalSize,
    };
  },
  {
    connection,
    concurrency: 3, // Process 3 cleanup jobs concurrently
  }
);

/**
 * Queue R2 cleanup job for a published deviation
 * Uses jobId to prevent duplicate cleanup jobs for the same deviation
 */
export async function queueR2Cleanup(
  deviationId: string,
  userId: string
): Promise<void> {
  await r2CleanupQueue.add(
    'cleanup',
    { deviationId, userId },
    {
      jobId: `r2-cleanup-${deviationId}`, // Prevent duplicates
    }
  );
}

// Event handlers for monitoring
r2CleanupWorker.on('completed', (job) => {
  const logger = StructuredLogger.createJobLogger(job);
  logger.info('R2 cleanup job completed', {
    deviationId: job.data.deviationId,
    filesDeleted: job.returnvalue?.filesDeleted,
    bytesFreed: job.returnvalue?.bytesFreed,
  });
});

r2CleanupWorker.on('failed', (job, error) => {
  if (job) {
    const logger = StructuredLogger.createJobLogger(job);
    logger.error('R2 cleanup job failed', error, {
      deviationId: job.data.deviationId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  }
});

r2CleanupWorker.on('stalled', (jobId) => {
  console.error(`R2 cleanup job ${jobId} has stalled`);
});
