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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Router } from 'express';
import { prisma } from '../db/index.js';
import { AppError } from '../middleware/error.js';
import { deleteFromStorage } from '../lib/upload-service.js';

const router = Router();

// Get all deviations in review status
router.get('/', async (req, res) => {
  const user = req.user!;
  const { page = '1', limit = '20' } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const offset = (pageNum - 1) * limitNum;

  const reviewDeviations = await prisma.deviation.findMany({
    where: {
      userId: user.id,
      status: 'review',
    },
    orderBy: { createdAt: 'desc' },
    take: limitNum,
    skip: offset,
    include: {
      files: true,
    },
  });

  // Count total for pagination
  const total = await prisma.deviation.count({
    where: {
      userId: user.id,
      status: 'review',
    },
  });

  const transformed = reviewDeviations.map((deviation) => ({
    ...deviation,
    files: deviation.files || [],
    scheduledAt: deviation.scheduledAt?.toISOString() ?? null,
    actualPublishAt: deviation.actualPublishAt?.toISOString() ?? null,
    publishedAt: deviation.publishedAt?.toISOString() ?? null,
    lastRetryAt: deviation.lastRetryAt?.toISOString() ?? null,
    createdAt: deviation.createdAt.toISOString(),
    updatedAt: deviation.updatedAt.toISOString(),
  }));

  res.json({ deviations: transformed, total });
});

// Approve single deviation (move to draft)
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const deviation = await prisma.deviation.findFirst({
    where: {
      id,
      userId: user.id,
      status: 'review',
    },
  });

  if (!deviation) {
    throw new AppError(404, 'Review deviation not found');
  }

  const updated = await prisma.deviation.update({
    where: { id },
    data: {
      status: 'draft',
      updatedAt: new Date(),
    },
  });

  res.json({
    ...updated,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
    actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
    lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Reject single deviation (delete)
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const deviation = await prisma.deviation.findFirst({
    where: {
      id,
      userId: user.id,
      status: 'review',
    },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, 'Review deviation not found');
  }

  // Delete files from storage
  if (deviation.files && deviation.files.length > 0) {
    await Promise.allSettled(deviation.files.map((file) => deleteFromStorage(file.storageKey)));
  }

  // Delete deviation (cascade deletes files)
  await prisma.deviation.delete({ where: { id } });

  res.status(204).send();
});

// Batch approve deviations
router.post('/batch-approve', async (req, res) => {
  const { deviationIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, 'deviationIds array is required');
  }

  // Fetch review deviations only
  const reviewDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: 'review',
    },
  });

  if (reviewDeviations.length !== deviationIds.length) {
    throw new AppError(400, 'Can only approve review deviations you own');
  }

  // Update all to draft
  await prisma.deviation.updateMany({
    where: { id: { in: deviationIds } },
    data: {
      status: 'draft',
      updatedAt: new Date(),
    },
  });

  res.json({ success: true, approvedCount: reviewDeviations.length });
});

// Batch reject deviations
router.post('/batch-reject', async (req, res) => {
  const { deviationIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, 'deviationIds array is required');
  }

  // Fetch review deviations only
  const reviewDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: 'review',
    },
    include: { files: true },
  });

  if (reviewDeviations.length !== deviationIds.length) {
    throw new AppError(400, 'Can only reject review deviations you own');
  }

  // Delete files from storage
  const allFiles = reviewDeviations.flatMap((d) => d.files);
  await Promise.allSettled(allFiles.map((file) => deleteFromStorage(file.storageKey)));

  // Delete deviations
  await prisma.deviation.deleteMany({
    where: { id: { in: deviationIds } },
  });

  res.json({ success: true, rejectedCount: reviewDeviations.length });
});

export { router as reviewRouter };
