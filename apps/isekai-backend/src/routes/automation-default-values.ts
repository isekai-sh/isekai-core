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

// Valid field names for default values
const VALID_FIELD_NAMES = [
  'description',
  'tags',
  'isMature',
  'matureLevel',
  'categoryPath',
  'galleryIds',
  'allowComments',
  'allowFreeDownload',
  'isAiGenerated',
  'noAi',
  'addWatermark',
  'displayResolution',
] as const;

// Zod schemas
const createDefaultValueSchema = z.object({
  fieldName: z.enum(VALID_FIELD_NAMES),
  value: z.any(), // Will validate based on fieldName
  applyIfEmpty: z.boolean().default(true),
});

const updateDefaultValueSchema = z.object({
  value: z.any().optional(),
  applyIfEmpty: z.boolean().optional(),
});

// Validate value based on field name
function validateFieldValue(fieldName: string, value: any): void {
  switch (fieldName) {
    case 'description':
    case 'categoryPath':
      if (typeof value !== 'string') {
        throw new AppError(400, `${fieldName} must be a string`);
      }
      // Add max length validation
      if (value.length > 10000) {
        throw new AppError(400, `${fieldName} cannot exceed 10,000 characters`);
      }
      break;

    case 'tags':
      if (!Array.isArray(value)) {
        throw new AppError(400, 'tags must be an array of strings');
      }

      // Check max number of tags
      if (value.length > 50) {
        throw new AppError(400, 'Cannot exceed 50 tags');
      }

      // Validate each tag
      for (const tag of value) {
        if (typeof tag !== 'string') {
          throw new AppError(400, 'All tags must be strings');
        }

        // Check for empty tags
        if (tag.trim().length === 0) {
          throw new AppError(400, 'Tags cannot be empty strings');
        }

        // Check tag length
        if (tag.length > 100) {
          throw new AppError(400, 'Tags cannot exceed 100 characters');
        }
      }

      // Check for duplicates
      const uniqueTags = new Set(value.map((t: string) => t.trim().toLowerCase()));
      if (uniqueTags.size !== value.length) {
        throw new AppError(400, 'Duplicate tags detected');
      }
      break;

    case 'galleryIds':
      if (!Array.isArray(value)) {
        throw new AppError(400, 'galleryIds must be an array of strings');
      }

      // Check max number of galleries
      if (value.length > 10) {
        throw new AppError(400, 'Cannot exceed 10 galleries');
      }

      // Validate each gallery ID
      for (const galleryId of value) {
        if (typeof galleryId !== 'string') {
          throw new AppError(400, 'All gallery IDs must be strings');
        }

        // Check for empty IDs
        if (galleryId.trim().length === 0) {
          throw new AppError(400, 'Gallery IDs cannot be empty strings');
        }
      }

      // Check for duplicates
      const uniqueGalleryIds = new Set(value);
      if (uniqueGalleryIds.size !== value.length) {
        throw new AppError(400, 'Duplicate gallery IDs detected');
      }
      break;

    case 'isMature':
    case 'allowComments':
    case 'allowFreeDownload':
    case 'isAiGenerated':
    case 'noAi':
    case 'addWatermark':
      if (typeof value !== 'boolean') {
        throw new AppError(400, `${fieldName} must be a boolean`);
      }
      break;

    case 'matureLevel':
      if (value !== 'moderate' && value !== 'strict') {
        throw new AppError(400, 'matureLevel must be "moderate" or "strict"');
      }
      break;

    case 'displayResolution':
      if (typeof value !== 'number') {
        throw new AppError(400, 'displayResolution must be a number');
      }
      if (!Number.isInteger(value)) {
        throw new AppError(400, 'displayResolution must be an integer');
      }
      if (value < 0 || value > 8) {
        throw new AppError(400, 'displayResolution must be between 0 and 8');
      }
      break;

    default:
      throw new AppError(400, `Invalid field name: ${fieldName}`);
  }
}

// List default values for specific automation
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

  const values = await prisma.automationDefaultValue.findMany({
    where: { automationId },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    values: values.map((value) => ({
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    })),
  });
});

// Create default value
router.post('/', async (req, res) => {
  const userId = req.user!.id;
  const { automationId, ...data } = z
    .object({
      automationId: z.string(),
    })
    .and(createDefaultValueSchema)
    .parse(req.body);

  // Validate the value for the field
  validateFieldValue(data.fieldName, data.value);

  // Verify ownership of automation
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, userId },
  });

  if (!automation) {
    throw new AppError(404, 'Automation not found');
  }

  // Check if default already exists for this field
  const existing = await prisma.automationDefaultValue.findUnique({
    where: {
      automationId_fieldName: {
        automationId,
        fieldName: data.fieldName,
      },
    },
  });

  if (existing) {
    throw new AppError(
      400,
      `Default value for ${data.fieldName} already exists. Use PATCH to update.`
    );
  }

  const defaultValue = await prisma.automationDefaultValue.create({
    data: {
      automationId,
      fieldName: data.fieldName,
      value: data.value,
      applyIfEmpty: data.applyIfEmpty,
    },
  });

  res.status(201).json({
    value: {
      ...defaultValue,
      createdAt: defaultValue.createdAt.toISOString(),
      updatedAt: defaultValue.updatedAt.toISOString(),
    },
  });
});

// Update default value
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const data = updateDefaultValueSchema.parse(req.body);

  // Check ownership through automation
  const defaultValue = await prisma.automationDefaultValue.findUnique({
    where: { id },
    include: { automation: true },
  });

  if (!defaultValue || defaultValue.automation.userId !== userId) {
    throw new AppError(404, 'Default value not found');
  }

  // Validate the new value if provided
  if (data.value !== undefined) {
    validateFieldValue(defaultValue.fieldName, data.value);
  }

  const updateData: any = {};
  if (data.value !== undefined) updateData.value = data.value;
  if (data.applyIfEmpty !== undefined) updateData.applyIfEmpty = data.applyIfEmpty;

  const updated = await prisma.automationDefaultValue.update({
    where: { id },
    data: updateData,
  });

  res.json({
    value: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

// Delete default value
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  // Check ownership through automation
  const defaultValue = await prisma.automationDefaultValue.findUnique({
    where: { id },
    include: { automation: true },
  });

  if (!defaultValue || defaultValue.automation.userId !== userId) {
    throw new AppError(404, 'Default value not found');
  }

  await prisma.automationDefaultValue.delete({
    where: { id },
  });

  res.status(204).send();
});

export { router as automationDefaultValuesRouter };
