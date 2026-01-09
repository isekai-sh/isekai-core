import cron from 'node-cron';
import { prisma } from '../db/index.js';
import { deviationPublisherQueue, scheduleDeviation } from '../queues/deviation-publisher.js';

/**
 * Past Due Recovery System
 *
 * Recovers deviations that are stuck in 'scheduled' status past their publish time.
 * This happens when:
 * - BullMQ job queueing fails (Redis timeout, network error)
 * - Worker crashes before job is processed
 * - Jobs are lost from queue for any reason
 *
 * Runs every 10 minutes to check for scheduled items past their actualPublishAt time.
 */

const PAST_DUE_GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes grace period
const BATCH_SIZE = 100; // Process in batches to avoid overwhelming DB
const MAX_RETRY_COUNT = 7; // Don't retry items that have failed too many times

/**
 * Main recovery function - finds and re-queues past due scheduled deviations
 */
async function recoverPastDueDeviations(): Promise<void> {
  const cutoffTime = new Date(Date.now() - PAST_DUE_GRACE_PERIOD_MS);

  try {
    // Find deviations that should have been published but are still scheduled
    const pastDueDeviations = await prisma.deviation.findMany({
      where: {
        status: 'scheduled',
        actualPublishAt: { lt: cutoffTime },
        // Don't recover items that have been retried too many times
        retryCount: { lt: MAX_RETRY_COUNT },
        // Don't recover actively locked jobs (avoid interfering with running workers)
        OR: [
          { executionLockId: null },
          { executionLockedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }, // 10-min stale
        ],
      },
      include: { user: true },
      take: BATCH_SIZE,
      orderBy: { actualPublishAt: 'asc' }, // Oldest first
    });

    if (pastDueDeviations.length === 0) {
      console.log('[Past Due Recovery] No past due deviations found');
      return;
    }

    console.log(
      `[Past Due Recovery] Found ${pastDueDeviations.length} past due deviations, checking queue status...`
    );

    let recovered = 0;
    let alreadyQueued = 0;
    let failed = 0;

    for (const deviation of pastDueDeviations) {
      try {
        // Check if job already exists in queue
        const jobId = `deviation-${deviation.id}`;
        const existingJob = await deviationPublisherQueue.getJob(jobId);

        if (existingJob) {
          // Job exists in queue, check its state and attempts
          const jobState = await existingJob.getState();
          const attemptsMade = existingJob.attemptsMade;

          if (jobState === 'completed' || jobState === 'failed') {
            // Job completed/failed but DB not updated - this is a stuck state
            // Remove the old job and re-queue
            await existingJob.remove();
            await reQueueDeviation(deviation);
            recovered++;
            console.log(
              `[Past Due Recovery] Re-queued deviation ${deviation.id} (old job state: ${jobState})`
            );
          } else if ((jobState === 'waiting' || jobState === 'delayed') && attemptsMade >= 2) {
            // Job has burned attempts (likely due to infrastructure issues) - reset it
            // This prevents jobs from silently failing after schema bugs, network issues, etc.
            await existingJob.remove();
            await reQueueDeviation(deviation);
            recovered++;
            console.log(
              `[Past Due Recovery] Reset job with ${attemptsMade} burned attempts (state: ${jobState}) - deviation ${deviation.id}`
            );
          } else if (jobState === 'active' && attemptsMade >= 4) {
            // Active job with high attempts - log warning but let it finish
            // It might succeed, and we don't want to interfere with active processing
            alreadyQueued++;
            console.warn(
              `[Past Due Recovery] Job ${deviation.id} is active but has ${attemptsMade} attempts - monitoring`
            );
          } else {
            // Job is processing normally
            alreadyQueued++;
            console.log(
              `[Past Due Recovery] Deviation ${deviation.id} already in queue (state: ${jobState}, attempts: ${attemptsMade}), skipping`
            );
          }
        } else {
          // No job found - this is the main recovery case
          await reQueueDeviation(deviation);
          recovered++;
          console.log(`[Past Due Recovery] Re-queued deviation ${deviation.id} (no job found)`);
        }
      } catch (error) {
        console.error(`[Past Due Recovery] Failed to recover deviation ${deviation.id}:`, error);
        failed++;

        // Update deviation with error message
        try {
          await prisma.deviation.update({
            where: { id: deviation.id },
            data: {
              errorMessage: `Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              updatedAt: new Date(),
            },
          });
        } catch (updateError) {
          console.error(
            `[Past Due Recovery] Failed to update error message for ${deviation.id}:`,
            updateError
          );
        }
      }
    }

    console.log(
      `[Past Due Recovery] Recovery complete: ${recovered} recovered, ${alreadyQueued} already queued, ${failed} failed`
    );

    // Alert if recovery rate is high (indicates systemic issues)
    if (recovered > 10) {
      console.error(
        `[Past Due Recovery] WARNING: High recovery rate ${recovered}/${pastDueDeviations.length} (${Math.round((recovered / pastDueDeviations.length) * 100)}%) - indicates systemic issues`
      );
    }

    // Alert if failure rate is high
    if (failed > 0 && failed / pastDueDeviations.length > 0.1) {
      console.error(
        `[Past Due Recovery] WARNING: High failure rate ${failed}/${pastDueDeviations.length} (${Math.round((failed / pastDueDeviations.length) * 100)}%)`
      );
    }
  } catch (error) {
    console.error('[Past Due Recovery] Critical error in recovery process:', error);
  }
}

/**
 * Re-queue a deviation for immediate publishing
 */
async function reQueueDeviation(deviation: any): Promise<void> {
  // Update deviation to indicate it's being retried and reset retry count
  // This gives the job a fresh start with all 7 attempts available
  await prisma.deviation.update({
    where: { id: deviation.id },
    data: {
      retryCount: 0, // Reset retry counter for fresh start
      errorMessage: 'Scheduled job was lost and has been automatically recovered',
      updatedAt: new Date(),
    },
  });

  // Queue with 1 minute delay to avoid overwhelming the system
  const retryAt = new Date(Date.now() + 60000);
  await scheduleDeviation(deviation.id, deviation.userId, retryAt, deviation.uploadMode);
}

/**
 * Start the cron job
 * Runs every 10 minutes
 */
export function startPastDueRecovery(): void {
  // Run every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      await recoverPastDueDeviations();
    } catch (error) {
      console.error('[Past Due Recovery] Cron job failed:', error);
    }
  });

  console.log('[Past Due Recovery] Cron job started (runs every 10 minutes)');

  // Run once immediately on startup (helpful for catching issues after server restart)
  setTimeout(() => {
    console.log('[Past Due Recovery] Running initial recovery check...');
    recoverPastDueDeviations().catch((error) => {
      console.error('[Past Due Recovery] Initial recovery check failed:', error);
    });
  }, 10000); // 10 second delay to allow server to fully start
}

/**
 * Manually run recovery (for testing or manual intervention)
 */
export async function runPastDueRecovery(): Promise<void> {
  await recoverPastDueDeviations();
}
