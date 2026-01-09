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

// Zod schemas
const createAutomationSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    icon: z.string().max(10).optional(),
    draftSelectionMethod: z.enum(['random', 'fifo', 'lifo']).default('fifo'),
    stashOnlyByDefault: z.boolean().default(false),
    jitterMinSeconds: z.number().int().min(0).max(3600).default(0),
    jitterMaxSeconds: z.number().int().min(0).max(3600).default(300),
    sortOrder: z.number().int().optional(),
    autoAddToSaleQueue: z.boolean().default(false),
    saleQueuePresetId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      // If sale queue enabled, must have preset
      if (data.autoAddToSaleQueue && !data.saleQueuePresetId) {
        return false;
      }
      return true;
    },
    { message: 'Must select price preset when sale queue is enabled' }
  );

const updateAutomationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(10).optional(),
  enabled: z.boolean().optional(),
  draftSelectionMethod: z.enum(['random', 'fifo', 'lifo']).optional(),
  stashOnlyByDefault: z.boolean().optional(),
  jitterMinSeconds: z.number().int().min(0).max(3600).optional(),
  jitterMaxSeconds: z.number().int().min(0).max(3600).optional(),
  sortOrder: z.number().int().optional(),
  autoAddToSaleQueue: z.boolean().optional(),
  saleQueuePresetId: z.string().uuid().optional().nullable(),
});

