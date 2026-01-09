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
import { z } from "zod";
import { prisma } from "../db/index.js";
import { AppError } from "../middleware/error.js";
import {
  scheduleDeviation,
  publishDeviationNow,
  cancelScheduledDeviation,
  deviationPublisherQueue,
} from "../queues/deviation-publisher.js";
import { scheduleRateLimit, batchRateLimit } from "../middleware/rate-limit.js";
import type { DeviationStatus, MatureLevel, UploadMode } from "../db/index.js";
import { deleteFromStorage } from "../lib/upload-service.js";

const router = Router();

const createDeviationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryPath: z.string().optional(),
  galleryIds: z.array(z.string()).optional(),
  isMature: z.boolean().optional(),
  matureLevel: z.enum(["moderate", "strict"]).optional(),
  allowComments: z.boolean().optional(),
  allowFreeDownload: z.boolean().optional(),
  isAiGenerated: z.boolean().optional(),
  noAi: z.boolean().optional(),
  uploadMode: z.enum(["single", "multiple"]).optional(),
  scheduledAt: z.string().optional(),
});

// List deviations
router.get("/", async (req, res) => {
  const { status, page = "1", limit = "20" } = req.query;
  const userId = req.user!.id;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const offset = (pageNum - 1) * limitNum;

  const whereClause = {
    userId,
    ...(status && typeof status === "string"
      ? { status: status as DeviationStatus }
      : {}),
  };

  const [userDeviations, total] = await Promise.all([
    prisma.deviation.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limitNum,
      skip: offset,
      include: {
        files: true,
      },
    }),
    prisma.deviation.count({
      where: whereClause,
    }),
  ]);

  // Transform to match frontend types
  const transformedDeviations = userDeviations.map((deviation) => ({
    ...deviation,
    files: deviation.files || [],
    scheduledAt: deviation.scheduledAt?.toISOString() ?? null,
    actualPublishAt: deviation.actualPublishAt?.toISOString() ?? null,
    publishedAt: deviation.publishedAt?.toISOString() ?? null,
    lastRetryAt: deviation.lastRetryAt?.toISOString() ?? null,
    createdAt: deviation.createdAt.toISOString(),
    updatedAt: deviation.updatedAt.toISOString(),
  }));

  res.json({ deviations: transformedDeviations, total });
});

// Get single deviation
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  res.json({
    ...deviation,
    files: deviation.files || [],
    scheduledAt: deviation.scheduledAt?.toISOString() ?? null,
    actualPublishAt: deviation.actualPublishAt?.toISOString() ?? null,
    publishedAt: deviation.publishedAt?.toISOString() ?? null,
    lastRetryAt: deviation.lastRetryAt?.toISOString() ?? null,
    createdAt: deviation.createdAt.toISOString(),
    updatedAt: deviation.updatedAt.toISOString(),
  });
});

// Create deviation
router.post("/", async (req, res) => {
  const user = req.user!;

  // Note: No draft limit check - only scheduled deviations are limited
  const data = createDeviationSchema.parse(req.body);

  const deviation = await prisma.deviation.create({
    data: {
      userId: user.id,
      title: data.title,
      description: data.description,
      tags: data.tags ?? [],
      categoryPath: data.categoryPath,
      galleryIds: data.galleryIds ?? [],
      isMature: data.isMature ?? false,
      matureLevel: data.matureLevel as MatureLevel | undefined,
      allowComments: data.allowComments ?? true,
      allowFreeDownload: data.allowFreeDownload ?? false,
      isAiGenerated: data.isAiGenerated ?? false,
      noAi: data.noAi ?? false,
      uploadMode: (data.uploadMode ?? "single") as UploadMode,
    },
  });

  res.status(201).json({
    ...deviation,
    files: [],
    scheduledAt: null,
    actualPublishAt: null,
    publishedAt: null,
    lastRetryAt: null,
    createdAt: deviation.createdAt.toISOString(),
    updatedAt: deviation.updatedAt.toISOString(),
  });
});

