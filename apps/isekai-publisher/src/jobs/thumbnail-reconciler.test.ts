import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, enqueueThumbnail } = vi.hoisted(() => ({
  findMany: vi.fn(),
  enqueueThumbnail: vi.fn(),
}));

vi.mock('@isekai/shared/db', () => ({
  prisma: { deviationFile: { findMany } },
}));
vi.mock('@isekai/shared/storage', () => ({ THUMBNAIL_VERSION: 1 }));
vi.mock('../lib/thumbnail-queue.js', () => ({ enqueueThumbnail }));

import { reconcileThumbnails } from './thumbnail-reconciler.js';

describe('thumbnail reconciler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueThumbnail.mockResolvedValue(undefined);
    delete process.env.THUMBNAIL_RECONCILE_BATCH_SIZE;
  });

  it('selects only eligible pending, due failed, and stale processing image rows', async () => {
    const now = new Date('2026-08-31T05:00:00.000Z');
    findMany.mockResolvedValue([{ id: 'pending' }, { id: 'failed' }, { id: 'stale' }]);

    await expect(reconcileThumbnails(now)).resolves.toBe(3);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        mimeType: { startsWith: 'image/' },
        thumbnailVersion: { lt: 1 },
        thumbnailAttempts: { lt: 10 },
        OR: [
          { thumbnailStatus: 'pending' },
          { thumbnailStatus: 'failed', thumbnailNextAttemptAt: { lte: now } },
          { thumbnailStatus: 'processing', thumbnailLeaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true },
    });
    expect(enqueueThumbnail.mock.calls.map(([id]) => id)).toEqual(['pending', 'failed', 'stale']);
  });

  it('continues after one enqueue failure and counts only successful jobs', async () => {
    findMany.mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }]);
    enqueueThumbnail
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValueOnce(undefined);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(reconcileThumbnails()).resolves.toBe(1);
    expect(enqueueThumbnail).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith(
      '[Thumbnails] Reconciler enqueue failed',
      expect.objectContaining({ deviationFileId: 'file-1', error: 'redis unavailable' })
    );
    warning.mockRestore();
  });
});
