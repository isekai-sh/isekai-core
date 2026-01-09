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
import type { TemplateType } from '../db/index.js';

const router = Router();

// Zod schemas
const tagContentSchema = z.object({
  tags: z.array(z.string()),
});

const descriptionContentSchema = z.object({
  text: z.string(),
  variables: z.array(z.string()).optional(),
});

const commentContentSchema = z.object({
  text: z.string(),
  category: z.string().optional(),
});

const createTemplateSchema = z.object({
  type: z.enum(['tag', 'description', 'comment']),
  name: z.string().min(1).max(100),
  content: z.union([tagContentSchema, descriptionContentSchema, commentContentSchema]),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.union([tagContentSchema, descriptionContentSchema, commentContentSchema]).optional(),
});

// List templates
router.get('/', async (req, res) => {
  const { type } = req.query;
  const userId = req.user!.id;

  const userTemplates = await prisma.template.findMany({
    where: {
      userId,
      ...(type && typeof type === 'string' ? { type: type as TemplateType } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  // Transform to match frontend types
  const transformedTemplates = userTemplates.map((template) => ({
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  }));

  res.json({ templates: transformedTemplates });
});

// Get single template
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const template = await prisma.template.findFirst({
    where: { id, userId },
  });

  if (!template) {
    throw new AppError(404, 'Template not found');
  }

  res.json({
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  });
});

// Create template
router.post('/', async (req, res) => {
  const userId = req.user!.id;
  const data = createTemplateSchema.parse(req.body);

  const template = await prisma.template.create({
    data: {
      userId,
      type: data.type as TemplateType,
      name: data.name,
      content: data.content,
    },
  });

  res.status(201).json({
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  });
});

// Update template
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const template = await prisma.template.findFirst({
    where: { id, userId },
  });

  if (!template) {
    throw new AppError(404, 'Template not found');
  }

  const data = updateTemplateSchema.parse(req.body);

  const updated = await prisma.template.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      updatedAt: new Date(),
    },
  });

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Delete template
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const template = await prisma.template.findFirst({
    where: { id, userId },
  });

  if (!template) {
    throw new AppError(404, 'Template not found');
  }

  await prisma.template.delete({ where: { id } });

  res.status(204).send();
});

export { router as templatesRouter };
