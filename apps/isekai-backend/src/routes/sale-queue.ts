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
import { z } from 'zod';
import { prisma } from '../db/index.js';
import { AppError } from '../middleware/error.js';

const router = Router();

// Validation schemas
const addToQueueSchema = z.object({
  deviationIds: z.array(z.string().uuid()).min(1).max(50), // Batch up to 50
  pricePresetId: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'skipped']),
  errorMessage: z.string().optional(),
  errorDetails: z.any().optional(),
  screenshotKey: z.string().optional(),
});

// ============================================================================
// USER-FACING ENDPOINTS
// ============================================================================

// GET /api/sale-queue - List queue items with filters
router.get('/', async (req, res) => {
  const user = req.user!;
  const { status, page = '1', limit = '50' } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = Math.min(parseInt(limit as string, 10), 100); // Cap at 100
  const offset = (pageNum - 1) * limitNum;

  const where: any = {
    userId: user.id,
  };

  if (status) {
    where.status = status as any;
  }

  const [items, total] = await Promise.all([
    prisma.saleQueue.findMany({
      where,
      include: {
        deviation: {
          select: {
            id: true,
            title: true,
            deviationUrl: true,
            publishedAt: true,
          },
        },
        pricePreset: {
          select: {
            id: true,
            name: true,
            price: true,
            minPrice: true,
            maxPrice: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limitNum,
      skip: offset,
    }),
    prisma.saleQueue.count({ where }),
  ]);

  res.json({ items, total, page: pageNum, limit: limitNum });
});

// POST /api/sale-queue - Add deviations to sale queue
router.post('/', async (req, res) => {
  const user = req.user!;
  const { deviationIds, pricePresetId } = addToQueueSchema.parse(req.body);

  // Verify price preset belongs to user
  const preset = await prisma.pricePreset.findFirst({
    where: { id: pricePresetId, userId: user.id },
  });

  if (!preset) {
    throw new AppError(404, 'Price preset not found');
  }

  // Verify deviations exist, are published, and belong to user
  const deviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: 'published', // Only published deviations can be set for sale
      deviationUrl: { not: null }, // Must have DeviantArt URL
    },
    select: { id: true },
  });

  if (deviations.length === 0) {
    throw new AppError(400, 'No valid published deviations found');
  }

  if (deviations.length !== deviationIds.length) {
    const foundIds = new Set(deviations.map((d) => d.id));
    const notFound = deviationIds.filter((id) => !foundIds.has(id));
    console.warn(`Some deviations not found or not published: ${notFound.join(', ')}`);
  }

  // Check for existing queue entries
  const existing = await prisma.saleQueue.findMany({
    where: {
      deviationId: { in: deviations.map((d) => d.id) },
    },
    select: { deviationId: true },
  });

  const existingIds = new Set(existing.map((e) => e.deviationId));
  const newIds = deviations.map((d) => d.id).filter((id) => !existingIds.has(id));

  if (newIds.length === 0) {
    return res.json({
      created: 0,
      skipped: existingIds.size,
      message: 'All deviations already in queue',
    });
  }

  // Calculate price for each entry (fixed or random from preset range)
  let finalPrice: number;
  if (preset.minPrice !== null && preset.maxPrice !== null) {
    // Random price within range - use Math.floor to ensure INT
    const range = preset.maxPrice - preset.minPrice;
    finalPrice = preset.minPrice + Math.floor(Math.random() * (range + 1));
  } else {
    // Fixed price
    finalPrice = preset.price;
  }

  // Create queue entries for new deviations
  const created = await prisma.saleQueue.createMany({
    data: newIds.map((deviationId) => ({
      userId: user.id,
      deviationId,
      pricePresetId,
      price: finalPrice,
    })),
  });

  res.status(201).json({
    created: created.count,
    skipped: existingIds.size,
    message: `Added ${created.count} deviation(s) to sale queue`,
  });
});

