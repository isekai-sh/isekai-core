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

import { Router } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../db/index.js";
import { AppError } from "../middleware/error.js";
import {
  validateFileType,
  validateFileSize,
  generateStorageKey,
  getPublicUrl,
  deleteFromStorage,
  getPresignedUploadUrl,
} from "../lib/upload-service.js";

const router = Router();

// Get presigned URL for upload
router.post("/presigned", async (req, res) => {
  const user = req.user!;
  const { filename, contentType, fileSize } = req.body;

  if (!filename || !contentType || !fileSize) {
    throw new AppError(400, "filename, contentType, and fileSize are required");
  }

  // Validate file type
  if (!validateFileType(contentType)) {
    throw new AppError(
      400,
      "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV"
    );
  }

  // Validate file size
  if (!validateFileSize(fileSize)) {
    throw new AppError(400, "File size exceeds 50MB limit");
  }

  const fileId = randomUUID();
  const storageKey = generateStorageKey(user.id, filename);

  const uploadUrl = await getPresignedUploadUrl(storageKey, contentType, fileSize);

  res.json({
    uploadUrl,
    fileId,
    storageKey,
  });
});

// Complete upload (link file to deviation)
router.post("/complete", async (req, res) => {
  const user = req.user!;
  const {
    fileId,
    deviationId,
    storageKey,
    originalFilename,
    mimeType,
    fileSize,
    width,
    height,
    duration,
  } = req.body;

  if (
    !fileId ||
    !deviationId ||
    !storageKey ||
    !originalFilename ||
    !mimeType ||
    !fileSize
  ) {
    throw new AppError(400, "Missing required fields");
  }

  const storageUrl = getPublicUrl(storageKey);

  // Get current file count for this deviation to set sort order
  const existingFiles = await prisma.deviationFile.findMany({
    where: { deviationId },
  });

  // Validate max 100 files per deviation
  if (existingFiles.length >= 100) {
    throw new AppError(400, "Maximum 100 files per deviation");
  }

  await prisma.deviationFile.create({
    data: {
      id: fileId,
      deviationId,
      originalFilename,
      storageKey,
      storageUrl,
      mimeType,
      fileSize,
      width,
      height,
      duration,
      sortOrder: existingFiles.length,
    },
  });

  res.json({ success: true });
});

// Delete file
router.delete("/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const user = req.user!;

  const file = await prisma.deviationFile.findFirst({
    where: { id: fileId },
    include: {
      deviation: true,
    },
  });

  if (!file || file.deviation?.userId !== user.id) {
    throw new AppError(404, "File not found");
  }

  // Delete from storage
  try {
    await deleteFromStorage(file.storageKey);
  } catch (error) {
    console.error("Failed to delete from storage:", error);
    // Continue with DB deletion even if storage fails
  }

  await prisma.deviationFile.delete({ where: { id: fileId } });

  // Note: Storage tracking removed - add storageUsedBytes to schema in v0.2.0 if needed
  // await prisma.user.update({
  //   where: { id: user.id },
  //   data: {
  //     storageUsedBytes: BigInt(Math.max(0, Number(user.storageUsedBytes) - file.fileSize)),
  //     updatedAt: new Date(),
  //   },
  // });

  res.status(204).send();
});

// Batch delete files
router.post("/batch-delete", async (req, res) => {
  const { fileIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    throw new AppError(400, "fileIds array is required");
  }

  // Fetch files with deviation info
  const files = await prisma.deviationFile.findMany({
    where: { id: { in: fileIds } },
    include: { deviation: true },
  });

  // Verify ownership
  if (files.some((f) => f.deviation?.userId !== user.id)) {
    throw new AppError(403, "Unauthorized");
  }

  // Delete from storage (parallel, ignore failures)
  await Promise.allSettled(files.map((file) => deleteFromStorage(file.storageKey)));

  // Delete from DB
  await prisma.deviationFile.deleteMany({
    where: { id: { in: fileIds } },
  });

  res.json({ success: true, deletedCount: files.length });
});

export { router as uploadsRouter };
