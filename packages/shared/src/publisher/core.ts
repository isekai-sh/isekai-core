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

import type { Job } from 'bullmq';
import type {
  PublisherDependencies,
  DeviationPublishJobData,
  PublishJobResult,
  DeviationWithRelations,
} from './types.js';

/**
 * Acquire execution lock using optimistic locking
 *
 * Prevents concurrent execution of the same deviation publish job across multiple workers.
 * Uses updateMany with conditional WHERE clause to ensure atomic lock acquisition.
 *
 * @param deviationId - ID of the deviation to lock
 * @param lockId - Unique lock identifier (typically job.id + timestamp)
 * @param prisma - Prisma client instance
 * @returns true if lock acquired, false if already locked by another worker
 */
async function acquireExecutionLock(
  deviationId: string,
  lockId: string,
  prisma: any
): Promise<boolean> {
  try {
    // Use optimistic locking - increment version and set lock atomically
    const result = await prisma.deviation.updateMany({
      where: {
        id: deviationId,
        OR: [
          { executionLockId: null }, // No lock exists
          { executionLockedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } }, // Stale lock (30 min)
        ],
      },
      data: {
        executionLockId: lockId,
        executionLockedAt: new Date(),
        executionVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  } catch (error) {
    console.error('[Lock] Failed to acquire execution lock:', error);
    return false;
  }
}

/**
 * Release execution lock
 *
 * Removes the lock held by this worker. Only releases if we own the lock (lockId matches).
 * Safe to call even if lock doesn't exist or is owned by another worker.
 *
 * @param deviationId - ID of the deviation to unlock
 * @param lockId - Lock identifier to verify ownership
 * @param prisma - Prisma client instance
 */
async function releaseExecutionLock(
  deviationId: string,
  lockId: string,
  prisma: any
): Promise<void> {
  try {
    await prisma.deviation.updateMany({
      where: {
        id: deviationId,
        executionLockId: lockId, // Only release if we own the lock
      },
      data: {
        executionLockId: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[Lock] Failed to release execution lock:', error);
    // Non-fatal - stale lock cleanup will handle this
  }
}

/**
 * Automatically create sale queue entry if automation has it enabled
 *
 * This function is called after successful deviation publish to create a sale queue
 * entry when the automation has auto-add-to-sale-queue enabled.
 *
 * @param deviation - The deviation that was published
 * @param tx - Prisma transaction client
 * @param logger - Logger instance
 */
async function autoCreateSaleQueue(deviation: any, tx: any, logger: any): Promise<void> {
  // Only proceed if scheduled by automation
  if (!deviation.automationId) {
    return;
  }

  // Skip if Sta.sh-only
  if (deviation.stashOnly) {
    logger.info('Skipping sale queue - Sta.sh only mode', {
      deviationId: deviation.id,
    });
    return;
  }

  try {
    // Fetch automation with preset
    const automation = await tx.automation.findUnique({
      where: { id: deviation.automationId },
      include: { saleQueuePreset: true },
    });

    // Check if sale queue is enabled
    if (!automation?.autoAddToSaleQueue || !automation.saleQueuePresetId) {
      return;
    }

    const preset = automation.saleQueuePreset;
    if (!preset) {
      logger.warn('Sale queue preset not found', {
        automationId: automation.id,
        presetId: automation.saleQueuePresetId,
      });
      return;
    }

    // Calculate final price (always INT in cents)
    let finalPrice: number;
    if (preset.minPrice !== null && preset.maxPrice !== null) {
      // Random price within range - use Math.floor to ensure INT
      const range = preset.maxPrice - preset.minPrice;
      finalPrice = preset.minPrice + Math.floor(Math.random() * (range + 1));
      logger.info('Using random price', {
        minPrice: preset.minPrice,
        maxPrice: preset.maxPrice,
        finalPrice,
      });
    } else {
      // Fixed price
      finalPrice = preset.price;
      logger.info('Using fixed price', { finalPrice });
    }

    // Create sale queue entry with calculated price
    await tx.saleQueue.create({
      data: {
        userId: deviation.userId,
        deviationId: deviation.id,
        pricePresetId: preset.id,
        price: finalPrice,
        status: 'pending',
      },
    });

    logger.info('Created sale queue entry', {
      deviationId: deviation.id,
      presetId: preset.id,
      finalPrice,
    });
  } catch (error: any) {
    // Handle duplicate (unique constraint on deviationId)
    if (error.code === 'P2002') {
      logger.info('Sale queue entry already exists', {
        deviationId: deviation.id,
      });
      return;
    }

    // Log error but don't fail the publish
    logger.warn('Failed to create sale queue entry', {
      error: error.message,
      deviationId: deviation.id,
    });
  }
}

/**
 * Core deviation publishing job logic
 *
 * This function contains the shared publishing logic used by both
 * the backend service and the standalone publisher service.
 *
 * @param job - BullMQ job containing deviation publish data
 * @param deps - Dependencies injected by the calling service
 * @returns Result indicating success/failure and published deviation info
 */
export async function publishDeviationJob(
  job: Job<DeviationPublishJobData>,
  deps: PublisherDependencies
): Promise<PublishJobResult> {
  const { deviationId, userId, uploadMode } = job.data;
  const attemptNumber = job.attemptsMade + 1;
  const logger = deps.logger.createJobLogger(job);
  const startTime = Date.now();

  // STEP 0: Acquire execution lock (CRITICAL - prevents concurrent execution)
  const lockId = `${job.id}-${Date.now()}`;
  const lockAcquired = await acquireExecutionLock(deviationId, lockId, deps.prisma);

  if (!lockAcquired) {
    logger.warn('Failed to acquire execution lock - job already running elsewhere', {
      deviationId,
      lockId,
    });
    // This is NOT an error - just means another worker is handling it
    // Return success to prevent retry
    return {
      success: true,
      alreadyRunning: true,
      results: [],
    };
  }

  logger.info('Acquired execution lock', { lockId });

  try {
    logger.info('Starting deviation publish job', {
      uploadMode,
      maxAttempts: job.opts.attempts,
      lockId,
    });

    deps.metricsCollector.recordJobStart(job.id!, deviationId);

    // STEP 1: Rate Limit Check (circuit breaker and rate limiter)
    const circuitKey = `deviantart:publish:${userId}`;
    const circuitAllowed = await deps.CircuitBreaker.shouldAllowRequest(circuitKey);

    if (!circuitAllowed) {
      logger.warn('Circuit breaker is open, deferring job');
      throw new Error('CIRCUIT_OPEN: Circuit breaker is open for this user');
    }

    const rateLimitCheck = await deps.rateLimiter.shouldAllowRequest(userId);
    if (!rateLimitCheck.allowed) {
      logger.warn('Rate limit active, will retry', {
        waitMs: rateLimitCheck.waitMs,
        reason: rateLimitCheck.reason,
      });
      throw new Error(`RATE_LIMITED: Wait ${rateLimitCheck.waitMs}ms - ${rateLimitCheck.reason}`);
    }

    // STEP 2: Update retry tracking in database
    // Note: Status stays 'scheduled' until publish succeeds (atomic update after API call)
    await deps.prisma.deviation.update({
      where: { id: deviationId },
      data: {
        retryCount: attemptNumber - 1,
        lastRetryAt: new Date(),
        // Status NOT updated here - remains 'scheduled' until DeviantArt API succeeds
        updatedAt: new Date(),
      },
    });

    // Fetch deviation with files and user data
    const deviation = (await deps.prisma.deviation.findFirst({
      where: { id: deviationId },
      include: {
        files: true,
        user: true,
      },
    })) as DeviationWithRelations | null;

    if (!deviation) {
      throw new Error(`Deviation ${deviationId} not found`);
    }

    if (!deviation.user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!deviation.files || deviation.files.length === 0) {
      throw new Error(`Deviation ${deviationId} has no files`);
    }

    try {
      // STEP 3: Idempotency check - prevent duplicate publish on retry
      if (deviation.status === 'published' && deviation.deviationId) {
        logger.info('Deviation already published, skipping', {
          deviationId: deviation.deviationId,
          deviationUrl: deviation.deviationUrl,
        });
        return {
          success: true,
          alreadyPublished: true,
          results: [
            {
              deviationId: deviation.deviationId,
              url: deviation.deviationUrl!,
            },
          ],
        };
      }

      // STEP 3.5: Check for Sta.sh-only mode (only submit to Sta.sh, don't publish)
      if (deviation.stashOnly && deviation.stashItemId) {
        // Already submitted to Sta.sh, mark as "published" (but only in Sta.sh)
        logger.info('Deviation already in Sta.sh (Sta.sh-only mode), skipping publish', {
          stashItemId: deviation.stashItemId,
        });

        await deps.prisma.deviation.update({
          where: { id: deviationId },
          data: {
            status: 'published',
            publishedAt: new Date(),
            errorMessage: null,
            postCountIncremented: true,
            updatedAt: new Date(),
          },
        });

        // Post count tracking removed (open-source version)

        return {
          success: true,
          alreadyPublished: true,
          results: [{ deviationId: deviation.stashItemId, url: '' }],
        };
      }

      // STEP 4: Publish to DeviantArt with circuit breaker wrapper (EXTERNAL API - cannot rollback)
      // Note: Status remains 'scheduled' until transaction completes after successful API call
      // For Sta.sh-only mode, this will only submit to Sta.sh and not publish
      logger.info(
        deviation.stashOnly ? 'Submitting to Sta.sh (Sta.sh-only mode)' : 'Publishing to DeviantArt'
      );
      const result = await deps.withCircuitBreaker(
        circuitKey,
        async () => {
          return await deps.publishToDeviantArt(deviation, deviation.user, uploadMode);
        },
        async () => {
          throw new Error('CIRCUIT_OPEN: Circuit breaker fallback triggered');
        }
      );

      // Handle single result (single mode) or array of results (multiple mode)
      const results = Array.isArray(result) ? result : [result];

      // For simplicity, store the first deviation URL/ID
      // In multiple mode, each file creates a separate deviation on DeviantArt
      const primaryResult = results[0];

      // STEP 5: Atomic post-publish updates (CRITICAL - prevents ghost posts and double-counting)
      await deps.prisma.$transaction(async (tx) => {
        // 5a. Mark as published with DeviantArt IDs
        // For Sta.sh-only mode, only stashItemId is set (deviationId and URL remain null)
        await tx.deviation.update({
          where: { id: deviationId },
          data: {
            status: 'published',
            publishedAt: new Date(),
            ...(deviation.stashOnly
              ? {
                  // Sta.sh-only mode: store stash item ID
                  stashItemId: primaryResult.deviationId, // The result contains stashItemId in deviationId field
                }
              : {
                  // Normal mode: store deviation ID and URL
                  deviationId: primaryResult.deviationId,
                  deviationUrl: primaryResult.url,
                }),
            errorMessage: null,
            postCountIncremented: true, // NEW: Mark post count as incremented
            updatedAt: new Date(),
          },
        });

        // 5b. Increment user's posts count ONLY if not already incremented (idempotent)
        const postsIncrement = uploadMode === 'multiple' ? deviation.files.length : 1;

        // Use updateMany with condition to ensure idempotency
        const incrementResult = await tx.deviation.updateMany({
          where: {
            id: deviationId,
            postCountIncremented: false, // Guard: only update if flag is false
          },
          data: {
            postCountIncremented: true,
          },
        });

        // Post count tracking removed (open-source version)

        // 5c. Auto-create sale queue if automation enabled it
        await autoCreateSaleQueue(deviation, tx, logger);
      });

      // STEP 6: Queue storage cleanup (fire-and-forget, separate queue with retries)
      // Don't fail the job if storage cleanup queueing fails - the deviation is already published
      try {
        await deps.queueStorageCleanup(deviationId, userId);
      } catch (cleanupError) {
        logger.warn(
          'Failed to queue storage cleanup - will not retry, files will remain in storage',
          {
            cleanupError: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
            deviationId,
          }
        );
      }

      // Record success
      await deps.rateLimiter.recordSuccess(userId);

      const latencyMs = Date.now() - startTime;
      deps.metricsCollector.recordJobSuccess(job.id!, latencyMs);

      logger.info('Successfully published deviation', {
        deviationUrl: primaryResult.url,
        latencyMs,
        uploadMode,
      });

      return {
        success: true,
        results,
      };
    } catch (error: any) {
      // STEP 7: Enhanced Error Handling
      const categorized = deps.errorCategorizer.categorize(error);
      const latencyMs = Date.now() - startTime;

      logger.error('Failed to publish deviation', error, {
        errorCategory: categorized.category,
        isRetryable: categorized.isRetryable,
        latencyMs,
        username: deviation.user?.username,
        deviationTitle: deviation.title,
        scheduledTime: deviation.scheduledAt?.toISOString(),
      });

      deps.metricsCollector.recordJobFailure(job.id!, categorized, latencyMs);

      // Handle specific error categories
      if (categorized.category === 'RATE_LIMIT') {
        const retryAfter = error.retryAfter;
        await deps.rateLimiter.recordFailure(userId, retryAfter);
        deps.metricsCollector.recordRateLimitHit(
          userId,
          retryAfter ? parseInt(retryAfter) * 1000 : 60000
        );
      }

      // Check if we should retry
      const isFinalAttempt = attemptNumber >= (job.opts.attempts || 7);

      if (isFinalAttempt) {
        // Update deviation back to draft after all retries so user can try again
        await deps.prisma.deviation.update({
          where: { id: deviationId },
          data: {
            status: 'draft',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          },
        });

        logger.error('Job failed after all retries, status reset to draft');
      } else {
        // Reset to scheduled status for retry
        await deps.prisma.deviation.update({
          where: { id: deviationId },
          data: {
            status: 'scheduled',
            errorMessage: categorized.errorContext.message,
            updatedAt: new Date(),
          },
        });

        logger.info('Job will retry', {
          nextAttempt: attemptNumber + 1,
          maxAttempts: job.opts.attempts,
        });
      }

      throw error; // Re-throw to trigger BullMQ retry
    }
  } finally {
    // ALWAYS release lock, even on error
    await releaseExecutionLock(deviationId, lockId, deps.prisma);
    logger.info('Released execution lock', { lockId });
  }
}
