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
import { createMockRequest, createMockResponse } from '../test-helpers/express-mock.js';

const { deviation, deviationFile, transaction } = vi.hoisted(() => {
  const deviationMock = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  };
  const deviationFileMock = { updateMany: vi.fn() };
  return {
    deviation: deviationMock,
    deviationFile: deviationFileMock,
    transaction: vi.fn((callback) =>
      callback({ deviation: deviationMock, deviationFile: deviationFileMock })
    ),
  };
});

vi.mock('../db/index.js', () => ({
  prisma: { deviation, deviationFile, $transaction: transaction },
}));
vi.mock('../lib/env.js', () => ({ env: { DRAFT_TRASH_RETENTION_DAYS: 7 } }));
vi.mock('@isekai/shared/storage', () => ({ THUMBNAIL_VERSION: 1 }));
vi.mock('../lib/deviation-files.js', () => ({
  serializeDeviationFiles: vi.fn((files) => files ?? []),
}));

import { curationRouter } from './curation.js';

const NOW = new Date('2026-09-03T04:00:00.000Z');
const baseDeviation = {
  id: 'draft-1',
  userId: 'user-1',
  status: 'draft',
  ingestSource: 'direct_to_draft',
  curationStatus: null,
  curatedAt: null,
  discardedAt: null,
  purgeAfter: null,
  purgeStartedAt: null,
  scheduledAt: null,
  actualPublishAt: null,
  publishedAt: null,
  lastRetryAt: null,
  executionLockId: null,
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  files: [],
};

