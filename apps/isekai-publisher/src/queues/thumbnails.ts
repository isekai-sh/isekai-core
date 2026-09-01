import { Job, Worker } from 'bullmq';
import { THUMBNAIL_QUEUE_NAME, type ThumbnailJobData } from '@isekai/shared/storage';
import { processThumbnailJob } from '../lib/thumbnail-processor.js';
import { thumbnailRedis } from '../lib/thumbnail-queue.js';

export { enqueueThumbnail, thumbnailJobId, thumbnailQueue } from '../lib/thumbnail-queue.js';

export const thumbnailWorker = new Worker<ThumbnailJobData>(
  THUMBNAIL_QUEUE_NAME,
  async (job: Job<ThumbnailJobData>) => processThumbnailJob(job.data),
  {
    connection: thumbnailRedis,
    concurrency: Math.max(1, parseInt(process.env.THUMBNAIL_CONCURRENCY || '1', 10)),
  }
);

thumbnailWorker.on('completed', (job, result) => {
  console.log('[Thumbnails] completed', { jobId: job.id, ...result });
});
thumbnailWorker.on('failed', (job, error) => {
  console.error('[Thumbnails] failed', {
    jobId: job?.id,
    deviationFileId: job?.data.deviationFileId,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });
});
thumbnailWorker.on('stalled', (jobId) => console.warn('[Thumbnails] stalled', { jobId }));
