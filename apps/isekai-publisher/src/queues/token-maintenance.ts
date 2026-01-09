import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../db/index.js';
import { refreshTokenIfNeeded } from '../lib/deviantart.js';
import {
  sendRefreshTokenWarningEmail,
  sendRefreshTokenExpiredEmail,
} from '../lib/email-service.js';

const redisUrl = process.env.REDIS_URL!;
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

interface TokenMaintenanceJobData {
  type: 'check_expiring_tokens';
}

export const tokenMaintenanceQueue = new Queue<TokenMaintenanceJobData>('token-maintenance', {
  connection,
});

// Schedule daily token maintenance job
export async function scheduleTokenMaintenance() {
  // Remove any existing repeatable jobs first
  const repeatableJobs = await tokenMaintenanceQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await tokenMaintenanceQueue.removeRepeatableByKey(job.key);
  }

  // Run at 2 AM UTC daily
  await tokenMaintenanceQueue.add(
    'check-expiring-tokens',
    { type: 'check_expiring_tokens' },
    {
      repeat: {
        pattern: '0 2 * * *', // Cron: 2 AM daily
      },
      jobId: 'token-maintenance-daily',
    }
  );
  console.log('[Token Maintenance] Scheduled daily token check job at 2 AM UTC');
}

export const tokenMaintenanceWorker = new Worker<TokenMaintenanceJobData>(
  'token-maintenance',
  async (job: Job<TokenMaintenanceJobData>) => {
    console.log('[Token Maintenance] Starting token maintenance check');

    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const eightyDaysFromNow = new Date(now.getTime() + 80 * 24 * 60 * 60 * 1000);

    // Find users whose refresh tokens expire within 80 days
    const usersToCheck = await prisma.user.findMany({
      where: {
        refreshTokenExpiresAt: { lte: eightyDaysFromNow },
      },
      include: {
        deviations: {
          where: { status: 'scheduled' },
        },
      },
    });

    console.log(
      `[Token Maintenance] Found ${usersToCheck.length} users with tokens expiring within 80 days`
    );

    const results = {
      proactiveRefreshSuccess: 0,
      proactiveRefreshFailed: 0,
      warningEmailsSent: 0,
      expiredNotifications: 0,
      scheduledPostsPaused: 0,
    };

    for (const user of usersToCheck) {
      const hasScheduledPosts = user.deviations.length > 0;
      const daysUntilExpiry = Math.floor(
        (user.refreshTokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(
        `[Token Maintenance] Checking user ${user.username} - ${daysUntilExpiry} days until expiry, ${user.deviations.length} scheduled posts`
      );

      // CASE 1: Token already expired - pause scheduled posts and notify
      if (user.refreshTokenExpiresAt <= now) {
        console.warn(`[Token Maintenance] User ${user.username} refresh token expired`);

        if (hasScheduledPosts) {
          // Pause all scheduled posts
          await prisma.deviation.updateMany({
            where: {
              userId: user.id,
              status: 'scheduled',
            },
            data: {
              status: 'draft',
              errorMessage:
                'DeviantArt authentication expired. Please re-connect your account to schedule posts.',
              updatedAt: now,
            },
          });

          results.scheduledPostsPaused += user.deviations.length;
          console.log(
            `[Token Maintenance] Paused ${user.deviations.length} scheduled posts for user ${user.username}`
          );
        }

        // Send notification (if not already sent)
        if (!user.refreshTokenExpiredEmailSent) {
          await sendRefreshTokenExpiredEmail(user, user.deviations.length);
          await prisma.user.update({
            where: { id: user.id },
            data: { refreshTokenExpiredEmailSent: true },
          });
          results.expiredNotifications++;
          console.log(`[Token Maintenance] Sent expiration email to ${user.username}`);
        }

        continue;
      }

      // CASE 2: Token expiring in 60-80 days AND has scheduled posts - proactively refresh
      if (daysUntilExpiry >= 60 && daysUntilExpiry <= 80 && hasScheduledPosts) {
        try {
          console.log(
            `[Token Maintenance] Proactively refreshing token for user ${user.username} (${daysUntilExpiry} days until expiry)`
          );
          await refreshTokenIfNeeded(user);
          results.proactiveRefreshSuccess++;
          console.log(`[Token Maintenance] Successfully refreshed token for user ${user.username}`);
        } catch (error: any) {
          console.error(
            `[Token Maintenance] Failed to refresh token for user ${user.username}:`,
            error.message
          );
          results.proactiveRefreshFailed++;

          // If refresh failed due to expired token, handle it
          if (error.code === 'REFRESH_TOKEN_EXPIRED') {
            console.warn(
              `[Token Maintenance] Proactive refresh failed - token already expired for ${user.username}`
            );

            // Pause scheduled posts
            await prisma.deviation.updateMany({
              where: {
                userId: user.id,
                status: 'scheduled',
              },
              data: {
                status: 'draft',
                errorMessage: 'DeviantArt authentication expired. Please re-connect your account.',
                updatedAt: now,
              },
            });
            results.scheduledPostsPaused += user.deviations.length;

            // Send expiration email
            if (!user.refreshTokenExpiredEmailSent) {
              await sendRefreshTokenExpiredEmail(user, user.deviations.length);
              await prisma.user.update({
                where: { id: user.id },
                data: { refreshTokenExpiredEmailSent: true },
              });
              results.expiredNotifications++;
            }
          }
        }
      }

      // CASE 3: Token expiring in 7-14 days - send warning email
      if (daysUntilExpiry >= 7 && daysUntilExpiry <= 14 && !user.refreshTokenWarningEmailSent) {
        await sendRefreshTokenWarningEmail(user, daysUntilExpiry, user.deviations.length);
        await prisma.user.update({
          where: { id: user.id },
          data: { refreshTokenWarningEmailSent: true },
        });
        results.warningEmailsSent++;
        console.log(
          `[Token Maintenance] Sent warning email to user ${user.username} (${daysUntilExpiry} days until expiry)`
        );
      }
    }

    console.log('[Token Maintenance] Token maintenance completed:', results);
    return results;
  },
  {
    connection,
    concurrency: 1, // Run one at a time
  }
);

// Event handlers
tokenMaintenanceWorker.on('completed', (job, result) => {
  console.log('[Token Maintenance] Job completed:', result);
});

tokenMaintenanceWorker.on('failed', (job, err) => {
  console.error('[Token Maintenance] Job failed:', err.message);
});

tokenMaintenanceWorker.on('error', (err) => {
  console.error('[Token Maintenance] Worker error:', err.message);
});
