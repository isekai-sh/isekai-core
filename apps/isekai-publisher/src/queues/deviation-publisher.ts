import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../db/index.js';
import { publishToDeviantArt } from '../lib/deviantart.js';
import type { UploadMode } from '@isekai/shared';
import { publishDeviationJob } from '@isekai/shared';
import { ErrorCategorizer } from '../lib/error-categorizer.js';
import { StructuredLogger } from '../lib/structured-logger.js';
import { AdaptiveRateLimiter } from '../lib/rate-limiter.js';
import { PublisherMetricsCollector } from '../lib/publisher-metrics.js';
import { CircuitBreaker, withCircuitBreaker } from '../lib/circuit-breaker.js';
import { sendRefreshTokenExpiredJobNotification } from '../lib/email-service.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? {
    rejectUnauthorized: false, // Accept self-signed certificates for internal Redis
  } : undefined,
});

export interface DeviationPublishJobData {
  deviationId: string;
  userId: string;
  uploadMode: UploadMode;
}

// Initialize managers
const errorCategorizer = new ErrorCategorizer();
const rateLimiter = new AdaptiveRateLimiter(connection);
const metricsCollector = new PublisherMetricsCollector(connection);

// Custom backoff strategy that respects rate limit Retry-After headers
function calculateBackoff(attemptsMade: number, err: Error): number {
  const errorMessage = err?.message || '';

  // Check if this is a rate limit error with explicit wait time
  if (errorMessage.includes('RATE_LIMITED') || errorMessage.includes('RATE_LIMIT')) {
    // Extract wait time from error message (format: "Wait Xms")
    const match = errorMessage.match(/Wait (\d+)ms/);
    if (match) {
      const waitMs = parseInt(match[1]);
      console.log(`[Backoff] Rate limited - respecting Retry-After: ${waitMs}ms (${Math.round(waitMs / 1000)}s)`);
      return waitMs;
    }
  }

  // Check for circuit breaker open
  if (errorMessage.includes('CIRCUIT_OPEN')) {
    // Wait 30 seconds for circuit breaker to potentially close
    const waitMs = 30000;
    console.log(`[Backoff] Circuit breaker open - waiting ${waitMs}ms`);
    return waitMs;
  }

  // Default exponential backoff for other errors
  // 2s, 4s, 8s, 16s, 32s, 64s (max)
  const exponentialDelay = Math.min(2000 * Math.pow(2, attemptsMade), 64000);
  console.log(`[Backoff] Using exponential backoff: ${exponentialDelay}ms (attempt ${attemptsMade + 1})`);
  return exponentialDelay;
}

// Queue for scheduling deviations
export const deviationPublisherQueue = new Queue<DeviationPublishJobData>('deviation-publisher', {
  connection,
  defaultJobOptions: {
    attempts: parseInt(process.env.PUBLISHER_MAX_ATTEMPTS || '7'),
    backoff: calculateBackoff as any, // BullMQ accepts function for custom backoff
    removeOnComplete: {
      age: 48 * 3600, // Keep completed jobs for 48 hours
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      count: 1000, // Prevent Redis memory exhaustion
    },
  },
});

// Worker to process publishing jobs using shared publisher core
export const deviationPublisherWorker = new Worker<DeviationPublishJobData>(
  'deviation-publisher',
  async (job: Job<DeviationPublishJobData>) => {
    try {
      // Use shared publisher core with Publisher-specific dependencies
      return await publishDeviationJob(job, {
        prisma,
        logger: StructuredLogger,
        rateLimiter,
        metricsCollector,
        CircuitBreaker,
        withCircuitBreaker,
        publishToDeviantArt,
        queueStorageCleanup: async (deviationId: string, userId: string) => {
          const { queueStorageCleanup } = await import('./storage-cleanup.js');
          await queueStorageCleanup(deviationId, userId);
        },
        errorCategorizer,
      });
    } catch (error: any) {
      // Handle refresh token expiration specifically (publisher-specific logic)
      if (error.code === 'REFRESH_TOKEN_EXPIRED' || error.message?.includes('REFRESH_TOKEN_EXPIRED')) {
        const { deviationId, userId } = job.data;
        const logger = StructuredLogger.createJobLogger(job);

        logger.error('Refresh token expired - pausing all scheduled posts for user', {
          userId,
        });

        // Fetch deviation and user for notification
        const deviation = await prisma.deviation.findFirst({
          where: { id: deviationId },
          include: { user: true },
        });

        if (deviation && deviation.user) {
          // Pause ALL scheduled posts for this user (not just this one)
          await prisma.deviation.updateMany({
            where: {
              userId,
              status: 'scheduled',
            },
            data: {
              status: 'draft',
              errorMessage: 'DeviantArt authentication expired. Please re-connect your account to schedule posts.',
              updatedAt: new Date(),
            },
          });

          logger.info('Paused all scheduled posts for user due to token expiration');

          // Send notification email
          await sendRefreshTokenExpiredJobNotification(deviation.user, deviation.title);
        }
      }

      // Re-throw to let shared publisher handle the error
      throw error;
    }
  },
  {
    connection,
    // Lower concurrency to prevent multiple API calls at once
    // DeviantArt rate limits are per OAuth token (per user)
    concurrency: parseInt(process.env.PUBLISHER_CONCURRENCY || '2'),
    // Lock duration (replaces timeout from Queue options)
    lockDuration: parseInt(process.env.PUBLISHER_JOB_TIMEOUT_MS || '1200000'), // 20 minutes
    // Stalled job detection (moved from Queue settings)
    stalledInterval: parseInt(process.env.PUBLISHER_STALE_CHECK_INTERVAL_MS || '60000'),
    maxStalledCount: parseInt(process.env.PUBLISHER_MAX_STALLED_COUNT || '2'),
    limiter: {
      // Limit job pickup rate to space out API calls
      // 2 jobs per second = minimum 500ms between starts
      max: parseInt(process.env.PUBLISHER_LIMITER_MAX || '2'),
      duration: 1000,
    },
  }
);