// PATCH /api/sale-queue/:id - Update queue item status (user-facing)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const data = updateStatusSchema.parse(req.body);

  const item = await prisma.saleQueue.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    throw new AppError(404, 'Queue item not found');
  }

  const updated = await prisma.saleQueue.update({
    where: { id },
    data: {
      status: data.status,
      errorMessage: data.errorMessage,
      errorDetails: data.errorDetails,
      screenshotKey: data.screenshotKey,
      completedAt: data.status === 'completed' ? new Date() : null,
    },
  });

  res.json(updated);
});

// DELETE /api/sale-queue/:id - Remove from queue
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const item = await prisma.saleQueue.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    throw new AppError(404, 'Queue item not found');
  }

  // Prevent deletion if currently processing
  if (item.status === 'processing') {
    throw new AppError(400, 'Cannot delete item currently being processed', true);
  }

  await prisma.saleQueue.delete({
    where: { id },
  });

  res.status(204).send();
});

// ============================================================================
// AUTOMATION CLIENT ENDPOINTS
// ============================================================================

// GET /api/sale-queue/next - Fetch next pending item (for automation client)
router.get('/next', async (req, res) => {
  const user = req.user!;
  const { clientId } = req.query;

  if (!clientId || typeof clientId !== 'string') {
    throw new AppError(400, 'clientId query parameter required');
  }

  // Find next pending item and lock it atomically
  const item = await prisma.$transaction(async (tx) => {
    const pending = await tx.saleQueue.findFirst({
      where: {
        userId: user.id,
        status: 'pending',
        OR: [
          { lockedAt: null }, // Not locked
          {
            // Or locked but stale (>10 minutes)
            lockedAt: {
              lt: new Date(Date.now() - 10 * 60 * 1000),
            },
          },
        ],
      },
      include: {
        deviation: true,
        pricePreset: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!pending) return null;

    // Lock the item
    return await tx.saleQueue.update({
      where: { id: pending.id },
      data: {
        status: 'processing',
        processingBy: clientId,
        lockedAt: new Date(),
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
      include: {
        deviation: true,
        pricePreset: true,
      },
    });
  });

  if (!item) {
    return res.json({ item: null, message: 'Queue empty' });
  }

  res.json({ item });
});

// POST /api/sale-queue/:id/complete - Mark item as completed
router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const item = await prisma.saleQueue.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    throw new AppError(404, 'Queue item not found');
  }

  const updated = await prisma.saleQueue.update({
    where: { id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      processingBy: null,
      lockedAt: null,
      errorMessage: null, // Clear any previous errors
      errorDetails: null,
    },
  });

  res.json(updated);
});

// POST /api/sale-queue/:id/fail - Mark item as failed
router.post('/:id/fail', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const failSchema = z.object({
    errorMessage: z.string(),
    errorDetails: z.any().optional(),
    screenshotKey: z.string().optional(),
  });

  const { errorMessage, errorDetails, screenshotKey } = failSchema.parse(req.body);

  const item = await prisma.saleQueue.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    throw new AppError(404, 'Queue item not found');
  }

  // Retry logic: max 3 attempts, then mark as failed
  const shouldRetry = item.attempts < 3;

  const updated = await prisma.saleQueue.update({
    where: { id },
    data: {
      status: shouldRetry ? 'pending' : 'failed',
      errorMessage,
      errorDetails,
      screenshotKey,
      processingBy: null,
      lockedAt: null,
      // If final failure, set completedAt
      ...(shouldRetry ? {} : { completedAt: new Date() }),
    },
  });

  res.json({ item: updated, willRetry: shouldRetry });
});

// POST /api/sale-queue/cleanup - Unlock stale jobs (admin/manual cleanup)
router.post('/cleanup', async (req, res) => {
  const user = req.user!;

  // Find all stuck jobs in 'processing' status (manual cleanup, no time limit)
  const staleItems = await prisma.saleQueue.findMany({
    where: {
      userId: user.id,
      status: 'processing',
    },
  });

  // Reset them to pending
  await prisma.saleQueue.updateMany({
    where: {
      id: { in: staleItems.map((item) => item.id) },
    },
    data: {
      status: 'pending',
      processingBy: null,
      lockedAt: null,
    },
  });

  res.json({
    cleaned: staleItems.length,
    message: `Unlocked ${staleItems.length} stuck jobs`,
  });
});

export { router as saleQueueRouter };
