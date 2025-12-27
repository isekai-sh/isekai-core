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

import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../db/index.js";
import { deleteFromStorage } from "../lib/upload-service.js";
import { StructuredLogger } from "../lib/structured-logger.js";

const redisUrl = process.env.REDIS_URL!;

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://")
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
export const storageCleanupQueue = new Queue<StorageCleanupJobData>("storage-cleanup", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
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
  "storage-cleanup",
  async (job: Job<StorageCleanupJobData>) => {
    const { deviationId, userId } = job.data;
    const attemptNumber = job.attemptsMade + 1;
    const logger = StructuredLogger.createJobLogger(job);

    logger.info("Starting storage cleanup job", {
      deviationId,
      userId,
      attemptNumber,
    });

    // Query all files for this deviation
    const files = await prisma.deviationFile.findMany({
      where: { deviationId },
    });

    if (!files || files.length === 0) {
      logger.info("No files to clean up for published deviation", {
        deviationId,
      });
      return { filesDeleted: 0, bytesFreed: 0 };
    }

    const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);

    logger.info("Starting storage file deletion", {
      fileCount: files.length,
      totalSizeBytes: totalSize,
    });

    // Delete files from storage (parallel deletion with individual error handling)
    const deletionResults = await Promise.allSettled(
      files.map(async (file) => {
        try {
          await deleteFromStorage(file.storageKey);
          logger.debug("Deleted file from storage", {
            storageKey: file.storageKey,
            fileName: file.originalFilename,
          });
          return { success: true, key: file.storageKey };
        } catch (error) {
          logger.error("Failed to delete file from storage", error, {
            storageKey: file.storageKey,
            fileName: file.originalFilename,
          });
          throw error; // Trigger job retry
        }
      })
    );

    // Check if any deletions failed
    const failedDeletions = deletionResults.filter(
      (r) => r.status === "rejected"
    );
    if (failedDeletions.length > 0) {
      throw new Error(
        `Failed to delete ${failedDeletions.length} of ${files.length} files from storage`
      );
    }

    // Delete deviation file records
    await prisma.deviationFile.deleteMany({
      where: { deviationId },
    });

    logger.info("Storage cleanup completed successfully", {
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
 * Queue storage cleanup job for a published deviation
 * Uses jobId to prevent duplicate cleanup jobs for the same deviation
 */
export async function queueStorageCleanup(
  deviationId: string,
  userId: string
): Promise<void> {
  await storageCleanupQueue.add(
    "cleanup",
    { deviationId, userId },
    {
      jobId: `storage-cleanup-${deviationId}`, // Prevent duplicates
    }
  );
}

// Event handlers for monitoring
storageCleanupWorker.on("completed", (job) => {
  const logger = StructuredLogger.createJobLogger(job);
  logger.info("Storage cleanup job completed", {
    deviationId: job.data.deviationId,
    filesDeleted: job.returnvalue?.filesDeleted,
    bytesFreed: job.returnvalue?.bytesFreed,
  });
});

storageCleanupWorker.on("failed", (job, error) => {
  if (job) {
    const logger = StructuredLogger.createJobLogger(job);
    logger.error("Storage cleanup job failed", error, {
      deviationId: job.data.deviationId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  }
});

storageCleanupWorker.on("stalled", (jobId) => {
  console.error(`Storage cleanup job ${jobId} has stalled`);
});