// Get all user's automation workflows (list view)
router.get('/', async (req, res) => {
  const userId = req.user!.id;

  const automations = await prisma.automation.findMany({
    where: { userId },
    include: {
      scheduleRules: {
        where: { enabled: true },
        orderBy: { priority: 'asc' },
      },
      saleQueuePreset: true,
      _count: {
        select: {
          scheduleRules: true,
          defaultValues: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  res.json({
    automations: automations.map((automation) => ({
      ...automation,
      createdAt: automation.createdAt.toISOString(),
      updatedAt: automation.updatedAt.toISOString(),
      scheduleRules: automation.scheduleRules.map((rule) => ({
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
    })),
  });
});

// Reorder automations (must come before /:id routes)
router.patch('/reorder', async (req, res) => {
  const userId = req.user!.id;
  const { automationIds } = z
    .object({
      automationIds: z.array(z.string()),
    })
    .parse(req.body);

  // Verify ownership of all automations
  const count = await prisma.automation.count({
    where: { id: { in: automationIds }, userId },
  });

  if (count !== automationIds.length) {
    throw new AppError(400, 'Some automations not found or not owned by user');
  }

  // Update sort orders based on array position
  await Promise.all(
    automationIds.map((id, index) =>
      prisma.automation.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  res.json({ success: true });
});

// Get single automation with full details (detail view)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const automation = await prisma.automation.findFirst({
    where: { id, userId },
    include: {
      scheduleRules: {
        orderBy: { priority: 'asc' },
      },
      defaultValues: true,
      saleQueuePreset: true,
      executionLogs: {
        orderBy: { executedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!automation) {
    throw new AppError(404, 'Automation not found');
  }

  res.json({
    automation: {
      ...automation,
      createdAt: automation.createdAt.toISOString(),
      updatedAt: automation.updatedAt.toISOString(),
      scheduleRules: automation.scheduleRules.map((rule) => ({
        ...rule,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      defaultValues: automation.defaultValues.map((value) => ({
        ...value,
        createdAt: value.createdAt.toISOString(),
        updatedAt: value.updatedAt.toISOString(),
      })),
      executionLogs: automation.executionLogs.map((log) => ({
        ...log,
        executedAt: log.executedAt.toISOString(),
      })),
    },
  });
});

// Create automation workflow
router.post('/', async (req, res) => {
  const userId = req.user!.id;
  const data = createAutomationSchema.parse(req.body);

  // Validate jitter range
  if (data.jitterMinSeconds > data.jitterMaxSeconds) {
    throw new AppError(400, 'jitterMinSeconds cannot be greater than jitterMaxSeconds');
  }

  // Validate sale queue preset if provided
  if (data.saleQueuePresetId) {
    const preset = await prisma.pricePreset.findFirst({
      where: {
        id: data.saleQueuePresetId,
        userId,
      },
    });

    if (!preset) {
      throw new AppError(404, 'Price preset not found or not owned by user');
    }
  }

  // If no sortOrder provided, put at end
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const maxOrder = await prisma.automation.findFirst({
      where: { userId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = (maxOrder?.sortOrder ?? 0) + 1;
  }

  const automation = await prisma.automation.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      color: data.color,
      icon: data.icon,
      draftSelectionMethod: data.draftSelectionMethod,
      stashOnlyByDefault: data.stashOnlyByDefault,
      jitterMinSeconds: data.jitterMinSeconds,
      jitterMaxSeconds: data.jitterMaxSeconds,
      autoAddToSaleQueue: data.autoAddToSaleQueue,
      saleQueuePresetId: data.saleQueuePresetId,
      sortOrder,
    },
  });

  res.status(201).json({
    automation: {
      ...automation,
      createdAt: automation.createdAt.toISOString(),
      updatedAt: automation.updatedAt.toISOString(),
    },
  });
});

// Update automation config
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const data = updateAutomationSchema.parse(req.body);

  // Check ownership
  const automation = await prisma.automation.findFirst({
    where: { id, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation config not found');
  }

  // Prevent updates while automation is executing
  if (automation.isExecuting) {
    throw new AppError(
      409,
      'Cannot update automation while it is executing. Please try again in a moment.'
    );
  }

  // Validate sale queue logic: if enabling autoAddToSaleQueue, must have a preset (either in request or existing)
  if (data.autoAddToSaleQueue === true) {
    const finalPresetId =
      data.saleQueuePresetId !== undefined ? data.saleQueuePresetId : automation.saleQueuePresetId;

    if (!finalPresetId) {
      throw new AppError(400, 'Must select price preset when enabling sale queue');
    }
  }

  // Validate jitter range if being updated
  if (data.jitterMinSeconds !== undefined || data.jitterMaxSeconds !== undefined) {
    const minSeconds = data.jitterMinSeconds ?? automation.jitterMinSeconds;
    const maxSeconds = data.jitterMaxSeconds ?? automation.jitterMaxSeconds;

    if (minSeconds > maxSeconds) {
      throw new AppError(400, 'jitterMinSeconds cannot be greater than jitterMaxSeconds');
    }
  }

  // Validate sale queue preset if being updated
  if (data.saleQueuePresetId !== undefined && data.saleQueuePresetId !== null) {
    const preset = await prisma.pricePreset.findFirst({
      where: {
        id: data.saleQueuePresetId,
        userId,
      },
    });

    if (!preset) {
      throw new AppError(404, 'Price preset not found or not owned by user');
    }
  }

  // If enabling, validate that at least one rule exists
  if (data.enabled === true) {
    const ruleCount = await prisma.automationScheduleRule.count({
      where: { automationId: id, enabled: true },
    });

    if (ruleCount === 0) {
      throw new AppError(400, 'Cannot enable automation without at least one active schedule rule');
    }
  }

  const updated = await prisma.automation.update({
    where: { id },
    data,
  });

  res.json({
    automation: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

// Delete automation config
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // Check ownership
  const automation = await prisma.automation.findFirst({
    where: { id, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation config not found');
  }

  // Prevent deletion while automation is executing
  if (automation.isExecuting) {
    throw new AppError(
      409,
      'Cannot delete automation while it is executing. Please try again in a moment.'
    );
  }

  await prisma.automation.delete({
    where: { id },
  });

  res.status(204).send();
});

// Toggle automation (enable/disable)
router.post('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // Check ownership
  const automation = await prisma.automation.findFirst({
    where: { id, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation config not found');
  }

  const newEnabledState = !automation.enabled;

  // If enabling, validate that at least one rule exists
  if (newEnabledState === true) {
    const ruleCount = await prisma.automationScheduleRule.count({
      where: { automationId: id, enabled: true },
    });

    if (ruleCount === 0) {
      throw new AppError(400, 'Cannot enable automation without at least one active schedule rule');
    }
  }

  const updated = await prisma.automation.update({
    where: { id },
    data: { enabled: newEnabledState },
  });

  res.json({
    automation: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

// Get execution logs (paginated)
router.get('/:id/logs', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  // Check ownership
  const automation = await prisma.automation.findFirst({
    where: { id, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation config not found');
  }

  const [logs, total] = await Promise.all([
    prisma.automationExecutionLog.findMany({
      where: { automationId: id },
      orderBy: { executedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.automationExecutionLog.count({
      where: { automationId: id },
    }),
  ]);

  res.json({
    logs: logs.map((log) => ({
      ...log,
      executedAt: log.executedAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Test automation (manually trigger)
router.post('/:id/test', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // Check ownership
  const automation = await prisma.automation.findFirst({
    where: { id, userId },
    include: {
      scheduleRules: { where: { enabled: true } },
      defaultValues: true,
    },
  });

  if (!automation) {
    throw new AppError(404, 'Automation config not found');
  }

  if (automation.scheduleRules.length === 0) {
    throw new AppError(400, 'Cannot test automation without at least one active schedule rule');
  }

  // For testing, we'll just validate the config and return a preview
  // The actual scheduling will be done by the background job
  res.json({
    message: 'Test triggered successfully',
    config: {
      enabled: automation.enabled,
      draftSelectionMethod: automation.draftSelectionMethod,
      stashOnlyByDefault: automation.stashOnlyByDefault,
      activeRules: automation.scheduleRules.length,
      defaultValues: automation.defaultValues.length,
    },
  });
});

export { router as automationsRouter };