async function callRoute(method: string, path: string, req: unknown, res: unknown) {
  const layer = (curationRouter as any).stack.find(
    (item: any) => item.route?.path === path && item.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Route not found: ${method} ${path}`);
  return layer.route.stack.at(-1).handle(req, res);
}

describe('curation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    deviation.findFirst.mockResolvedValue(baseDeviation);
    deviation.updateMany.mockResolvedValue({ count: 1 });
    deviationFile.updateMany.mockResolvedValue({ count: 1 });
  });

  it('lists only explicit, unlocked direct-to-draft uncurated rows by default', async () => {
    deviation.findMany.mockResolvedValue([baseDeviation]);
    deviation.count.mockResolvedValue(1);
    const res = createMockResponse();

    await callRoute('GET', '/', createMockRequest({ user: { id: 'user-1' }, query: {} }), res);

    expect(deviation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: 'draft',
          scheduledAt: null,
          executionLockId: null,
          OR: [
            { curationStatus: 'uncurated' },
            {
              curationStatus: null,
              ingestSource: 'direct_to_draft',
              curatedAt: null,
            },
          ],
        },
      })
    );
    expect(res.json).toHaveBeenCalledWith({ deviations: [expect.any(Object)], total: 1 });
  });

  it('treats legacy null-source drafts as curated without rewriting them', async () => {
    deviation.findMany.mockResolvedValue([]);
    deviation.count.mockResolvedValue(0);

    await callRoute(
      'GET',
      '/',
      createMockRequest({ user: { id: 'user-1' }, query: { scope: 'curated' } }),
      createMockResponse()
    );

    expect(deviation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { curationStatus: 'curated' },
            expect.objectContaining({ AND: expect.any(Array) }),
          ]),
        }),
      })
    );
  });

  it('lists only the current user trash, newest discard first', async () => {
    deviation.findMany.mockResolvedValue([]);
    deviation.count.mockResolvedValue(0);

    await callRoute(
      'GET',
      '/trash',
      createMockRequest({ user: { id: 'user-1' }, query: { page: '2', limit: '10' } }),
      createMockResponse()
    );

    expect(deviation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'trashed' },
      orderBy: [{ discardedAt: 'desc' }, { id: 'desc' }],
      take: 10,
      skip: 10,
      include: { files: { include: { variants: true } } },
    });
  });

  it('keeps an unlocked draft by persisting curatedAt without changing status', async () => {
    const res = createMockResponse();
    await callRoute(
      'POST',
      '/:id/keep',
      createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
      res
    );

    expect(deviation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionLockId: null,
      },
      data: { curationStatus: 'curated', curatedAt: NOW, updatedAt: NOW },
    });
    expect(res.json).toHaveBeenCalledWith({ deviation: expect.any(Object) });
  });

  it('undoes Keep by recording an explicit uncurated state without changing provenance', async () => {
    deviation.findFirst.mockResolvedValue({ ...baseDeviation, curatedAt: NOW });

    await callRoute(
      'POST',
      '/:id/uncurate',
      createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
      createMockResponse()
    );

    expect(deviation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ ingestSource: expect.anything() }),
        data: { curationStatus: 'uncurated', curatedAt: null, updatedAt: NOW },
      })
    );
  });

  it('marks selected owned drafts uncurated in one guarded bulk update', async () => {
    const res = createMockResponse();

    await callRoute(
      'POST',
      '/batch-state',
      createMockRequest({
        user: { id: 'user-1' },
        body: { selection: 'ids', state: 'uncurated', deviationIds: ['one', 'two', 'two'] },
      }),
      res
    );

    expect(deviation.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionLockId: null,
        id: { in: ['one', 'two'] },
      },
      data: { curationStatus: 'uncurated', curatedAt: null, updatedAt: NOW },
    });
    expect(res.json).toHaveBeenCalledWith({ updatedCount: 1, state: 'uncurated' });
  });

  it('marks every draft in the authenticated users current filter', async () => {
    await callRoute(
      'POST',
      '/batch-state',
      createMockRequest({
        user: { id: 'user-1' },
        body: { selection: 'filter', state: 'uncurated', scope: 'curated' },
      }),
      createMockResponse()
    );

    expect(deviation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'draft',
          OR: expect.any(Array),
        }),
        data: expect.objectContaining({ curationStatus: 'uncurated', curatedAt: null }),
      })
    );
  });

  it('discards atomically, sets retention, and stops all retryable thumbnail work', async () => {
    deviation.findFirst.mockResolvedValueOnce(baseDeviation).mockResolvedValueOnce({
      ...baseDeviation,
      status: 'trashed',
      discardedAt: NOW,
      purgeAfter: new Date('2026-09-10T04:00:00.000Z'),
    });

    await callRoute(
      'POST',
      '/:id/discard',
      createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
      createMockResponse()
    );

    expect(deviation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-1',
        userId: 'user-1',
        status: 'draft',
        scheduledAt: null,
        executionLockId: null,
      },
      data: expect.objectContaining({
        status: 'trashed',
        discardedAt: NOW,
        purgeAfter: new Date('2026-09-10T04:00:00.000Z'),
        purgeStartedAt: null,
      }),
    });
    expect(deviationFile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deviationId: 'draft-1',
          thumbnailStatus: { in: ['pending', 'processing', 'failed'] },
        },
      })
    );
  });

  it('loses cleanly to a concurrent scheduler claim', async () => {
    deviation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      callRoute(
        'POST',
        '/:id/discard',
        createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
        createMockResponse()
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(deviationFile.updateMany).not.toHaveBeenCalled();
  });

  it('does not disclose or mutate another users deviation', async () => {
    deviation.findFirst.mockResolvedValue(null);

    await expect(
      callRoute(
        'POST',
        '/:id/keep',
        createMockRequest({ user: { id: 'user-1' }, params: { id: 'other-user-draft' } }),
        createMockResponse()
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(deviation.updateMany).not.toHaveBeenCalled();
  });

  it('restores trash only before the purge claim and restarts stopped thumbnail work', async () => {
    deviation.findFirst
      .mockResolvedValueOnce({ ...baseDeviation, status: 'trashed' })
      .mockResolvedValueOnce(baseDeviation);

    await callRoute(
      'POST',
      '/:id/restore',
      createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
      createMockResponse()
    );

    expect(deviation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-1', userId: 'user-1', status: 'trashed', purgeStartedAt: null },
        data: expect.objectContaining({
          status: 'draft',
          discardedAt: null,
          purgeAfter: null,
        }),
      })
    );
    expect(deviationFile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mimeType: { startsWith: 'image/' },
          thumbnailStatus: 'skipped',
          thumbnailVersion: { lt: 1 },
        }),
      })
    );
  });

  it('refuses restore after permanent deletion has started', async () => {
    deviation.findFirst.mockResolvedValue({
      ...baseDeviation,
      status: 'trashed',
      purgeStartedAt: NOW,
    });

    await expect(
      callRoute(
        'POST',
        '/:id/restore',
        createMockRequest({ user: { id: 'user-1' }, params: { id: 'draft-1' } }),
        createMockResponse()
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(deviation.updateMany).not.toHaveBeenCalled();
  });
});
