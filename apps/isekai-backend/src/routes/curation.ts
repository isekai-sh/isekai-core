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

import { Router } from 'express';
import { z } from 'zod';
import { THUMBNAIL_VERSION } from '@isekai/shared/storage';
import { prisma } from '../db/index.js';
import { env } from '../lib/env.js';
import { serializeDeviationFiles } from '../lib/deviation-files.js';
import { curationScopeFilter, type CurationScope } from '../lib/curation-status.js';
import { AppError } from '../middleware/error.js';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  scope: z.enum(['uncurated', 'curated', 'all']).default('uncurated'),
});

const trashQuerySchema = listQuerySchema.pick({ page: true, limit: true });
const batchStateSchema = z.union([
  z.object({
    selection: z.literal('ids'),
    state: z.enum(['uncurated', 'curated']),
    deviationIds: z.array(z.string().min(1)).min(1).max(5000),
  }),
  z.object({
    selection: z.literal('filter'),
    state: z.enum(['uncurated', 'curated']),
    scope: z.enum(['uncurated', 'curated', 'all']),
  }),
]);

type BatchStateRequest =
  | { selection: 'ids'; state: 'uncurated' | 'curated'; deviationIds: string[] }
  | { selection: 'filter'; state: 'uncurated' | 'curated'; scope: CurationScope };

type DeviationWithFiles = Awaited<ReturnType<typeof findOwnedDeviation>>;

function serializeDeviation(deviation: NonNullable<DeviationWithFiles>) {
  return {
    ...deviation,
    files: serializeDeviationFiles(deviation.files),
    scheduledAt: deviation.scheduledAt?.toISOString() ?? null,
    actualPublishAt: deviation.actualPublishAt?.toISOString() ?? null,
    publishedAt: deviation.publishedAt?.toISOString() ?? null,
    lastRetryAt: deviation.lastRetryAt?.toISOString() ?? null,
    curatedAt: deviation.curatedAt?.toISOString() ?? null,
    discardedAt: deviation.discardedAt?.toISOString() ?? null,
    purgeAfter: deviation.purgeAfter?.toISOString() ?? null,
    purgeStartedAt: deviation.purgeStartedAt?.toISOString() ?? null,
    createdAt: deviation.createdAt.toISOString(),
    updatedAt: deviation.updatedAt.toISOString(),
  };
}

async function findOwnedDeviation(id: string, userId: string) {
  return prisma.deviation.findFirst({
    where: { id, userId },
    include: { files: { include: { variants: true } } },
  });
}

async function requireOwnedDeviation(id: string, userId: string) {
  const deviation = await findOwnedDeviation(id, userId);
  if (!deviation) throw new AppError(404, 'Deviation not found');
  return deviation;
}

// Keep this route before /:id-style action routes so "trash" is never parsed as an ID.
router.get('/trash', async (req, res) => {
  const userId = req.user!.id;
  const { page, limit } = trashQuerySchema.parse(req.query);
  const where = { userId, status: 'trashed' as const };

  const [deviations, total] = await Promise.all([
    prisma.deviation.findMany({
      where,
      orderBy: [{ discardedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: { files: { include: { variants: true } } },
    }),
    prisma.deviation.count({ where }),
  ]);

  res.json({ deviations: deviations.map(serializeDeviation), total });
});

router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const { page, limit, scope } = listQuerySchema.parse(req.query);

  const where = {
    userId,
    status: 'draft' as const,
    scheduledAt: null,
    executionLockId: null,
    ...curationScopeFilter(scope),
  };

  const [deviations, total] = await Promise.all([
    prisma.deviation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: (page - 1) * limit,
      include: { files: { include: { variants: true } } },
    }),
    prisma.deviation.count({ where }),
  ]);

  res.json({ deviations: deviations.map(serializeDeviation), total });
});

router.post('/batch-state', async (req, res) => {
  const userId = req.user!.id;
  const data = batchStateSchema.parse(req.body) as BatchStateRequest;
  const now = new Date();
  const selection =
    data.selection === 'ids'
      ? { id: { in: [...new Set(data.deviationIds)] } }
      : curationScopeFilter(data.scope);

  const result = await prisma.deviation.updateMany({
    where: {
      userId,
      status: 'draft',
      scheduledAt: null,
      executionLockId: null,
      ...selection,
    },
    data: {
      curationStatus: data.state,
      curatedAt: data.state === 'curated' ? now : null,
      updatedAt: now,
    },
  });

  res.json({ updatedCount: result.count, state: data.state });
});

