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
const createPresetSchema = z
  .object({
    name: z.string().min(1).max(100),
    price: z.number().int().min(100).max(1000000).optional(), // Fixed price ($1 to $10,000 in cents)
    minPrice: z.number().int().min(100).max(1000000).optional(), // Min for random range
    maxPrice: z.number().int().min(100).max(1000000).optional(), // Max for random range
    currency: z.string().default('USD'),
    description: z.string().optional(),
    isDefault: z.boolean().optional().default(false),
    sortOrder: z.number().int().optional().default(0),
  })
  .refine(
    (data) => {
      // Must have either fixed price OR range, not both
      const hasFixed = data.price !== undefined;
      const hasRange = data.minPrice !== undefined && data.maxPrice !== undefined;
      return (hasFixed && !hasRange) || (!hasFixed && hasRange);
    },
    {
      message: 'Must specify either fixed price or price range (minPrice and maxPrice), not both',
    }
  )
  .refine(
    (data) => {
      // If range, min must be less than max
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.minPrice < data.maxPrice;
      }
      return true;
    },
    { message: 'minPrice must be less than maxPrice' }
  );

const updatePresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price: z.number().int().min(100).max(1000000).optional(),
  minPrice: z.number().int().min(100).max(1000000).optional(),
  maxPrice: z.number().int().min(100).max(1000000).optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/price-presets - List all price presets for current user
router.get('/', async (req, res) => {
  const user = req.user!;

  const presets = await prisma.pricePreset.findMany({
    where: { userId: user.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  res.json({ presets });
});

// GET /api/price-presets/:id - Get single preset
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const preset = await prisma.pricePreset.findFirst({
    where: { id, userId: user.id },
  });

  if (!preset) {
    throw new AppError(404, 'Price preset not found');
  }

  res.json(preset);
});

// POST /api/price-presets - Create new preset
router.post('/', async (req, res) => {
  const user = req.user!;
  const data = createPresetSchema.parse(req.body);

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.pricePreset.updateMany({
      where: { userId: user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const preset = await prisma.pricePreset.create({
    data: {
      userId: user.id,
      name: data.name,
      price: data.price || 0, // Default to 0 if using range pricing
      minPrice: data.minPrice,
      maxPrice: data.maxPrice,
      currency: data.currency,
      description: data.description,
      isDefault: data.isDefault,
      sortOrder: data.sortOrder,
    },
  });

  res.status(201).json(preset);
});

// PATCH /api/price-presets/:id - Update preset
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const data = updatePresetSchema.parse(req.body);

  const existing = await prisma.pricePreset.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    throw new AppError(404, 'Price preset not found');
  }

  // Handle default flag
  if (data.isDefault) {
    await prisma.pricePreset.updateMany({
      where: { userId: user.id, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.pricePreset.update({
    where: { id },
    data,
  });

  res.json(updated);
});

// DELETE /api/price-presets/:id - Delete preset
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  // Verify ownership
  const existing = await prisma.pricePreset.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    throw new AppError(404, 'Price preset not found');
  }

  // Check if preset is in use by pending queue items
  const queueCount = await prisma.saleQueue.count({
    where: {
      pricePresetId: id,
      status: { in: ['pending', 'processing'] },
    },
  });

  if (queueCount > 0) {
    throw new AppError(
      400,
      `Cannot delete preset with ${queueCount} pending/processing sale(s)`,
      true
    );
  }

  // Check if preset is used by automations with sale queue enabled
  const automationsUsingPreset = await prisma.automation.count({
    where: {
      saleQueuePresetId: id,
      autoAddToSaleQueue: true,
    },
  });

  if (automationsUsingPreset > 0) {
    throw new AppError(
      400,
      `Cannot delete preset - used by ${automationsUsingPreset} automation(s) with sale queue enabled`
    );
  }

  await prisma.pricePreset.delete({
    where: { id },
  });

  res.status(204).send();
});

export { router as pricePresetsRouter };
