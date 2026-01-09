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

import { prisma } from '../db/index.js';
import { logger } from './logger.js';
import { deviationPublisherQueue } from '../queues/deviation-publisher.js';
import { queueStorageCleanup } from '../queues/storage-cleanup.js';
import { RedisClientManager } from './redis-client.js';
import { CACHE_PREFIX, CACHE_VERSION, CacheNamespace } from './cache-keys.js';

export interface CleanupResult {
  userId: string;
  jobsCancelled: number;
  filesQueued: number;
  cacheKeysDeleted: number;
  success: boolean;
  error?: string;
}

/**
 * Cancel all pending/delayed jobs for a specific user.
 * Must be called BEFORE deleting user to prevent orphaned jobs.
 */
async function cancelUserJobs(userId: string): Promise<number> {
  // Get all deviations for this user
  const deviations = await prisma.deviation.findMany({
    where: { userId },
    select: { id: true },
  });

  let cancelled = 0;

  // Cancel jobs in all states: waiting, delayed, active
  for (const deviation of deviations) {
    const jobId = `publish-${deviation.id}`;

    try {
      const job = await deviationPublisherQueue.getJob(jobId);
      if (job) {
        const state = await job.getState();

        if (state === 'active') {
          // Job is currently running - mark deviation for cleanup
          await prisma.deviation.update({
            where: { id: deviation.id },
            data: { status: 'failed', errorMessage: 'User removed from instance' },
          });
          logger.warn('Job active during cleanup, marked as failed', {
            jobId,
            deviationId: deviation.id,
          });
        } else {
          // Job is waiting/delayed - remove it
          await job.remove();
          cancelled++;
        }
      }
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return cancelled;
}

/**
 * Clear all Redis cache keys for a user
 */
async function clearUserRedisCache(userId: string): Promise<number> {
  const redis = await RedisClientManager.getClient();
  if (!redis) return 0;

  const namespaces = [
    CacheNamespace.BROWSE,
    CacheNamespace.ANALYTICS,
    CacheNamespace.MESSAGES,
    CacheNamespace.GALLERY,
    CacheNamespace.DEVIATION,
  ];

  let totalDeleted = 0;

  for (const namespace of namespaces) {
    const pattern = `${CACHE_PREFIX}:${CACHE_VERSION}:${namespace}:user:${userId}:*`;

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        totalDeleted += keys.length;
      }
    } catch (error) {
      logger.error('Failed to clear cache keys', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return totalDeleted;
}

/**
 * Full cleanup when a team member is kicked.
 * Order matters:
 * 1. Cancel pending jobs (prevent new work)
 * 2. Queue storage cleanup (async file deletion)
 * 3. Clear Redis cache
 * 4. Delete User record (cascades DB records)
 */
export async function cleanupUserData(userId: string): Promise<CleanupResult> {
  const result: CleanupResult = {
    userId,
    jobsCancelled: 0,
    filesQueued: 0,
    cacheKeysDeleted: 0,
    success: false,
  };

  try {
    logger.info('Starting user cleanup', { userId });

    // 1. Cancel all pending jobs for this user
    const cancelledJobs = await cancelUserJobs(userId);
    result.jobsCancelled = cancelledJobs;
    logger.info('Cancelled pending jobs', { userId, count: cancelledJobs });

    // 2. Get all deviations with files and queue storage cleanup
    const deviations = await prisma.deviation.findMany({
      where: { userId },
      include: { files: true },
    });

    for (const deviation of deviations) {
      if (deviation.files.length > 0) {
        await queueStorageCleanup(deviation.id, userId);
        result.filesQueued += deviation.files.length;
      }
    }
    logger.info('Queued storage cleanup', { userId, files: result.filesQueued });

    // 3. Clear Redis cache for this user
    const cacheDeleted = await clearUserRedisCache(userId);
    result.cacheKeysDeleted = cacheDeleted;
    logger.info('Cleared Redis cache', { userId, keys: cacheDeleted });

    // 4. Delete User record (cascades: deviations, files, api keys, etc.)
    await prisma.user.delete({
      where: { id: userId },
    });
    logger.info('Deleted user record', { userId });

    result.success = true;
    return result;
  } catch (error) {
    logger.error('User cleanup failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    result.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}
