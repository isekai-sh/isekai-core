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

import cron from 'node-cron';
import { prisma } from '../db/index.js';
import { queueTrashPurge } from '../queues/trash-purge.js';

const DEFAULT_BATCH_SIZE = 1000;
let running = false;

export async function sweepExpiredTrash(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;

  try {
    const expired = await prisma.deviation.findMany({
      where: {
        status: 'trashed',
        discardedAt: { not: null },
        purgeAfter: { lte: now },
      },
      orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }],
      take: parseInt(process.env.DRAFT_TRASH_SWEEP_BATCH_SIZE || `${DEFAULT_BATCH_SIZE}`, 10),
      select: { id: true, userId: true, discardedAt: true },
    });

    let queued = 0;
    for (const deviation of expired) {
      if (!deviation.discardedAt) continue;
      try {
        await queueTrashPurge({
          deviationId: deviation.id,
          userId: deviation.userId,
          discardedAt: deviation.discardedAt.toISOString(),
        });
        queued += 1;
      } catch (error) {
        console.error('[Trash Sweeper] Failed to enqueue purge', {
          deviationId: deviation.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return queued;
  } finally {
    running = false;
  }
}

export function startTrashSweeper(): void {
  cron.schedule('17 3 * * *', () => {
    void sweepExpiredTrash().catch((error) =>
      console.error('[Trash Sweeper] Daily sweep failed', error)
    );
  });
  console.log('[Trash Sweeper] Cron job started (runs daily at 03:17)');
}
