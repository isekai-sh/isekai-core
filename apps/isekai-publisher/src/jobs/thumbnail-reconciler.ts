import { prisma } from '@isekai/shared/db';
import { THUMBNAIL_VERSION } from '@isekai/shared/storage';
import { enqueueThumbnail } from '../lib/thumbnail-queue.js';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_RECONCILER_ATTEMPTS = 10;
let timer: NodeJS.Timeout | undefined;
let running = false;

export async function reconcileThumbnails(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const files = await prisma.deviationFile.findMany({
      where: {
        mimeType: { startsWith: 'image/' },
        thumbnailVersion: { lt: THUMBNAIL_VERSION },
        thumbnailAttempts: { lt: MAX_RECONCILER_ATTEMPTS },
        OR: [
          { thumbnailStatus: 'pending' },
          { thumbnailStatus: 'failed', thumbnailNextAttemptAt: { lte: now } },
          { thumbnailStatus: 'processing', thumbnailLeaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: parseInt(process.env.THUMBNAIL_RECONCILE_BATCH_SIZE || `${DEFAULT_BATCH_SIZE}`, 10),
      select: { id: true },
    });

    let queued = 0;
    for (const file of files) {
      try {
        await enqueueThumbnail(file.id);
        queued += 1;
      } catch (error) {
        console.warn('[Thumbnails] Reconciler enqueue failed', {
          deviationFileId: file.id,
          error: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }
    return queued;
  } finally {
    running = false;
  }
}

export function startThumbnailReconciler(): void {
  const interval = parseInt(
    process.env.THUMBNAIL_RECONCILE_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
    10
  );
  void reconcileThumbnails().catch((error) =>
    console.error('[Thumbnails] Initial reconciliation failed', error)
  );
  timer = setInterval(
    () =>
      void reconcileThumbnails().catch((error) =>
        console.error('[Thumbnails] Reconciliation failed', error)
      ),
    interval
  );
  timer.unref();
}

export function stopThumbnailReconciler(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