router.post('/:id/keep', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const existing = await requireOwnedDeviation(id, userId);

  if (existing.status !== 'draft') {
    throw new AppError(409, 'Only drafts can be curated');
  }

  const now = new Date();
  const result = await prisma.deviation.updateMany({
    where: { id, userId, status: 'draft', scheduledAt: null, executionLockId: null },
    data: { curationStatus: 'curated', curatedAt: now, updatedAt: now },
  });

  if (result.count === 0) {
    throw new AppError(409, 'This draft is already being scheduled');
  }

  const deviation = await requireOwnedDeviation(id, userId);
  res.json({ deviation: serializeDeviation(deviation) });
});

router.post('/:id/uncurate', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const existing = await requireOwnedDeviation(id, userId);

  if (existing.status !== 'draft') {
    throw new AppError(409, 'Only drafts can be marked uncurated');
  }

  const now = new Date();
  const result = await prisma.deviation.updateMany({
    where: {
      id,
      userId,
      status: 'draft',
      scheduledAt: null,
      executionLockId: null,
    },
    data: { curationStatus: 'uncurated', curatedAt: null, updatedAt: now },
  });

  if (result.count === 0) {
    throw new AppError(409, 'This draft is already being scheduled or published');
  }

  const deviation = await requireOwnedDeviation(id, userId);
  res.json({ deviation: serializeDeviation(deviation) });
});

router.post('/:id/discard', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const existing = await requireOwnedDeviation(id, userId);

  if (existing.status !== 'draft') {
    throw new AppError(409, 'Only drafts can be discarded');
  }

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + env.DRAFT_TRASH_RETENTION_DAYS * DAY_MS);
  const result = await prisma.$transaction(async (tx) => {
    const discarded = await tx.deviation.updateMany({
      // This condition deliberately mirrors scheduler eligibility. Whichever action
      // wins first makes the other action fail without touching execution locks.
      where: {
        id,
        userId,
        status: 'draft',
        scheduledAt: null,
        executionLockId: null,
      },
      data: {
        status: 'trashed',
        discardedAt: now,
        purgeAfter,
        purgeStartedAt: null,
        updatedAt: now,
      },
    });

    if (discarded.count > 0) {
      // Stop pending work and revoke an active media lease in the same transaction.
      // Ready thumbnails stay ready and are available if the user restores the draft.
      await tx.deviationFile.updateMany({
        where: {
          deviationId: id,
          thumbnailStatus: { in: ['pending', 'processing', 'failed'] },
        },
        data: {
          thumbnailStatus: 'skipped',
          thumbnailLeaseId: null,
          thumbnailLeaseExpiresAt: null,
          thumbnailUpdatedAt: now,
        },
      });
    }

    return discarded;
  });

  if (result.count === 0) {
    throw new AppError(409, 'This draft is already being scheduled');
  }

  const deviation = await requireOwnedDeviation(id, userId);
  res.json({ deviation: serializeDeviation(deviation) });
});

router.post('/:id/restore', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const existing = await requireOwnedDeviation(id, userId);

  if (existing.status !== 'trashed') {
    throw new AppError(409, 'Only trashed drafts can be restored');
  }
  if (existing.purgeStartedAt) {
    throw new AppError(409, 'This draft is already being permanently deleted');
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const restored = await tx.deviation.updateMany({
      where: { id, userId, status: 'trashed', purgeStartedAt: null },
      data: {
        status: 'draft',
        discardedAt: null,
        purgeAfter: null,
        purgeStartedAt: null,
        updatedAt: now,
      },
    });

    if (restored.count > 0) {
      // The thumbnail reconciler will safely requeue image work stopped by discard.
      await tx.deviationFile.updateMany({
        where: {
          deviationId: id,
          mimeType: { startsWith: 'image/' },
          thumbnailStatus: 'skipped',
          thumbnailVersion: { lt: THUMBNAIL_VERSION },
        },
        data: {
          thumbnailStatus: 'pending',
          thumbnailUpdatedAt: now,
          thumbnailNextAttemptAt: null,
        },
      });
    }

    return restored;
  });

  if (result.count === 0) {
    throw new AppError(409, 'This draft is already being permanently deleted');
  }

  const deviation = await requireOwnedDeviation(id, userId);
  res.json({ deviation: serializeDeviation(deviation) });
});

export { router as curationRouter };
