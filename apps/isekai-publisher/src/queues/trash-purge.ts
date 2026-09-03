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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */

import { Job, Queue, Worker } from 'bullmq';
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

const storageService = createStorageService(getS3ConfigFromEnv());
const redisUrl = process.env.REDIS_URL!;
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

export interface TrashPurgeJobData {
  deviationId: string;
  userId: string;
  discardedAt: string;
}

export const trashPurgeQueue = new Queue<TrashPurgeJobData>('trash-purge', {
  connection,
  defaultJobOptions: {
    attempts: 7,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600, count: 1000 },
  },
});

export const trashPurgeWorker = new Worker<TrashPurgeJobData>(
  'trash-purge',
  async (job: Job<TrashPurgeJobData>) => {
    const { deviationId, userId, discardedAt } = job.data;
    const discardToken = new Date(discardedAt);
    const now = new Date();
    const logger = StructuredLogger.createJobLogger(job);

    if (Number.isNaN(discardToken.getTime())) {
      throw new Error('Trash purge job has an invalid discardedAt token');
    }

    // The claim permanently closes the restore window before any object is
    // touched. It is intentionally retained after partial failure so a retry
    // can finish without exposing a draft whose files may already be missing.
    const claim = await prisma.deviation.updateMany({
      where: {
        id: deviationId,
        userId,
        status: 'trashed',
        discardedAt: discardToken,
        purgeAfter: { lte: now },
        purgeStartedAt: null,
      },
      data: { purgeStartedAt: now, updatedAt: now },
    });

    if (claim.count === 0) {
      const claimedForThisDiscard = await prisma.deviation.findFirst({
        where: {
          id: deviationId,
          userId,
          status: 'trashed',
          discardedAt: discardToken,
          purgeStartedAt: { not: null },
        },
        select: { id: true },
      });

      if (!claimedForThisDiscard) {
        logger.info('Skipping stale or restored trash purge job', { deviationId, userId });
        return { skipped: true, objectsDeleted: 0, filesDeleted: 0 };
      }
    }

    const files = await prisma.deviationFile.findMany({
      where: { deviationId },
      include: { variants: true },
    });

    await prisma.deviationFile.updateMany({
      where: { deviationId },
      data: {
        thumbnailStatus: 'skipped',
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
        thumbnailUpdatedAt: now,
      },
    });

    const storageObjects = [
      ...new Set(
        files.flatMap((file) => [
          ...file.variants.map((variant) => variant.storageKey),
          ...THUMBNAIL_WIDTHS.map((width) =>
            generateThumbnailStorageKey(file.storageKey, width, THUMBNAIL_VERSION)
          ),
          file.storageKey,
        ])
      ),
    ];

    const results = await Promise.allSettled(
      storageObjects.map((storageKey) => storageService.delete(storageKey))
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      logger.error('Trash purge object deletion failed', new Error('Storage deletion failed'), {
        deviationId,
        failedObjects: failures.length,
        totalObjects: storageObjects.length,
      });
      throw new Error(
        `Failed to delete ${failures.length} of ${storageObjects.length} trash objects from storage`
      );
    }

    // Cascade deletion removes file and variant rows only after every object
    // delete has succeeded. The discard token protects a later trash cycle.
    const deleted = await prisma.deviation.deleteMany({
      where: {
        id: deviationId,
        userId,
        status: 'trashed',
        discardedAt: discardToken,
        purgeStartedAt: { not: null },
      },
    });

    if (deleted.count !== 1) {
      throw new Error(
        `Trash purge deleted storage objects but could not delete deviation ${deviationId}`
      );
    }

    logger.info('Trash purge completed', {
      deviationId,
      objectsDeleted: storageObjects.length,
      filesDeleted: files.length,
      deviationDeleted: true,
    });

    return {
      skipped: false,
      objectsDeleted: storageObjects.length,
      filesDeleted: files.length,
      deviationDeleted: true,
    };
  },
  { connection, concurrency: 2 }
);

export async function queueTrashPurge(data: TrashPurgeJobData): Promise<void> {
  const discardTime = new Date(data.discardedAt).getTime();
  if (Number.isNaN(discardTime)) throw new Error('Cannot enqueue trash purge without discardedAt');

  const jobId = `trash-purge-${data.deviationId}-${discardTime}`;
  const existing = await trashPurgeQueue.getJob(jobId);
  if (existing) {
    if ((await existing.getState()) === 'failed') await existing.retry();
    return;
  }

  await trashPurgeQueue.add('purge', data, { jobId });
}

trashPurgeWorker.on('failed', (job, error) => {
  if (job) StructuredLogger.createJobLogger(job).error('Trash purge job failed', error, job.data);
});
