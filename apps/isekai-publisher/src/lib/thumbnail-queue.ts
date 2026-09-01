import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  THUMBNAIL_QUEUE_NAME,
  THUMBNAIL_VERSION,
  type ThumbnailJobData,
} from '@isekai/shared/storage';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const thumbnailRedis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

export const thumbnailQueue = new Queue<ThumbnailJobData>(THUMBNAIL_QUEUE_NAME, {
  connection: thumbnailRedis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
  },
});

export function thumbnailJobId(deviationFileId: string, version = THUMBNAIL_VERSION): string {
  return `thumbnail-${deviationFileId}-v${version}`;
}

export async function enqueueThumbnail(deviationFileId: string, targetVersion = THUMBNAIL_VERSION) {
  const jobId = thumbnailJobId(deviationFileId, targetVersion);
  const existing = await thumbnailQueue.getJob(jobId);
  if (existing && (await existing.getState()) === 'failed') {
    await existing.remove();
  }
  await thumbnailQueue.add('generate-v1', { deviationFileId, targetVersion }, { jobId });
}
