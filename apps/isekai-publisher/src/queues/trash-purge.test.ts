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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  workerOn: vi.fn(),
  deleteObject: vi.fn(),
  deviationUpdateMany: vi.fn(),
  deviationFindFirst: vi.fn(),
  deviationDeleteMany: vi.fn(),
  fileFindMany: vi.fn(),
  fileUpdateMany: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  processor: undefined as unknown as (job: any) => Promise<any>,
}));

vi.hoisted(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
});

vi.mock('bullmq', () => ({
  Queue: class {
    add = mocks.queueAdd;
    getJob = mocks.queueGetJob;
  },
  Worker: class {
    constructor(_name: string, handler: (job: any) => Promise<any>) {
      mocks.processor = handler;
    }
    on = mocks.workerOn;
  },
}));

vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { Redis: RedisMock };
});

vi.mock('@isekai/shared/storage', () => ({
  THUMBNAIL_VERSION: 1,
  THUMBNAIL_WIDTHS: [128, 256],
  generateThumbnailStorageKey: (key: string, width: number) => `${key}.thumb.${width}`,
  getS3ConfigFromEnv: vi.fn(() => ({})),
  createStorageService: vi.fn(() => ({ delete: mocks.deleteObject })),
}));

vi.mock('../db/index.js', () => ({
  prisma: {
    deviation: {
      updateMany: mocks.deviationUpdateMany,
      findFirst: mocks.deviationFindFirst,
      deleteMany: mocks.deviationDeleteMany,
    },
    deviationFile: {
      findMany: mocks.fileFindMany,
      updateMany: mocks.fileUpdateMany,
    },
  },
}));

vi.mock('../lib/structured-logger.js', () => ({
  StructuredLogger: {
    createJobLogger: () => ({
      info: mocks.loggerInfo,
      error: mocks.loggerError,
      debug: mocks.loggerDebug,
    }),
  },
}));

import { queueTrashPurge } from './trash-purge.js';

const discardedAt = '2026-09-01T00:00:00.000Z';
const job = { data: { deviationId: 'dev-1', userId: 'user-1', discardedAt } };
const files = [
  {
    id: 'file-1',
    storageKey: 'original.jpg',
    variants: [{ storageKey: 'variant.webp' }],
  },
];

describe('trash purge queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deviationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deviationFindFirst.mockResolvedValue(null);
    mocks.fileFindMany.mockResolvedValue(files);
    mocks.fileUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deviationDeleteMany.mockResolvedValue({ count: 1 });
    mocks.queueGetJob.mockResolvedValue(null);
  });

  it('claims first, deletes every storage object, then deletes the database row', async () => {
    await expect(mocks.processor(job)).resolves.toEqual({
      skipped: false,
      objectsDeleted: 4,
      filesDeleted: 1,
      deviationDeleted: true,
    });

    expect(mocks.deviationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'dev-1',
          userId: 'user-1',
          status: 'trashed',
          purgeStartedAt: null,
        }),
        data: expect.objectContaining({ purgeStartedAt: expect.any(Date) }),
      })
    );
    expect(mocks.deleteObject.mock.calls.map(([key]) => key).sort()).toEqual(
      ['original.jpg', 'original.jpg.thumb.128', 'original.jpg.thumb.256', 'variant.webp'].sort()
    );
    expect(mocks.deviationDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'trashed' }) })
    );
  });

  it('retains the claimed database row after partial storage failure and finishes on retry', async () => {
    mocks.deleteObject.mockRejectedValueOnce(new Error('temporary storage failure'));

    await expect(mocks.processor(job)).rejects.toThrow('Failed to delete 1 of 4 trash objects');
    expect(mocks.deviationDeleteMany).not.toHaveBeenCalled();

    mocks.deviationUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.deviationFindFirst.mockResolvedValueOnce({ id: 'dev-1' });
    mocks.deleteObject.mockResolvedValue(undefined);

    await expect(mocks.processor(job)).resolves.toMatchObject({ deviationDeleted: true });
    expect(mocks.deviationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ purgeStartedAt: { not: null } }) })
    );
  });

  it('skips a stale job when the draft was restored before the claim', async () => {
    mocks.deviationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.deviationFindFirst.mockResolvedValue(null);

    await expect(mocks.processor(job)).resolves.toEqual({
      skipped: true,
      objectsDeleted: 0,
      filesDeleted: 0,
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.deviationDeleteMany).not.toHaveBeenCalled();
  });

  it('fails the job if storage is gone but the guarded database delete misses', async () => {
    mocks.deviationDeleteMany.mockResolvedValue({ count: 0 });

    await expect(mocks.processor(job)).rejects.toThrow(
      'Trash purge deleted storage objects but could not delete deviation dev-1'
    );
  });

  it('retries an existing failed idempotent job instead of adding a duplicate', async () => {
    const retry = vi.fn();
    mocks.queueGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed'), retry });

    await queueTrashPurge(job.data);

    expect(retry).toHaveBeenCalledOnce();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('uses the discard cycle in a stable unique job ID', async () => {
    await queueTrashPurge(job.data);

    expect(mocks.queueAdd).toHaveBeenCalledWith('purge', job.data, {
      jobId: `trash-purge-dev-1-${new Date(discardedAt).getTime()}`,
    });
  });
});
