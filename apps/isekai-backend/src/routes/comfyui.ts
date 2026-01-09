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
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db/index.js';
import { AppError } from '../middleware/error.js';
import {
  validateFileType,
  validateFileSize,
  generateStorageKey,
  uploadToStorage,
  getPublicUrl,
  checkStorageLimit,
} from '../lib/upload-service.js';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth.js';
import { comfyUIUploadLimiter } from '../middleware/rate-limit.js';
import sharp from 'sharp';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Apply API key auth and rate limiting to all routes
router.use(apiKeyAuthMiddleware);
router.use(comfyUIUploadLimiter);

// Validation schema for metadata
const uploadMetadataSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  tags: z.string().optional(), // JSON string array
  isMature: z.string().optional(), // "true" or "false"
  matureLevel: z.enum(['moderate', 'strict']).optional(),
  isAiGenerated: z.string().optional(), // "true" or "false"
});

// ComfyUI Upload Endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  const user = req.user!;
  const file = req.file;

  if (!file) {
    throw new AppError(400, 'No file provided');
  }

  // Validate file type
  if (!validateFileType(file.mimetype)) {
    throw new AppError(400, 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV');
  }

  // Validate file size
  if (!validateFileSize(file.size)) {
    throw new AppError(400, 'File size exceeds 50MB limit');
  }

  // Parse metadata from form fields
  const metadata = uploadMetadataSchema.parse(req.body);

  // Parse tags if provided
  let tags: string[] = [];
  if (metadata.tags) {
    try {
      tags = JSON.parse(metadata.tags);
    } catch {
      throw new AppError(400, 'Invalid tags format (must be JSON array)');
    }
  }

  // Extract image/video metadata
  let width: number | null = null;
  let height: number | null = null;
  const duration: number | null = null; // For videos, would need ffprobe

  if (file.mimetype.startsWith('image/')) {
    try {
      const imageMetadata = await sharp(file.buffer).metadata();
      width = imageMetadata.width || null;
      height = imageMetadata.height || null;
    } catch (error) {
      console.error('Failed to extract image metadata:', error);
    }
  }

  // Generate storage key and upload
  const storageKey = generateStorageKey(user.id, file.originalname);
  await uploadToStorage(storageKey, file.buffer, file.mimetype);
  const storageUrl = getPublicUrl(storageKey);

  // Create deviation with status 'review'
  const deviation = await prisma.deviation.create({
    data: {
      userId: user.id,
      status: 'review',
      title: metadata.title || file.originalname.replace(/\.[^/.]+$/, ''),
      description: metadata.description,
      tags: tags,
      isMature: metadata.isMature === 'true',
      matureLevel: metadata.matureLevel,
      isAiGenerated: metadata.isAiGenerated !== 'false', // Default true for ComfyUI
      uploadMode: 'single',
    },
  });

  // Create deviation file
  await prisma.deviationFile.create({
    data: {
      deviationId: deviation.id,
      originalFilename: file.originalname,
      storageKey,
      storageUrl,
      mimeType: file.mimetype,
      fileSize: file.size,
      width,
      height,
      duration,
      sortOrder: 0,
    },
  });

  res.status(201).json({
    success: true,
    deviationId: deviation.id,
    status: 'review',
    message: 'Upload successful. Deviation pending review.',
  });
});

export { router as comfyuiRouter };
