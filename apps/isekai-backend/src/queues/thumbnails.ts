import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  THUMBNAIL_QUEUE_NAME,
  THUMBNAIL_VERSION,
  type ThumbnailJobData,
} from '@isekai/shared/storage';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

export const thumbnailQueue = new Queue<ThumbnailJobData>(THUMBNAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
  },
});

export async function queueThumbnailGeneration(deviationFileId: string): Promise<void> {
  await thumbnailQueue.add(
    'generate-v1',
    { deviationFileId, targetVersion: THUMBNAIL_VERSION },
    { jobId: `thumbnail-${deviationFileId}-v${THUMBNAIL_VERSION}` }
  );
}

/**
 * Upload persistence is authoritative. Queue availability must never roll back or reject it;
 * the publisher reconciler will pick up any pending row that misses this fast path.
 */
export async function queueThumbnailGenerationNonFatal(deviationFileId: string): Promise<void> {
  try {
    await Promise.race([
      queueThumbnailGeneration(deviationFileId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('thumbnail enqueue timed out')), 1500)
      ),
    ]);
  } catch (error) {
    console.warn('[Thumbnails] Upload saved; deferred thumbnail enqueue to reconciler', {
      deviationFileId,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
