import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../db/index.js';
import {
  createStorageService,
  generateThumbnailStorageKey,
  getS3ConfigFromEnv,
  THUMBNAIL_VERSION,
  THUMBNAIL_WIDTHS,
} from '@isekai/shared/storage';
import { StructuredLogger } from '../lib/structured-logger.js';

// Create storage service singleton for cleanup operations
const storageService = createStorageService(getS3ConfigFromEnv());

async function deleteFromStorage(key: string): Promise<void> {
  return storageService.delete(key);
}

const redisUrl = process.env.REDIS_URL!;

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://')
    ? {
        rejectUnauthorized: false, // Accept self-signed certificates for internal Redis
      }
    : undefined,
});

export interface StorageCleanupJobData {
  deviationId: string;
  userId: string;
}

/**
 * Queue for cleaning up storage files after successful publish
 * Separate from main publisher queue to allow independent retries
 */
export const storageCleanupQueue = new Queue<StorageCleanupJobData>('storage-cleanup', {
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
 * Worker to process storage cleanup jobs
 * Deletes files from storage, updates storage quota, and removes DB records
 */
export const storageCleanupWorker = new Worker<StorageCleanupJobData>(
  'storage-cleanup',
  async (job: Job<StorageCleanupJobData>) => {
    const { deviationId, userId } = job.data;
    const attemptNumber = job.attemptsMade + 1;
    const logger = StructuredLogger.createJobLogger(job);

    logger.info('Starting storage cleanup job', {
      deviationId,
      userId,
      attemptNumber,
    });

    // Query all files for this deviation
    const files = await prisma.deviationFile.findMany({
      where: { deviationId },
      include: { variants: true },
    });

    if (!files || files.length === 0) {
      logger.info('No files to clean up for published deviation', { deviationId });
      return { filesDeleted: 0, bytesFreed: 0 };
    }

    // Revoke any active media-worker lease before deleting deterministic keys.
    await prisma.deviationFile.updateMany({
      where: { id: { in: files.map((file) => file.id) } },
      data: {
        thumbnailStatus: 'skipped',
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
        thumbnailUpdatedAt: new Date(),
      },
    });

    const totalSize = files.reduce(
      (sum, file) =>
        sum + file.fileSize + (file.variants ?? []).reduce((n, variant) => n + variant.fileSize, 0),
      0
    );
    const storageObjects = [
      ...new Map(
        files
          .flatMap((file) => [
            ...(file.variants ?? []).map((variant) => ({
              storageKey: variant.storageKey,
              fileName: `${file.originalFilename} thumbnail`,
            })),
            ...THUMBNAIL_WIDTHS.map((width) => ({
              storageKey: generateThumbnailStorageKey(file.storageKey, width, THUMBNAIL_VERSION),
              fileName: `${file.originalFilename} thumbnail`,
            })),
            { storageKey: file.storageKey, fileName: file.originalFilename },
          ])
          .map((object) => [object.storageKey, object] as const)
      ).values(),
    ];

    logger.info('Starting storage file deletion', {
      fileCount: files.length,
      totalSizeBytes: totalSize,
    });

    // Delete files from storage (parallel deletion with individual error handling)
    const deletionResults = await Promise.allSettled(
      storageObjects.map(async (file) => {
        try {
          await deleteFromStorage(file.storageKey);
          logger.debug('Deleted file from storage', {
            storageKey: file.storageKey,
            fileName: file.fileName,
          });
          return { success: true, key: file.storageKey };
        } catch (error) {
          logger.error('Failed to delete file from storage', error, {
            storageKey: file.storageKey,
            fileName: file.fileName,
          });
          throw error; // Trigger job retry
        }
      })
    );

    // Check if any deletions failed
    const failedDeletions = deletionResults.filter((r) => r.status === 'rejected');
    if (failedDeletions.length > 0) {
      throw new Error(
        `Failed to delete ${failedDeletions.length} of ${storageObjects.length} objects from storage`
      );
    }

    // Delete file records (storage tracking removed in open-source version)
    await prisma.deviationFile.deleteMany({
      where: { deviationId },
    });

    logger.info('Storage cleanup completed successfully', {
      deviationId,
      filesDeleted: files.length,
      objectsDeleted: storageObjects.length,
      bytesFreed: totalSize,
    });

    return {
      filesDeleted: files.length,
      objectsDeleted: storageObjects.length,
      bytesFreed: totalSize,
    };
  },
  {
    connection,
    concurrency: 3, // Process 3 cleanup jobs concurrently
  }
);

/**
 * Queue storage cleanup job for a published deviation
 * Uses jobId to prevent duplicate cleanup jobs for the same deviation
 */
export async function queueStorageCleanup(deviationId: string, userId: string): Promise<void> {
  await storageCleanupQueue.add(
    'cleanup',
    { deviationId, userId },
    {
      jobId: `storage-cleanup-${deviationId}`, // Prevent duplicates
    }
  );
}

// Event handlers for monitoring
storageCleanupWorker.on('completed', (job) => {
  const logger = StructuredLogger.createJobLogger(job);
  logger.info('Storage cleanup job completed', {
    deviationId: job.data.deviationId,
    filesDeleted: job.returnvalue?.filesDeleted,
    bytesFreed: job.returnvalue?.bytesFreed,
  });
});

storageCleanupWorker.on('failed', (job, error) => {
  if (job) {
    const logger = StructuredLogger.createJobLogger(job);
    logger.error('Storage cleanup job failed', error, {
      deviationId: job.data.deviationId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  }
});

storageCleanupWorker.on('stalled', (jobId) => {
  console.error(`Storage cleanup job ${jobId} has stalled`);
});
