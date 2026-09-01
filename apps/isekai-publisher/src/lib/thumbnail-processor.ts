import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '@isekai/shared/db';
import {
  createStorageService,
  generateThumbnailStorageKey,
  getS3ConfigFromEnv,
  isThumbnailMimeType,
  THUMBNAIL_WIDTHS,
  type StorageService,
  type ThumbnailJobData,
} from '@isekai/shared/storage';

const LEASE_MS = 15 * 60 * 1000;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MAX_ERROR_LENGTH = 2000;

// Keep native Sharp memory and CPU bounded inside the isolated media-worker
// container. Values remain configurable for larger self-hosted deployments.
sharp.concurrency(Math.max(1, parseInt(process.env.THUMBNAIL_SHARP_CONCURRENCY || '1', 10)));
sharp.cache({
  memory: Math.max(0, parseInt(process.env.THUMBNAIL_SHARP_CACHE_MB || '64', 10)),
  files: 0,
  items: 32,
});

export interface ThumbnailProcessorDependencies {
  database: typeof prisma;
  storage: StorageService;
  now: () => Date;
  leaseId: () => string;
}

function defaultDependencies(): ThumbnailProcessorDependencies {
  return {
    database: prisma,
    storage: createStorageService(getS3ConfigFromEnv()),
    now: () => new Date(),
    leaseId: randomUUID,
  };
}

export async function renderWebpThumbnail(input: Buffer, width: number): Promise<Buffer> {
  return sharp(input, { animated: false, limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function processThumbnailJob(
  job: ThumbnailJobData,
  dependencyOverrides?: ThumbnailProcessorDependencies
): Promise<{ status: 'ready' | 'skipped' | 'ignored'; variants: number }> {
  const dependencies = dependencyOverrides ?? defaultDependencies();
  const { database, storage, now, leaseId: createLeaseId } = dependencies;
  const uploadedKeys: string[] = [];
  const initial = await database.deviationFile.findUnique({
    where: { id: job.deviationFileId },
  });

  if (!initial) return { status: 'ignored', variants: 0 };

  if (!isThumbnailMimeType(initial.mimeType)) {
    await database.deviationFile.update({
      where: { id: initial.id },
      data: {
        thumbnailStatus: 'skipped',
        thumbnailVersion: job.targetVersion,
        thumbnailUpdatedAt: now(),
        thumbnailError: null,
      },
    });
    return { status: 'skipped', variants: 0 };
  }

  if (initial.thumbnailStatus === 'ready' && initial.thumbnailVersion >= job.targetVersion) {
    return { status: 'ready', variants: THUMBNAIL_WIDTHS.length };
  }

  const leaseId = createLeaseId();
  const claimedAt = now();
  const claimed = await database.deviationFile.updateMany({
    where: {
      id: initial.id,
      OR: [
        { thumbnailStatus: { in: ['pending', 'failed'] } },
        { thumbnailStatus: 'processing', thumbnailLeaseExpiresAt: { lt: claimedAt } },
      ],
    },
    data: {
      thumbnailStatus: 'processing',
      thumbnailLeaseId: leaseId,
      thumbnailLeaseExpiresAt: new Date(claimedAt.getTime() + LEASE_MS),
      thumbnailUpdatedAt: claimedAt,
      thumbnailNextAttemptAt: null,
      thumbnailError: null,
      thumbnailAttempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) return { status: 'ignored', variants: 0 };

  try {
    const file = await database.deviationFile.findUniqueOrThrow({
      where: { id: initial.id },
      include: { variants: true },
    });
    const original = await storage.download(file.storageKey);
    let generated = 0;

    for (const requestedWidth of THUMBNAIL_WIDTHS) {
      const leaseExtended = await database.deviationFile.updateMany({
        where: { id: file.id, thumbnailLeaseId: leaseId },
        data: { thumbnailLeaseExpiresAt: new Date(now().getTime() + LEASE_MS) },
      });
      if (leaseExtended.count !== 1) throw new Error('Thumbnail generation lease was lost');

      const storageKey = generateThumbnailStorageKey(
        file.storageKey,
        requestedWidth,
        job.targetVersion
      );
      const existing = file.variants.find(
        (variant) =>
          variant.kind === 'thumbnail' &&
          variant.version === job.targetVersion &&
          variant.width === requestedWidth &&
          variant.format === 'webp'
      );

      if (existing && (await storage.head(existing.storageKey))) {
        generated += 1;
        continue;
      }

      const output = await renderWebpThumbnail(original, requestedWidth);
      const metadata = await sharp(output).metadata();
      await storage.upload(storageKey, output, 'image/webp', { cacheControl: CACHE_CONTROL });
      uploadedKeys.push(storageKey);

      const leaseStillHeld = await database.deviationFile.count({
        where: { id: file.id, thumbnailLeaseId: leaseId },
      });
      if (leaseStillHeld !== 1) {
        await storage.delete(storageKey);
        uploadedKeys.pop();
        throw new Error('Thumbnail generation lease was lost during upload');
      }
      await database.deviationFileVariant.upsert({
        where: {
          deviationFileId_kind_version_width_format: {
            deviationFileId: file.id,
            kind: 'thumbnail',
            version: job.targetVersion,
            width: requestedWidth,
            format: 'webp',
          },
        },
        create: {
          deviationFileId: file.id,
          kind: 'thumbnail',
          version: job.targetVersion,
          width: requestedWidth,
          height: metadata.height ?? 0,
          format: 'webp',
          storageKey,
          fileSize: output.length,
        },
        update: {
          height: metadata.height ?? 0,
          storageKey,
          fileSize: output.length,
        },
      });
      generated += 1;
    }

    const completed = await database.deviationFile.updateMany({
      where: { id: file.id, thumbnailLeaseId: leaseId },
      data: {
        thumbnailStatus: 'ready',
        thumbnailVersion: job.targetVersion,
        thumbnailError: null,
        thumbnailUpdatedAt: now(),
        thumbnailNextAttemptAt: null,
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
      },
    });
    if (completed.count !== 1) throw new Error('Thumbnail generation lease was lost');

    return { status: 'ready', variants: generated };
  } catch (error) {
    if (uploadedKeys.length > 0) {
      const cleanup = await Promise.allSettled(uploadedKeys.map((key) => storage.delete(key)));
      const failedCleanup = cleanup.filter((result) => result.status === 'rejected').length;
      if (failedCleanup > 0) {
        console.error('[Thumbnails] Failed to compensate uploaded derivatives', {
          deviationFileId: initial.id,
          failedCleanup,
        });
      }
    }
    const message = error instanceof Error ? error.message : 'Unknown thumbnail generation error';
    const attempts = initial.thumbnailAttempts + 1;
    const retryDelayMs = Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
    await database.deviationFile.updateMany({
      where: { id: initial.id, thumbnailLeaseId: leaseId },
      data: {
        thumbnailStatus: 'failed',
        thumbnailError: message.slice(0, MAX_ERROR_LENGTH),
        thumbnailUpdatedAt: now(),
        thumbnailNextAttemptAt: new Date(now().getTime() + retryDelayMs),
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
      },
    });
    throw error;
  }
}
