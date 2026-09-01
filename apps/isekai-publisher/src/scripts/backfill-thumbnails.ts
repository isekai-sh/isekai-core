import 'dotenv/config';
import { prisma } from '@isekai/shared/db';
import { THUMBNAIL_VERSION } from '@isekai/shared/storage';

type ThumbnailQueueModule = typeof import('../lib/thumbnail-queue.js');
let thumbnailQueueModule: ThumbnailQueueModule | undefined;

async function getThumbnailQueueModule(): Promise<ThumbnailQueueModule> {
  thumbnailQueueModule ??= await import('../lib/thumbnail-queue.js');
  return thumbnailQueueModule;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dryRun =
  process.argv.includes('--dry-run') || process.env.THUMBNAIL_BACKFILL_DRY_RUN === 'true';
const fileId = argument('file-id') || process.env.THUMBNAIL_BACKFILL_FILE_ID || undefined;
const userId = argument('user-id') || process.env.THUMBNAIL_BACKFILL_USER_ID || undefined;
const maxFilesValue = argument('max-files') || process.env.THUMBNAIL_BACKFILL_MAX_FILES;
const maxFiles = maxFilesValue ? Math.max(1, parseInt(maxFilesValue, 10)) : undefined;
const pageSize = Math.max(1, parseInt(process.env.THUMBNAIL_BACKFILL_PAGE_SIZE || '250', 10));

const scope = {
  mimeType: { startsWith: 'image/' },
  thumbnailVersion: { lt: THUMBNAIL_VERSION },
  ...(fileId ? { id: fileId } : {}),
  ...(userId ? { deviation: { userId } } : {}),
};

async function getOrCreateRun() {
  const resumable = await prisma.thumbnailBackfillRun.findFirst({
    where: {
      targetVersion: THUMBNAIL_VERSION,
      status: { in: ['running', 'failed'] },
      filterFileId: fileId ?? null,
      filterUserId: userId ?? null,
      maxFiles: maxFiles ?? null,
    },
    orderBy: { startedAt: 'desc' },
  });
  if (resumable) {
    return prisma.thumbnailBackfillRun.update({
      where: { id: resumable.id },
      data: { status: 'running', lastError: null },
    });
  }

  const upperBound = await prisma.deviationFile.findFirst({
    where: scope,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true, id: true },
  });
  if (!upperBound) return null;

  return prisma.thumbnailBackfillRun.create({
    data: {
      targetVersion: THUMBNAIL_VERSION,
      upperBoundCreatedAt: upperBound.createdAt,
      upperBoundId: upperBound.id,
      filterFileId: fileId,
      filterUserId: userId,
      maxFiles,
    },
  });
}

async function previewBackfill(): Promise<void> {
  const files = await prisma.deviationFile.findMany({
    where: scope,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: maxFiles ?? pageSize,
    select: { id: true, originalFilename: true, mimeType: true, thumbnailStatus: true },
  });
  console.log('[Thumbnail backfill] Dry run; no rows changed and no jobs queued', {
    matched: files.length,
    fileId: fileId ?? null,
    userId: userId ?? null,
    maxFiles: maxFiles ?? null,
    files,
  });
}

async function runBackfill(): Promise<void> {
  if (dryRun) return previewBackfill();

  const { enqueueThumbnail } = await getThumbnailQueueModule();

  const run = await getOrCreateRun();
  if (!run) {
    console.log('[Thumbnail backfill] No matching image files found');
    return;
  }

  console.log('[Thumbnail backfill] Starting/resuming', {
    runId: run.id,
    fileId: run.filterFileId,
    userId: run.filterUserId,
    maxFiles: run.maxFiles,
  });
  let cursorCreatedAt = run.cursorCreatedAt;
  let cursorId = run.cursorId;
  let queuedByThisInvocation = 0;

  try {
    while (!maxFiles || run.queuedCount + queuedByThisInvocation < maxFiles) {
      const remaining = maxFiles
        ? Math.max(0, maxFiles - run.queuedCount - queuedByThisInvocation)
        : pageSize;
      const files = await prisma.deviationFile.findMany({
        where: {
          ...scope,
          AND: [
            {
              OR: [
                { createdAt: { lt: run.upperBoundCreatedAt } },
                { createdAt: run.upperBoundCreatedAt, id: { lte: run.upperBoundId } },
              ],
            },
            ...(cursorCreatedAt && cursorId
              ? [
                  {
                    OR: [
                      { createdAt: { gt: cursorCreatedAt } },
                      { createdAt: cursorCreatedAt, id: { gt: cursorId } },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: Math.min(pageSize, remaining),
        select: { id: true, createdAt: true },
      });

      if (files.length === 0) break;

      const ids = files.map((file) => file.id);
      await prisma.deviationFile.updateMany({
        where: { id: { in: ids }, thumbnailVersion: { lt: THUMBNAIL_VERSION } },
        data: {
          thumbnailStatus: 'pending',
          thumbnailError: null,
          thumbnailNextAttemptAt: null,
        },
      });
      for (const file of files) await enqueueThumbnail(file.id);

      const last = files[files.length - 1];
      cursorCreatedAt = last.createdAt;
      cursorId = last.id;
      queuedByThisInvocation += files.length;
      await prisma.thumbnailBackfillRun.update({
        where: { id: run.id },
        data: {
          cursorCreatedAt,
          cursorId,
          scannedCount: { increment: files.length },
          queuedCount: { increment: files.length },
        },
      });
      console.log('[Thumbnail backfill] Queued page', { runId: run.id, count: files.length });
    }

    await prisma.thumbnailBackfillRun.update({
      where: { id: run.id },
      data: { status: 'completed', completedAt: new Date(), lastError: null },
    });
    console.log('[Thumbnail backfill] Completed', { runId: run.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backfill error';
    await prisma.thumbnailBackfillRun.update({
      where: { id: run.id },
      data: { status: 'failed', lastError: message.slice(0, 2000) },
    });
    throw error;
  }
}

runBackfill()
  .catch((error) => {
    console.error('[Thumbnail backfill] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (thumbnailQueueModule) {
      await thumbnailQueueModule.thumbnailQueue.close();
      await thumbnailQueueModule.thumbnailRedis.quit();
    }
    await prisma.$disconnect();
  });
