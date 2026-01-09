import cron from 'node-cron';
import * as dateFnsTz from 'date-fns-tz';
import {
  prisma,
  Automation,
  AutomationScheduleRule,
  AutomationDefaultValue,
  Deviation,
} from '../db/index.js';
import { scheduleDeviation } from '../queues/deviation-publisher.js';

/**
 * Auto-Scheduler System
 *
 * Automatically schedules draft deviations based on user-defined automation rules.
 * Runs every 5 minutes to check for automations that should trigger.
 *
 * Features:
 * - Multiple scheduling patterns (fixed_time, fixed_interval, daily_quota)
 * - Draft selection methods (random, FIFO, LIFO)
 * - Default value application
 * - Execution logging for debugging
 */

interface AutomationWithRelations extends Automation {
  scheduleRules: AutomationScheduleRule[];
  defaultValues: AutomationDefaultValue[];
  user: {
    id: string;
    timezone: string;
  };
}

/**
 * Main auto-scheduler function
 */
async function runAutoScheduler(): Promise<void> {
  console.log('[Auto-Scheduler] Running scheduled check...');

  try {
    // 1. Find all enabled automations with active rules
    const automations = await prisma.automation.findMany({
      where: { enabled: true },
      include: {
        user: {
          select: {
            id: true,
            timezone: true,
          },
        },
        scheduleRules: {
          where: { enabled: true },
          orderBy: { priority: 'asc' },
        },
        defaultValues: true,
        saleQueuePreset: true,
      },
    });

    if (automations.length === 0) {
      console.log('[Auto-Scheduler] No enabled automations found');
      return;
    }

    console.log(`[Auto-Scheduler] Found ${automations.length} enabled automation(s)`);

    // 2. Process each automation
    for (const automation of automations) {
      try {
        await processAutomation(automation as AutomationWithRelations);
      } catch (error) {
        console.error(`[Auto-Scheduler] Failed to process automation ${automation.id}:`, error);
        await logExecution(
          automation.id,
          0,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    console.log('[Auto-Scheduler] Scheduled check complete');
  } catch (error) {
    console.error('[Auto-Scheduler] Critical error in scheduler:', error);
  }
}

/**
 * Process a single automation with idempotency lock
 */
async function processAutomation(automation: AutomationWithRelations): Promise<void> {
  console.log(
    `[Auto-Scheduler] Processing automation ${automation.id} for user ${automation.userId}`
  );

  // 1. Try to acquire execution lock (with 5-minute timeout)
  const lockTimeout = 5 * 60 * 1000; // 5 minutes
  const lockCutoff = new Date(Date.now() - lockTimeout);

  const lockAcquired = await prisma.automation.updateMany({
    where: {
      id: automation.id,
      OR: [
        { isExecuting: false },
        { lastExecutionLock: null },
        { lastExecutionLock: { lt: lockCutoff } }, // Lock expired
      ],
    },
    data: {
      isExecuting: true,
      lastExecutionLock: new Date(),
    },
  });

  if (lockAcquired.count === 0) {
    console.log(`[Auto-Scheduler] Automation ${automation.id} is already executing, skipping`);
    return;
  }

  try {
    // 2. Evaluate which rules should trigger now (using user's timezone)
    const userTimezone = automation.user.timezone || 'UTC';
    const rulesToExecute = await evaluateScheduleRules(
      automation.scheduleRules,
      automation.id,
      userTimezone
    );

    if (rulesToExecute.length === 0) {
      console.log(`[Auto-Scheduler] No rules triggered for automation ${automation.id}`);
      return;
    }

    console.log(`[Auto-Scheduler] ${rulesToExecute.length} rule(s) triggered`);

    // 3. Calculate how many deviations to schedule
    const countToSchedule = calculateScheduleCount(rulesToExecute);

    if (countToSchedule === 0) {
      console.log(`[Auto-Scheduler] No deviations to schedule (count: 0)`);
      return;
    }

    console.log(`[Auto-Scheduler] Will schedule ${countToSchedule} deviation(s)`);

    // 4. Select drafts
    const drafts = await selectDrafts(automation, countToSchedule);

    if (drafts.length === 0) {
      console.log(`[Auto-Scheduler] No drafts available for user ${automation.userId}`);
      await logExecution(automation.id, 0, 'No drafts available');
      return;
    }

    console.log(`[Auto-Scheduler] Selected ${drafts.length} draft(s)`);

    // 5. Schedule each draft
    let scheduled = 0;
    for (const draft of drafts) {
      try {
        await scheduleDraft(draft, automation);
        scheduled++;
      } catch (error) {
        console.error(`[Auto-Scheduler] Failed to schedule draft ${draft.id}:`, error);
      }
    }

    // 6. Log execution
    await logExecution(automation.id, scheduled, null, rulesToExecute[0].type);
    console.log(
      `[Auto-Scheduler] Successfully scheduled ${scheduled}/${drafts.length} deviation(s)`
    );
  } catch (error) {
    console.error(`[Auto-Scheduler] Error processing automation ${automation.id}:`, error);
    throw error;
  } finally {
    // 7. Always release lock
    await prisma.automation.update({
      where: { id: automation.id },
      data: {
        isExecuting: false,
        lastExecutionLock: null,
      },
    });
  }
}

/**
 * Evaluate which schedule rules should trigger based on current time
 * Uses user's timezone for time and day calculations
 */
async function evaluateScheduleRules(
  rules: AutomationScheduleRule[],
  automationId: string,
  userTimezone: string
): Promise<AutomationScheduleRule[]> {
  // Get current time in user's timezone
  const nowInUserTz = dateFnsTz.toZonedTime(new Date(), userTimezone);
  const currentTime = `${nowInUserTz.getHours().toString().padStart(2, '0')}:${nowInUserTz.getMinutes().toString().padStart(2, '0')}`;
  const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    nowInUserTz.getDay()
  ];

  const triggeredRules: AutomationScheduleRule[] = [];

  for (const rule of rules) {
    // Check day of week filter if set (using user's timezone)
    if (rule.daysOfWeek) {
      const daysArray = rule.daysOfWeek as string[];
      if (!daysArray.includes(currentDay)) {
        continue; // Skip this rule, not the right day
      }
    }

    if (rule.type === 'fixed_time') {
      // Check if current time matches timeOfDay (within 5-minute window, in user's timezone)
      if (rule.timeOfDay && isTimeMatch(currentTime, rule.timeOfDay)) {
        triggeredRules.push(rule);
      }
    } else if (rule.type === 'fixed_interval') {
      // Check if enough time has elapsed since last execution
      const lastExecution = await getLastExecutionForRule(automationId, rule.type);
      if (!lastExecution || hasIntervalElapsed(lastExecution, rule.intervalMinutes!)) {
        triggeredRules.push(rule);
      }
    } else if (rule.type === 'daily_quota') {
      // Check if we need to schedule more today (using user's timezone)
      if (await shouldScheduleForDailyQuota(automationId, rule.dailyQuota!, userTimezone)) {
        triggeredRules.push(rule);
      }
    }
  }

  return triggeredRules;
}

/**
 * Check if current time is past the target time within a safe window.
 */
function isTimeMatch(currentTime: string, targetTime: string): boolean {
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  const [targetHour, targetMinute] = targetTime.split(':').map(Number);

  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const targetTotalMinutes = targetHour * 60 + targetMinute;

  // Check if the target time has passed within a reasonable window.
  // The cron job runs every 5 minutes. We allow a 7-minute window
  // to account for small scheduler delays, preventing missed jobs.
  // We also ensure we don't run jobs scheduled for the future (minutesSinceTarget >= 0).
  const minutesSinceTarget = currentTotalMinutes - targetTotalMinutes;
  return minutesSinceTarget >= 0 && minutesSinceTarget < 7;
}

/**
 * Get last execution time for a specific rule type
 */
async function getLastExecutionForRule(
  automationId: string,
  ruleType: string
): Promise<Date | null> {
  const lastLog = await prisma.automationExecutionLog.findFirst({
    where: {
      automationId,
      triggeredByRuleType: ruleType,
    },
    orderBy: { executedAt: 'desc' },
  });

  return lastLog?.executedAt || null;
}

/**
 * Check if interval has elapsed since last execution
 */
function hasIntervalElapsed(lastExecution: Date, intervalMinutes: number): boolean {
  const now = new Date();
  const elapsedMinutes = (now.getTime() - lastExecution.getTime()) / (1000 * 60);
  return elapsedMinutes >= intervalMinutes;
}

/**
 * Check if we should schedule more deviations for daily quota
 * Uses user's timezone to determine "today"
 */
async function shouldScheduleForDailyQuota(
  automationId: string,
  dailyQuota: number,
  userTimezone: string
): Promise<boolean> {
  // Get current time in user's timezone
  const nowInUserTz = dateFnsTz.toZonedTime(new Date(), userTimezone);

  // Get start of today in user's timezone
  const todayInUserTz = new Date(nowInUserTz);
  todayInUserTz.setHours(0, 0, 0, 0);

  // Convert back to UTC for database query
  const todayUtc = dateFnsTz.fromZonedTime(todayInUserTz, userTimezone);

  // Count how many we've scheduled today (in user's timezone)
  const scheduledToday = await prisma.automationExecutionLog.aggregate({
    where: {
      automationId,
      triggeredByRuleType: 'daily_quota',
      executedAt: { gte: todayUtc },
    },
    _sum: {
      scheduledCount: true,
    },
  });

  const totalScheduledToday = scheduledToday._sum.scheduledCount || 0;
  return totalScheduledToday < dailyQuota;
}

/**
 * Calculate how many deviations to schedule based on triggered rules
 */
function calculateScheduleCount(rules: AutomationScheduleRule[]): number {
  let count = 0;

  for (const rule of rules) {
    if (rule.type === 'fixed_time') {
      count += 1; // Schedule 1 per fixed time trigger
    } else if (rule.type === 'fixed_interval') {
      count += rule.deviationsPerInterval || 1;
    } else if (rule.type === 'daily_quota') {
      // For daily quota, schedule 1 at a time to spread throughout the day
      count += 1;
    }
  }

  return count;
}

/**
 * Select drafts based on automation's selection method
 *
 * IMPORTANT: Uses optimistic locking to prevent race conditions.
 * Each draft is atomically selected and marked as locked using executionVersion.
 * This ensures multiple workflows cannot schedule the same draft.
 */
async function selectDrafts(
  automation: AutomationWithRelations,
  count: number
): Promise<Deviation[]> {
  const selected: Deviation[] = [];

  let candidates: any[];

  if (automation.draftSelectionMethod === 'random') {
    // For random selection, fetch a large pool from ALL available drafts
    // Use a pool of up to 1000 drafts to ensure true randomness across entire draft library
    const poolSize = 1000;

    // Fetch large pool of candidates
    const allCandidates = await prisma.deviation.findMany({
      where: {
        userId: automation.userId,
        status: 'draft' as const,
        scheduledAt: null, // Not already scheduled
        files: { some: {} }, // Must have at least one file
      },
      take: poolSize,
      include: {
        files: true,
      },
    });

    // Shuffle the entire pool for true random selection
    candidates = shuffle(allCandidates);
  } else {
    // For FIFO/LIFO, use ordered selection
    const orderBy =
      automation.draftSelectionMethod === 'lifo'
        ? { createdAt: 'desc' as const }
        : { createdAt: 'asc' as const };

    candidates = await prisma.deviation.findMany({
      where: {
        userId: automation.userId,
        status: 'draft' as const,
        scheduledAt: null, // Not already scheduled
        files: { some: {} }, // Must have at least one file
      },
      orderBy,
      take: count * 3, // Get extra candidates in case of lock failures
      include: {
        files: true,
      },
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  // Use candidates directly (already shuffled for random, ordered for FIFO/LIFO)
  const orderedCandidates = candidates;

  // Atomically lock each draft using optimistic locking
  for (const candidate of orderedCandidates) {
    if (selected.length >= count) break;

    try {
      // Atomic update using executionVersion for optimistic locking
      const locked = await prisma.$transaction(async (tx) => {
        // Try to lock this draft
        const updateResult = await tx.deviation.updateMany({
          where: {
            id: candidate.id,
            executionVersion: candidate.executionVersion, // Only update if version matches
            status: 'draft', // Still draft
            scheduledAt: null, // Not scheduled
          },
          data: {
            scheduledAt: new Date(), // Mark as locked
            executionVersion: { increment: 1 },
          },
        });

        // If no rows updated, another process got it first
        if (updateResult.count === 0) {
          return null;
        }

        // Return the candidate with updated version
        return {
          ...candidate,
          scheduledAt: new Date(),
          executionVersion: candidate.executionVersion + 1,
        };
      });

      if (locked) {
        selected.push(locked);
      }
    } catch (error) {
      // Lock failed, skip this draft
      console.log(`[Auto-Scheduler] Failed to lock draft ${candidate.id}, skipping`);
    }
  }

  return selected;
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Helper to check if a value is empty
 * Treats false and 0 as empty to allow automation defaults to override database defaults
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  // Consider false as empty for booleans (so automation defaults can override database default of false)
  if (typeof value === 'boolean' && value === false) return true;
  // Consider 0 as empty for numbers (so automation defaults can override database default of 0)
  if (typeof value === 'number' && value === 0) return true;
  return false;
}

/**
 * Schedule a single draft
 * Uses transaction to ensure atomicity - if queueing fails, deviation is not marked as scheduled
 */
async function scheduleDraft(draft: any, automation: AutomationWithRelations): Promise<void> {
  // 1. Apply default values
  const updates: any = {};

  for (const defaultValue of automation.defaultValues) {
    const fieldName = defaultValue.fieldName;
    const currentValue = draft[fieldName];

    const shouldApply = defaultValue.applyIfEmpty ? isEmpty(currentValue) : true;

    if (shouldApply) {
      updates[fieldName] = defaultValue.value;
    }
  }

  // Force protection defaults if sale queue is enabled
  if (automation.autoAddToSaleQueue && automation.saleQueuePresetId) {
    // Override displayResolution to highest if it's 0 (original)
    const currentResolution = updates.displayResolution ?? draft.displayResolution ?? 0;
    if (currentResolution === 0) {
      updates.displayResolution = 8; // Force 1920px (highest with watermark support)
    }

    // Force watermark and disable free download for exclusives
    updates.addWatermark = true;
    updates.allowFreeDownload = false;
  }

  // Apply Sta.sh-only default if draft doesn't have explicit value
  if (draft.stashOnly === null || draft.stashOnly === undefined) {
    updates.stashOnly = automation.stashOnlyByDefault;
  }

  // 2. Calculate schedule time using jitter only (no random offset)
  const now = new Date();
  const jitterRange = automation.jitterMaxSeconds - automation.jitterMinSeconds;
  const jitterSeconds = automation.jitterMinSeconds + Math.floor(Math.random() * (jitterRange + 1));
  const actualPublishAt = new Date(now.getTime() + jitterSeconds * 1000);

  // 3. Update draft and queue in transaction (atomic operation)
  await prisma.$transaction(async (tx) => {
    // Update draft with defaults and schedule info
    await tx.deviation.update({
      where: { id: draft.id },
      data: {
        ...updates,
        status: 'scheduled',
        scheduledAt: now,
        jitterSeconds,
        actualPublishAt,
        automationId: automation.id, // Track which automation scheduled this
      },
    });

    // Queue the deviation (if this fails, transaction rolls back)
    await scheduleDeviation(draft.id, draft.userId, actualPublishAt, draft.uploadMode);
  });

  console.log(
    `[Auto-Scheduler] Scheduled deviation ${draft.id} for ${actualPublishAt.toISOString()}`
  );
}

/**
 * Log automation execution
 */
async function logExecution(
  automationId: string,
  scheduledCount: number,
  errorMessage: string | null = null,
  triggeredByRuleType: string | null = null
): Promise<void> {
  await prisma.automationExecutionLog.create({
    data: {
      automationId,
      scheduledCount,
      errorMessage,
      triggeredByRuleType,
    },
  });
}

/**
 * Start the cron job
 * Runs every 5 minutes
 */
export function startAutoScheduler(): void {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAutoScheduler();
    } catch (error) {
      console.error('[Auto-Scheduler] Cron job failed:', error);
    }
  });

  console.log('[Auto-Scheduler] Cron job started (runs every 5 minutes)');

  // Run once immediately on startup (after 30 seconds to allow server to fully start)
  setTimeout(() => {
    console.log('[Auto-Scheduler] Running initial check...');
    runAutoScheduler().catch((error) => {
      console.error('[Auto-Scheduler] Initial check failed:', error);
    });
  }, 30000); // 30 second delay
}

/**
 * Manually run auto-scheduler (for testing)
 */
export async function runAutoSchedulerManually(): Promise<void> {
  await runAutoScheduler();
}