// Update deviation
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  if (deviation.status === "published") {
    throw new AppError(400, "Cannot edit published deviation");
  }

  const data = createDeviationSchema.partial().parse(req.body);

  // Convert scheduledAt string to Date object if present
  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.scheduledAt) {
    updateData.scheduledAt = new Date(data.scheduledAt);
    console.log("Updating scheduledAt:", {
      original: data.scheduledAt,
      converted: updateData.scheduledAt,
      iso: updateData.scheduledAt.toISOString(),
    });
  }

  const updated = await prisma.deviation.update({
    where: { id },
    data: updateData,
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

// Delete deviation
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  // Delete files from storage
  if (deviation.files && deviation.files.length > 0) {
    await Promise.allSettled(
      deviation.files.map((file) => deleteFromStorage(file.storageKey))
    );
  }

  // Cancel scheduled job if deviation is scheduled
  if (deviation.status === "scheduled") {
    await cancelScheduledDeviation(id);
  }

  await prisma.deviation.delete({ where: { id } });

  res.status(204).send();
});

// Schedule deviation
router.post("/:id/schedule", scheduleRateLimit, async (req, res) => {
  const { id } = req.params;
  const user = req.user!;
  const { scheduledAt } = req.body;

  if (!scheduledAt) {
    throw new AppError(400, "scheduledAt is required");
  }

  // Pre-transaction validation: Check deviation exists and belongs to user
  const deviation = await prisma.deviation.findFirst({
    where: { id, userId: user.id },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  if (deviation.status !== "draft" && deviation.status !== "failed") {
    throw new AppError(
      400,
      "Only drafts and failed deviations can be scheduled"
    );
  }

  if (!deviation.files || deviation.files.length === 0) {
    throw new AppError(400, "Deviation must have at least one file");
  }

  // Validate scheduling time
  const scheduledDate = new Date(scheduledAt);
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const maxScheduleTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year max

  if (scheduledDate < oneHourFromNow) {
    throw new AppError(
      400,
      "Scheduled time must be at least 1 hour in the future"
    );
  }

  if (scheduledDate > maxScheduleTime) {
    throw new AppError(400, "Cannot schedule more than 365 days in the future");
  }

  // Generate random jitter (0-300 seconds = 0-5 minutes)
  const jitterSeconds = Math.floor(Math.random() * 301);
  const actualPublishAt = new Date(
    scheduledDate.getTime() + jitterSeconds * 1000
  );

  // Use transaction to atomically check limits and update status
  let updated;
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        // Update deviation to scheduled status
        const updatedDeviation = await tx.deviation.update({
          where: { id },
          data: {
            status: "scheduled",
            scheduledAt: scheduledDate,
            jitterSeconds,
            actualPublishAt,
            updatedAt: new Date(),
          },
        });

        return updatedDeviation;
      },
      {
        isolationLevel: "Serializable", // Prevent concurrent modifications
        timeout: 10000, // 10 second timeout
      }
    );

    // Schedule the deviation with BullMQ (outside transaction for proper error handling)
    // If this fails, we catch the error and rollback the DB status
    await scheduleDeviation(id, user.id, actualPublishAt, deviation.uploadMode);
  } catch (error) {
    // If scheduling failed after DB was updated, rollback to draft status
    if (updated) {
      console.error(
        `[Schedule] Failed to queue deviation ${id}, rolling back:`,
        error
      );
      await prisma.deviation.update({
        where: { id },
        data: {
          status: "draft",
          errorMessage: `Failed to schedule: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          updatedAt: new Date(),
        },
      });
      throw new AppError(
        500,
        "Failed to schedule deviation. Please try again."
      );
    }
    // If error happened during transaction, just re-throw
    throw error;
  }

  res.json({
    ...updated,
    files: deviation.files,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
    actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
    lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Publish now
router.post("/:id/publish-now", scheduleRateLimit, async (req, res) => {
  const { id } = req.params;
  const user = req.user!;

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId: user.id },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  if (!["draft", "scheduled", "failed"].includes(deviation.status)) {
    throw new AppError(400, "Deviation cannot be published");
  }

  if (!deviation.files || deviation.files.length === 0) {
    throw new AppError(400, "Deviation must have at least one file");
  }

  // Check if deviation is scheduled and has an active/waiting job
  if (deviation.status === "scheduled") {
    const existingJob = await deviationPublisherQueue.getJob(`deviation-${id}`);

    if (existingJob) {
      const jobState = await existingJob.getState();

      if (jobState === "active") {
        throw new AppError(
          409,
          "This deviation is currently being published. Please wait."
        );
      }

      if (["waiting", "delayed"].includes(jobState)) {
        // Cancel scheduled job before publishing now
        await existingJob.remove();
        console.log(
          `[Publish Now] Cancelled scheduled job for deviation ${id}`
        );
      }
    }
  }

  // Publish immediately with BullMQ
  await publishDeviationNow(id, user.id, deviation.uploadMode);

  const updated = await prisma.deviation.update({
    where: { id },
    data: {
      status: "publishing",
      updatedAt: new Date(),
    },
  });

  res.json({
    ...updated,
    files: deviation.files,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
    actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
    publishedAt: updated.publishedAt?.toISOString() ?? null,
    lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Cancel scheduled deviation
router.post("/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId },
    include: { files: true },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  if (deviation.status !== "scheduled") {
    throw new AppError(400, "Only scheduled deviations can be canceled");
  }

  // Cancel the scheduled job
  await cancelScheduledDeviation(id);

  const updated = await prisma.deviation.update({
    where: { id },
    data: {
      status: "draft",
      scheduledAt: null,
      jitterSeconds: 0,
      actualPublishAt: null,
      updatedAt: new Date(),
    },
  });

  res.json({
    ...updated,
    files: deviation.files,
    scheduledAt: null,
    actualPublishAt: null,
    publishedAt: null,
    lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Reorder deviation files
router.patch("/:id/files/reorder", async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const { fileIds } = req.body;

  if (!Array.isArray(fileIds)) {
    throw new AppError(400, "fileIds must be an array");
  }

  const deviation = await prisma.deviation.findFirst({
    where: { id, userId },
  });

  if (!deviation) {
    throw new AppError(404, "Deviation not found");
  }

  // Update sort order for each file
  for (let i = 0; i < fileIds.length; i++) {
    await prisma.deviationFile.update({
      where: { id: fileIds[i] },
      data: { sortOrder: i },
    });
  }

  res.json({ success: true });
});

// Batch delete deviations
router.post("/batch-delete", batchRateLimit, async (req, res) => {
  const { deviationIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, "deviationIds array is required");
  }

  // Fetch drafts only
  const drafts = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: "draft",
    },
    include: { files: true },
  });

  if (drafts.length !== deviationIds.length) {
    throw new AppError(400, "Can only delete draft deviations");
  }

  // Delete files from storage
  const allFiles = drafts.flatMap((d) => d.files);
  await Promise.allSettled(
    allFiles.map((file) => deleteFromStorage(file.storageKey))
  );

  // Delete from DB (cascade removes files)
  await prisma.deviation.deleteMany({
    where: { id: { in: deviationIds } },
  });

  res.json({ success: true, deletedCount: drafts.length });
});

// Batch reschedule deviations
router.post("/batch-reschedule", batchRateLimit, async (req, res) => {
  const { deviationIds, scheduledAt } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, "deviationIds array is required");
  }

  if (!scheduledAt) {
    throw new AppError(400, "scheduledAt is required");
  }

  const scheduledDate = new Date(scheduledAt);
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000); // Current time + 1 hour
  if (scheduledDate < oneHourFromNow) {
    throw new AppError(
      400,
      "Scheduled time must be at least 1 hour in the future"
    );
  }

  // Fetch scheduled deviations only
  const scheduledDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: "scheduled",
    },
    include: { files: true },
  });

  if (scheduledDeviations.length !== deviationIds.length) {
    throw new AppError(400, "Can only reschedule scheduled deviations");
  }

  const updatedDeviations = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const deviation of scheduledDeviations) {
    try {
      // Cancel existing job
      await cancelScheduledDeviation(deviation.id);

      // Generate new jitter (0-300 seconds = 0-5 minutes)
      const jitterSeconds = Math.floor(Math.random() * 301);
      const actualPublishAt = new Date(
        scheduledDate.getTime() + jitterSeconds * 1000
      );

      // Update database FIRST (before scheduling) to avoid race condition
      const updated = await prisma.deviation.update({
        where: { id: deviation.id },
        data: {
          scheduledAt: scheduledDate,
          jitterSeconds,
          actualPublishAt,
          updatedAt: new Date(),
        },
      });

      // Schedule new job AFTER database is updated
      try {
        await scheduleDeviation(
          deviation.id,
          user.id,
          actualPublishAt,
          deviation.uploadMode
        );
      } catch (queueError) {
        // If queueing fails, revert to old schedule or set error
        console.error(
          `[Batch Reschedule] Failed to queue deviation ${deviation.id}:`,
          queueError
        );
        await prisma.deviation.update({
          where: { id: deviation.id },
          data: {
            errorMessage: `Failed to reschedule: ${
              queueError instanceof Error ? queueError.message : "Unknown error"
            }`,
            updatedAt: new Date(),
          },
        });
        throw queueError; // Re-throw to be caught by outer try-catch
      }

      updatedDeviations.push({
        ...updated,
        files: deviation.files,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error(
        `[Batch Reschedule] Failed to reschedule deviation ${deviation.id}:`,
        error
      );
      errors.push({
        id: deviation.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  res.json({
    deviations: updatedDeviations,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: scheduledDeviations.length,
      succeeded: updatedDeviations.length,
      failed: errors.length,
    },
  });
});

// Batch cancel scheduled deviations
router.post("/batch-cancel", batchRateLimit, async (req, res) => {
  const { deviationIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, "deviationIds array is required");
  }

  // Fetch scheduled deviations only
  const scheduledDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: "scheduled",
    },
    include: { files: true },
  });

  if (scheduledDeviations.length !== deviationIds.length) {
    throw new AppError(400, "Can only cancel scheduled deviations");
  }

  const updatedDeviations = [];

  for (const deviation of scheduledDeviations) {
    // Cancel the scheduled job
    await cancelScheduledDeviation(deviation.id);

    // Update status to draft
    const updated = await prisma.deviation.update({
      where: { id: deviation.id },
      data: {
        status: "draft",
        scheduledAt: null,
        jitterSeconds: 0,
        actualPublishAt: null,
        updatedAt: new Date(),
      },
    });

    updatedDeviations.push({
      ...updated,
      files: deviation.files,
      scheduledAt: null,
      actualPublishAt: null,
      publishedAt: null,
      lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  }

  res.json({ deviations: updatedDeviations });
});

// Batch schedule deviations
router.post("/batch-schedule", batchRateLimit, async (req, res) => {
  const { deviationIds, scheduledAt } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, "deviationIds array is required");
  }

  if (!scheduledAt) {
    throw new AppError(400, "scheduledAt is required");
  }

  const scheduledDate = new Date(scheduledAt);
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const maxScheduleTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year max

  if (scheduledDate < oneHourFromNow) {
    throw new AppError(
      400,
      "Scheduled time must be at least 1 hour in the future"
    );
  }

  if (scheduledDate > maxScheduleTime) {
    throw new AppError(400, "Cannot schedule more than 365 days in the future");
  }

  // Fetch draft or failed deviations only
  const schedulableDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
      status: { in: ["draft", "failed"] },
    },
    include: { files: true },
  });

  if (schedulableDeviations.length !== deviationIds.length) {
    throw new AppError(400, "Can only schedule draft or failed deviations");
  }

  // Validate all have files
  for (const deviation of schedulableDeviations) {
    if (!deviation.files || deviation.files.length === 0) {
      throw new AppError(
        400,
        `Deviation ${deviation.id} must have at least one file`
      );
    }
  }

  const updatedDeviations = [];
  const errors: Array<{ id: string; error: string }> = [];

  // Schedule each deviation with error handling
  for (const deviation of schedulableDeviations) {
    try {
      // Generate random jitter (0-300 seconds = 0-5 minutes)
      const jitterSeconds = Math.floor(Math.random() * 301);
      const actualPublishAt = new Date(
        scheduledDate.getTime() + jitterSeconds * 1000
      );

      // Update deviation to scheduled status
      const updated = await prisma.deviation.update({
        where: { id: deviation.id },
        data: {
          status: "scheduled",
          scheduledAt: scheduledDate,
          jitterSeconds,
          actualPublishAt,
          updatedAt: new Date(),
        },
      });

      // Schedule the deviation with BullMQ (uses jobId for idempotency)
      // If this fails, we catch and rollback
      try {
        await scheduleDeviation(
          deviation.id,
          user.id,
          actualPublishAt,
          deviation.uploadMode
        );
      } catch (queueError) {
        // Rollback DB change if queueing failed
        await prisma.deviation.update({
          where: { id: deviation.id },
          data: {
            status: "draft",
            errorMessage: `Failed to schedule: ${
              queueError instanceof Error ? queueError.message : "Unknown error"
            }`,
            updatedAt: new Date(),
          },
        });
        throw queueError; // Re-throw to be caught by outer try-catch
      }

      updatedDeviations.push({
        ...updated,
        files: deviation.files,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error(
        `[Batch Schedule] Failed to schedule deviation ${deviation.id}:`,
        error
      );
      errors.push({
        id: deviation.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  res.json({
    deviations: updatedDeviations,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: schedulableDeviations.length,
      succeeded: updatedDeviations.length,
      failed: errors.length,
    },
  });
});

// Batch publish now
router.post("/batch-publish-now", batchRateLimit, async (req, res) => {
  const { deviationIds } = req.body;
  const user = req.user!;

  if (!Array.isArray(deviationIds) || deviationIds.length === 0) {
    throw new AppError(400, "deviationIds array is required");
  }

  // Fetch deviations that can be published
  const publishableDeviations = await prisma.deviation.findMany({
    where: {
      id: { in: deviationIds },
      userId: user.id,
    },
    include: { files: true },
  });

  if (publishableDeviations.length !== deviationIds.length) {
    throw new AppError(404, "Some deviations not found");
  }

  // Validate all can be published
  for (const deviation of publishableDeviations) {
    if (!["draft", "scheduled", "failed"].includes(deviation.status)) {
      throw new AppError(
        400,
        `Deviation ${deviation.id} cannot be published (status: ${deviation.status})`
      );
    }
    if (!deviation.files || deviation.files.length === 0) {
      throw new AppError(
        400,
        `Deviation ${deviation.id} must have at least one file`
      );
    }
  }

  const updatedDeviations = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const deviation of publishableDeviations) {
    try {
      // Cancel scheduled job if it was scheduled
      if (deviation.status === "scheduled") {
        await cancelScheduledDeviation(deviation.id);
      }

      // Update status to publishing first
      const updated = await prisma.deviation.update({
        where: { id: deviation.id },
        data: {
          status: "publishing",
          updatedAt: new Date(),
        },
      });

      // Queue immediate publish
      try {
        await publishDeviationNow(deviation.id, user.id, deviation.uploadMode);
      } catch (queueError) {
        // If queueing fails, revert status
        console.error(
          `[Batch Publish] Failed to queue deviation ${deviation.id}:`,
          queueError
        );
        await prisma.deviation.update({
          where: { id: deviation.id },
          data: {
            status: deviation.status === "scheduled" ? "scheduled" : "draft",
            errorMessage: `Failed to publish: ${
              queueError instanceof Error ? queueError.message : "Unknown error"
            }`,
            updatedAt: new Date(),
          },
        });
        throw queueError; // Re-throw to be caught by outer try-catch
      }

      updatedDeviations.push({
        ...updated,
        files: deviation.files,
        scheduledAt: updated.scheduledAt?.toISOString() ?? null,
        actualPublishAt: updated.actualPublishAt?.toISOString() ?? null,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
        lastRetryAt: updated.lastRetryAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error(
        `[Batch Publish] Failed to publish deviation ${deviation.id}:`,
        error
      );
      errors.push({
        id: deviation.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  res.json({
    deviations: updatedDeviations,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: publishableDeviations.length,
      succeeded: updatedDeviations.length,
      failed: errors.length,
    },
  });
});

export { router as deviationsRouter };
