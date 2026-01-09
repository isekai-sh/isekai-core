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

import cron from 'node-cron';
import { prisma } from '../db/index.js';
import { scheduleDeviation } from '../queues/deviation-publisher.js';
import { PublisherAlerts } from '../lib/alerting.js';
import type { Deviation, User } from '../db/index.js';

/**
 * Stuck Job Recovery System
 *
 * Recovers deviations stuck in intermediate states due to worker crashes.
 * Runs every 15 minutes to check for jobs stuck > 1 hour.
 *
 * Three recovery scenarios:
 * 1. Ghost publish: Has deviationId but status is 'publishing' → Complete the publish
 * 2. Partial publish: Has stashItemId but no deviationId → Reset and retry
 * 3. Failed upload: No external IDs → Reset to draft
 */

const STUCK_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const BATCH_SIZE = 100; // Process in batches to avoid overwhelming DB

interface DeviationWithUser extends Deviation {
  user: User;
}

/**
 * Release stale locks before recovery
 *
 * Always release the lock before attempting recovery to prevent race conditions.
 * This ensures the job can be re-queued or processed without lock conflicts.
 */
async function releaseStaleLocksForRecovery(deviation: DeviationWithUser): Promise<void> {
  if (deviation.executionLockId) {
    console.log(`[Stuck Job Recovery] Releasing stale lock: ${deviation.executionLockId}`);
    await prisma.deviation.update({
      where: { id: deviation.id },
      data: {
        executionLockId: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Main recovery function - finds and recovers stuck jobs
 */
async function recoverStuckJobs(): Promise<void> {
  const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MS);

  try {
    const stuckDeviations = await prisma.deviation.findMany({
      where: {
        OR: [
          // NEW: Jobs with active lock but stuck > 1 hour
          {
            executionLockId: { not: null },
            executionLockedAt: { lt: cutoffTime },
          },
          // Legacy: Old statuses (backward compatibility during migration period)
          { status: 'uploading', updatedAt: { lt: cutoffTime } },
          { status: 'publishing', updatedAt: { lt: cutoffTime } },
        ],
      },
      include: { user: true },
      take: BATCH_SIZE,
      orderBy: [
        { executionLockedAt: 'asc' }, // Oldest locks first
        { updatedAt: 'asc' }, // Then by updatedAt for legacy cases
      ],
    });

    if (stuckDeviations.length === 0) {
      console.log('[Stuck Job Recovery] No stuck jobs found');
      return;
    }

    console.log(`[Stuck Job Recovery] Found ${stuckDeviations.length} stuck jobs, processing...`);

    let recovered = 0;
    let failed = 0;

    for (const deviation of stuckDeviations as DeviationWithUser[]) {
      try {
        // Check if user still exists (user may have been kicked from instance)
        if (!deviation.user) {
          console.warn(
            `[Stuck Job Recovery] Skipping orphaned deviation for deleted user: ${deviation.id} (userId: ${deviation.userId})`
          );

          // Queue storage cleanup for orphaned files before deleting
          const { queueStorageCleanup } = await import('../queues/storage-cleanup.js');
          await queueStorageCleanup(deviation.id, deviation.userId);

          // Delete orphaned deviation (files already queued for cleanup)
          await prisma.deviation.delete({
            where: { id: deviation.id },
          });

          console.log(`[Stuck Job Recovery] Deleted orphaned deviation: ${deviation.id}`);
          recovered++;
          continue;
        }

        // FIRST: Always release stale lock before recovery
        await releaseStaleLocksForRecovery(deviation);

        // Case 1: Ghost publish - has deviationId but stuck in 'publishing'
        if (deviation.deviationId) {
          await completeGhostPublish(deviation);
          console.log(`[Stuck Job Recovery] Completed ghost publish: ${deviation.id}`);
          recovered++;
        }
        // Case 2: Partial publish - has stashItemId but no deviationId
        else if (deviation.stashItemId && deviation.retryCount < 7) {
          await resetAndRetry(deviation);
          console.log(`[Stuck Job Recovery] Reset and queued retry: ${deviation.id}`);
          recovered++;
        }
        // Case 3: Failed upload - no external IDs
        else {
          await resetToDraft(deviation);
          console.log(`[Stuck Job Recovery] Reset to draft: ${deviation.id}`);
          recovered++;
        }
      } catch (error) {
        console.error(`[Stuck Job Recovery] Failed to recover deviation ${deviation.id}:`, error);
        failed++;
      }
    }

    console.log(`[Stuck Job Recovery] Recovery complete: ${recovered} recovered, ${failed} failed`);

    // Alert if recovery rate is high (indicates systemic issues)
    if (recovered > 0 && recovered / (recovered + failed) > 0.05) {
      await PublisherAlerts.highStuckJobRecoveryRate(
        recovered / (recovered + failed),
        recovered + failed,
        recovered
      );
    }

    // Alert if failure rate is high
    if (failed > 0 && failed / stuckDeviations.length > 0.1) {
      console.error(
        `[Stuck Job Recovery] WARNING: High failure rate ${failed}/${
          stuckDeviations.length
        } (${Math.round((failed / stuckDeviations.length) * 100)}%)`
      );
    }
  } catch (error) {
    console.error('[Stuck Job Recovery] Critical error in recovery process:', error);
  }
}

/**
 * Case 1: Complete a ghost publish
 * The deviation was published to DeviantArt but DB wasn't updated due to crash
 */
async function completeGhostPublish(deviation: DeviationWithUser): Promise<void> {
  console.log(`[Stuck Job Recovery] Completing ghost publish for ${deviation.id}`);

  await prisma.$transaction(async (tx) => {
    // Mark as published
    await tx.deviation.update({
      where: { id: deviation.id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      },
    });

    // Increment counter ONLY if not already done (idempotent with post count guard)
    // Count actual files to determine increment
    const fileCount = await tx.deviationFile.count({
      where: { deviationId: deviation.id },
    });

    const postsIncrement = deviation.uploadMode === 'multiple' ? fileCount : 1;

    // Use updateMany with condition to ensure idempotency
    const incrementResult = await tx.deviation.updateMany({
      where: {
        id: deviation.id,
        postCountIncremented: false, // Guard: only update if flag is false
      },
      data: {
        postCountIncremented: true,
      },
    });

    // Only increment counter if we successfully set the flag
    if (incrementResult.count > 0) {
      // Note: totalPosts tracking removed - add to schema in v0.2.0 if needed
      console.log(`[Stuck Job Recovery] Post count increment skipped (field not in schema)`);
    } else {
      console.log(`[Stuck Job Recovery] Post count already incremented, skipping`);
    }
  });

  // Queue storage cleanup
  const { queueStorageCleanup } = await import('../queues/storage-cleanup.js');
  await queueStorageCleanup(deviation.id, deviation.userId);

  console.log(
    `[Stuck Job Recovery] Ghost publish completed: ${deviation.id} (${deviation.deviationUrl})`
  );
}

/**
 * Case 2: Reset and retry a partial publish
 * The deviation has stashItemId but failed to complete publish
 */
async function resetAndRetry(deviation: DeviationWithUser): Promise<void> {
  console.log(`[Stuck Job Recovery] Resetting stuck job for retry: ${deviation.id}`);

  await prisma.deviation.update({
    where: { id: deviation.id },
    data: {
      status: 'scheduled',
      errorMessage: 'Job was stuck and has been automatically retried',
      updatedAt: new Date(),
    },
  });

  // Re-queue job with 1 minute delay
  const retryAt = new Date(Date.now() + 60000);
  await scheduleDeviation(deviation.id, deviation.userId, retryAt, deviation.uploadMode);

  console.log(`[Stuck Job Recovery] Retry queued for ${deviation.id}`);
}

/**
 * Case 3: Reset to draft
 * The deviation has no external IDs, likely failed during upload
 */
async function resetToDraft(deviation: DeviationWithUser): Promise<void> {
  console.log(`[Stuck Job Recovery] Resetting to draft: ${deviation.id}`);

  await prisma.deviation.update({
    where: { id: deviation.id },
    data: {
      status: 'draft',
      errorMessage: 'Job failed after timeout. Please try scheduling again.',
      updatedAt: new Date(),
    },
  });

  console.log(`[Stuck Job Recovery] Reset to draft: ${deviation.id}`);
}

/**
 * Start the cron job
 * Runs every 15 minutes
 */
export function startStuckJobRecovery(): void {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await recoverStuckJobs();
    } catch (error) {
      console.error('[Stuck Job Recovery] Cron job failed:', error);
    }
  });

  console.log('[Stuck Job Recovery] Cron job started (runs every 15 minutes)');

  // Run once immediately on startup (helpful for catching issues after server restart)
  setTimeout(() => {
    console.log('[Stuck Job Recovery] Running initial recovery check...');
    recoverStuckJobs().catch((error) => {
      console.error('[Stuck Job Recovery] Initial recovery check failed:', error);
    });
  }, 5000); // 5 second delay to allow server to fully start
}
