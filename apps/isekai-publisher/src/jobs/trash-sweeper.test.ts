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

const { findMany, queueTrashPurge, schedule } = vi.hoisted(() => ({
  findMany: vi.fn(),
  queueTrashPurge: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ prisma: { deviation: { findMany } } }));
vi.mock('../queues/trash-purge.js', () => ({ queueTrashPurge }));
vi.mock('node-cron', () => ({ default: { schedule } }));

import { startTrashSweeper, sweepExpiredTrash } from './trash-sweeper.js';

describe('trash sweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueTrashPurge.mockResolvedValue(undefined);
    delete process.env.DRAFT_TRASH_SWEEP_BATCH_SIZE;
  });

  it('selects only expired trash and queues an idempotent purge token', async () => {
    const now = new Date('2026-09-03T03:17:00.000Z');
    const discardedAt = new Date('2026-08-20T00:00:00.000Z');
    findMany.mockResolvedValue([{ id: 'dev-1', userId: 'user-1', discardedAt }]);

    await expect(sweepExpiredTrash(now)).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'trashed',
        discardedAt: { not: null },
        purgeAfter: { lte: now },
      },
      orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }],
      take: 1000,
      select: { id: true, userId: true, discardedAt: true },
    });
    expect(queueTrashPurge).toHaveBeenCalledWith({
      deviationId: 'dev-1',
      userId: 'user-1',
      discardedAt: discardedAt.toISOString(),
    });
  });

  it('continues queueing after one enqueue failure', async () => {
    const discardedAt = new Date();
    findMany.mockResolvedValue([
      { id: 'dev-1', userId: 'user-1', discardedAt },
      { id: 'dev-2', userId: 'user-1', discardedAt },
    ]);
    queueTrashPurge.mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce(undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sweepExpiredTrash()).resolves.toBe(1);
    expect(queueTrashPurge).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('registers one daily cron schedule', () => {
    startTrashSweeper();
    expect(schedule).toHaveBeenCalledWith('17 3 * * *', expect.any(Function));
  });
});
