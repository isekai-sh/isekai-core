import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { processThumbnailJob, renderWebpThumbnail } from './thumbnail-processor.js';

const fixedNow = new Date('2026-08-31T04:00:00.000Z');

function imageFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    mimeType: 'image/png',
    storageKey: 'owner/deviations/user/source.png',
    thumbnailStatus: 'pending',
    thumbnailVersion: 0,
    thumbnailAttempts: 0,
    variants: [],
    ...overrides,
  };
}

function dependencies(file = imageFile()) {
  const database = {
    deviationFile: {
      findUnique: vi.fn().mockResolvedValue(file),
      findUniqueOrThrow: vi.fn().mockResolvedValue(file),
      update: vi.fn().mockResolvedValue(file),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
    },
    deviationFileVariant: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const storage = {
    download: vi.fn(),
    head: vi.fn().mockResolvedValue(null),
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    database,
    storage,
    deps: {
      database: database as any,
      storage: storage as any,
      now: () => fixedNow,
      leaseId: () => 'lease-1',
    },
  };
}

describe('thumbnail processor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a bounded WebP without enlarging the source', async () => {
    const original = await sharp({
      create: { width: 64, height: 32, channels: 3, background: '#ff00ff' },
    })
      .png()
      .toBuffer();
    const output = await renderWebpThumbnail(original, 400);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(32);
  });

  it('downloads once, creates all five immutable variants, and marks the file ready', async () => {
    const original = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#112233' },
    })
      .png()
      .toBuffer();
    const { database, storage, deps } = dependencies();
    storage.download.mockResolvedValue(original);

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).resolves.toEqual({ status: 'ready', variants: 5 });

    expect(storage.download).toHaveBeenCalledOnce();
    expect(storage.upload).toHaveBeenCalledTimes(5);
    expect(database.deviationFileVariant.upsert).toHaveBeenCalledTimes(5);
    for (const width of [128, 256, 400, 800, 1200]) {
      expect(storage.upload).toHaveBeenCalledWith(
        `owner/deviations/user/source.png.derivatives/thumb/v1/${width}.webp`,
        expect.any(Buffer),
        'image/webp',
        { cacheControl: 'public, max-age=31536000, immutable' }
      );
    }
    expect(database.deviationFile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1', thumbnailLeaseId: 'lease-1' },
        data: expect.objectContaining({ thumbnailStatus: 'ready', thumbnailVersion: 1 }),
      })
    );
  });

  it('marks non-image files skipped without touching storage', async () => {
    const file = imageFile({ mimeType: 'video/mp4' });
    const { database, storage, deps } = dependencies(file);

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).resolves.toEqual({ status: 'skipped', variants: 0 });

    expect(database.deviationFile.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: {
        thumbnailStatus: 'skipped',
        thumbnailVersion: 1,
        thumbnailUpdatedAt: fixedNow,
        thumbnailError: null,
      },
    });
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('returns immediately when the requested version is already ready', async () => {
    const { database, storage, deps } = dependencies(
      imageFile({ thumbnailStatus: 'ready', thumbnailVersion: 1 })
    );

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).resolves.toEqual({ status: 'ready', variants: 5 });

    expect(database.deviationFile.updateMany).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('ignores a job when another worker owns the lease', async () => {
    const { database, storage, deps } = dependencies();
    database.deviationFile.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).resolves.toEqual({ status: 'ignored', variants: 0 });

    expect(storage.download).not.toHaveBeenCalled();
  });

  it('records failure state and exponential retry time', async () => {
    const { database, storage, deps } = dependencies(imageFile({ thumbnailAttempts: 2 }));
    storage.download.mockRejectedValue(new Error('storage temporarily unavailable'));

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).rejects.toThrow('storage temporarily unavailable');

    expect(database.deviationFile.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'file-1', thumbnailLeaseId: 'lease-1' },
      data: {
        thumbnailStatus: 'failed',
        thumbnailError: 'storage temporarily unavailable',
        thumbnailUpdatedAt: fixedNow,
        thumbnailNextAttemptAt: new Date('2026-08-31T04:00:20.000Z'),
        thumbnailLeaseId: null,
        thumbnailLeaseExpiresAt: null,
      },
    });
  });

  it('compensates every uploaded derivative when the final lease check is lost', async () => {
    const original = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#abcdef' },
    })
      .png()
      .toBuffer();
    const { database, storage, deps } = dependencies();
    storage.download.mockResolvedValue(original);
    database.deviationFile.updateMany.mockImplementation(async (args: any) => ({
      count: args.data?.thumbnailStatus === 'ready' ? 0 : 1,
    }));

    await expect(
      processThumbnailJob({ deviationFileId: 'file-1', targetVersion: 1 }, deps)
    ).rejects.toThrow('Thumbnail generation lease was lost');

    expect(storage.upload).toHaveBeenCalledTimes(5);
    expect(storage.delete).toHaveBeenCalledTimes(5);
    expect(storage.delete).toHaveBeenCalledWith(
      'owner/deviations/user/source.png.derivatives/thumb/v1/1200.webp'
    );
  });
});