// Event handlers
deviationPublisherWorker.on('completed', (job, result) => {
  const logger = StructuredLogger.createJobLogger(job);
  logger.info('Job completed successfully', { result });
});

deviationPublisherWorker.on('failed', (job, err) => {
  if (!job) return;
  const logger = StructuredLogger.createJobLogger(job);
  logger.error('Job failed permanently', err);
});

deviationPublisherWorker.on('stalled', (jobId) => {
  console.error(`[Publisher] Job ${jobId} stalled - may be stuck`);
  metricsCollector.recordStalledJob(jobId);
});

deviationPublisherWorker.on('error', (err) => {
  console.error('[Publisher] Worker error:', err);
});

// Periodic metrics logging (every 5 minutes)
setInterval(() => {
  const metrics = metricsCollector.getMetrics('5min');
  console.log('[Publisher] Metrics:', JSON.stringify(metrics, null, 2));
}, 5 * 60 * 1000);

// Helper function to schedule a deviation with jitter
export async function scheduleDeviation(
  deviationId: string,
  userId: string,
  actualPublishAt: Date,
  uploadMode: UploadMode
) {
  const jobId = `deviation-${deviationId}`;

  // Check if job already exists (de-duplication)
  const existingJob = await deviationPublisherQueue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') {
      console.log(`[Deviation Publisher] Job ${jobId} already exists with state ${state}, skipping`);
      return;
    }
    // Remove if completed/failed to allow re-queueing
    await existingJob.remove();
  }

  const delay = actualPublishAt.getTime() - Date.now();

  // All jobs have equal priority (open-source version - no tier system)
  const priority = 5;

  await deviationPublisherQueue.add(
    'publish-deviation',
    { deviationId, userId, uploadMode },
    {
      delay: Math.max(0, delay),
      jobId, // Use deviation ID as job ID for easy cancellation and de-duplication
      priority,
    }
  );

  console.log(`[Deviation Publisher] Scheduled deviation ${deviationId} for ${actualPublishAt.toISOString()} (${uploadMode} mode, priority ${priority})`);
}

// Helper function to publish immediately
export async function publishDeviationNow(
  deviationId: string,
  userId: string,
  uploadMode: UploadMode
) {
  const jobId = `deviation-${deviationId}`;

  // Check if job already exists (de-duplication)
  const existingJob = await deviationPublisherQueue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === 'waiting' || state === 'delayed' || state === 'active') {
      console.log(`[Deviation Publisher] Job ${jobId} already exists with state ${state}, skipping`);
      return;
    }
    // Remove if completed/failed to allow re-queueing
    await existingJob.remove();
  }

  // All jobs have equal priority (open-source version - no tier system)
  const priority = 5;

  await deviationPublisherQueue.add(
    'publish-deviation',
    { deviationId, userId, uploadMode },
    {
      jobId, // Use deviation ID as job ID for de-duplication
      priority,
    }
  );

  console.log(`[Deviation Publisher] Queued deviation ${deviationId} for immediate publishing (${uploadMode} mode, priority ${priority})`);
}

// Helper function to cancel a scheduled deviation
export async function cancelScheduledDeviation(deviationId: string) {
  const jobId = `deviation-${deviationId}`;
  const job = await deviationPublisherQueue.getJob(jobId);

  if (job) {
    await job.remove();
    console.log(`[Deviation Publisher] Cancelled scheduled deviation ${deviationId}`);
    return true;
  }

  console.log(`[Deviation Publisher] No scheduled job found for deviation ${deviationId}`);
  return false;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Publisher] Shutting down worker gracefully...');

  // Stop accepting new jobs
  await deviationPublisherWorker.pause();

  // Wait for active jobs to complete (max 30s)
  const activeJobs = await deviationPublisherQueue.getJobs(['active']);
  if (activeJobs.length > 0) {
    console.log(`[Publisher] Waiting for ${activeJobs.length} active jobs to complete...`);
    await Promise.race([
      Promise.all(activeJobs.map(job => job.waitUntilFinished(new QueueEvents(deviationPublisherQueue.name, { connection })))),
      new Promise(resolve => setTimeout(resolve, 30000)),
    ]);
  }

  // Shutdown metrics collector
  await metricsCollector.shutdown();

  // Close worker and connections
  await deviationPublisherWorker.close();
  await deviationPublisherQueue.close();
  await connection.quit();

  console.log('[Publisher] Shutdown complete');
  process.exit(0);
});
