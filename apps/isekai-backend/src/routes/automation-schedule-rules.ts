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
const timeOfDaySchema = z
  .string()
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:MM');

const daysOfWeekSchema = z
  .array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
  .optional();

const createRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fixed_time'),
    timeOfDay: timeOfDaySchema,
    daysOfWeek: daysOfWeekSchema,
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('fixed_interval'),
    intervalMinutes: z.number().int().min(5).max(10080), // 5 min to 7 days
    deviationsPerInterval: z.number().int().min(1).max(100),
    daysOfWeek: daysOfWeekSchema,
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('daily_quota'),
    dailyQuota: z.number().int().min(1).max(100),
    daysOfWeek: daysOfWeekSchema,
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
  }),
]);

const updateRuleSchema = z.object({
  timeOfDay: timeOfDaySchema.optional(),
  intervalMinutes: z.number().int().min(5).max(10080).optional(),
  deviationsPerInterval: z.number().int().min(1).max(100).optional(),
  dailyQuota: z.number().int().min(1).max(100).optional(),
  daysOfWeek: daysOfWeekSchema,
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

// List schedule rules for specific automation
router.get('/', async (req, res) => {
  const userId = req.user!.id;
  const { automationId } = z
    .object({
      automationId: z.string(),
    })
    .parse(req.query);

  // Verify ownership of automation
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation not found');
  }

  const rules = await prisma.automationScheduleRule.findMany({
    where: { automationId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  res.json({
    rules: rules.map((rule) => ({
      ...rule,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    })),
  });
});

// Create schedule rule
router.post('/', async (req, res) => {
  const userId = req.user!.id;
  const { automationId, ...ruleData } = z
    .object({
      automationId: z.string(),
    })
    .and(createRuleSchema)
    .parse(req.body);

  // Verify ownership of automation
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation not found');
  }

  // Create the rule with type-specific fields
  const createData: any = {
    automationId,
    type: ruleData.type,
    priority: ruleData.priority,
    enabled: ruleData.enabled,
    daysOfWeek: ruleData.daysOfWeek || null,
  };

  // Add type-specific fields
  if (ruleData.type === 'fixed_time') {
    createData.timeOfDay = ruleData.timeOfDay;
  } else if (ruleData.type === 'fixed_interval') {
    createData.intervalMinutes = ruleData.intervalMinutes;
    createData.deviationsPerInterval = ruleData.deviationsPerInterval;
  } else if (ruleData.type === 'daily_quota') {
    createData.dailyQuota = ruleData.dailyQuota;
  }

  const rule = await prisma.automationScheduleRule.create({
    data: createData,
  });

  res.status(201).json({
    rule: {
      ...rule,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    },
  });
});

// Update schedule rule
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const data = updateRuleSchema.parse(req.body);

  // Check ownership through automation
  const rule = await prisma.automationScheduleRule.findUnique({
    where: { id },
    include: { automation: true },
  });

  if (!rule || rule.automation.userId !== userId) {
    throw new AppError(404, 'Schedule rule not found');
  }

  // Validate type-specific fields to prevent setting wrong fields for rule type
  if (rule.type === 'fixed_time') {
    if (
      data.intervalMinutes !== undefined ||
      data.deviationsPerInterval !== undefined ||
      data.dailyQuota !== undefined
    ) {
      throw new AppError(400, 'Cannot set interval or quota fields on fixed_time rule');
    }
  }

  if (rule.type === 'fixed_interval') {
    if (data.timeOfDay !== undefined || data.dailyQuota !== undefined) {
      throw new AppError(400, 'Cannot set timeOfDay or quota fields on fixed_interval rule');
    }
  }

  if (rule.type === 'daily_quota') {
    if (
      data.timeOfDay !== undefined ||
      data.intervalMinutes !== undefined ||
      data.deviationsPerInterval !== undefined
    ) {
      throw new AppError(400, 'Cannot set time or interval fields on daily_quota rule');
    }
  }

  // Build update data
  const updateData: any = {};

  if (data.timeOfDay !== undefined) updateData.timeOfDay = data.timeOfDay;
  if (data.intervalMinutes !== undefined) updateData.intervalMinutes = data.intervalMinutes;
  if (data.deviationsPerInterval !== undefined)
    updateData.deviationsPerInterval = data.deviationsPerInterval;
  if (data.dailyQuota !== undefined) updateData.dailyQuota = data.dailyQuota;
  if (data.daysOfWeek !== undefined) updateData.daysOfWeek = data.daysOfWeek || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;

  const updated = await prisma.automationScheduleRule.update({
    where: { id },
    data: updateData,
  });

  res.json({
    rule: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

// Delete schedule rule
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // Check ownership through automation
  const rule = await prisma.automationScheduleRule.findUnique({
    where: { id },
    include: { automation: true },
  });

  if (!rule || rule.automation.userId !== userId) {
    throw new AppError(404, 'Schedule rule not found');
  }

  // Check if this is the last enabled rule and automation is enabled
  if (rule.automation.enabled && rule.enabled) {
    const enabledRulesCount = await prisma.automationScheduleRule.count({
      where: {
        automationId: rule.automationId,
        enabled: true,
      },
    });

    if (enabledRulesCount === 1) {
      throw new AppError(
        400,
        'Cannot delete the last enabled rule while automation is enabled. Disable automation first.'
      );
    }
  }

  await prisma.automationScheduleRule.delete({
    where: { id },
  });

  res.status(204).send();
});

export { router as automationScheduleRulesRouter };
