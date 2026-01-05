# Background Jobs - Recovery & Maintenance

**Purpose:** Cron-based background jobs for system health and automation
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)
**Location:** `apps/isekai-publisher/src/jobs/`

---

## Overview

**Background Jobs:** Scheduled tasks that run independently from queue workers

**Difference from Queue Workers:**
- **Queue Workers:** Process jobs from BullMQ queue (event-driven)
- **Background Jobs:** Run on fixed schedule (time-driven)

**Jobs:**
1. Auto-Scheduler (every 5 minutes)
2. Stuck Job Recovery (every 5 minutes)
3. Past-Due Recovery (every 1 minute)
4. Lock Cleanup (every 30 minutes)

---

## 1. Auto-Scheduler

**File:** `apps/isekai-publisher/src/jobs/auto-scheduler.ts`
**Schedule:** Every 5 minutes (`*/5 * * * *`)
**Purpose:** Execute automation workflows - select drafts and schedule them

**See:** `.context/features/automation.md` for complete workflow details

**High-Level Flow:**
```
1. Find all enabled automations (with active rules)
2. For each automation:
   a. Acquire execution lock (prevent concurrent runs)
   b. Check schedule rules → should run now?
   c. Determine how many deviations to schedule
   d. Select drafts based on strategy (random, fifo, lifo)
   e. Apply default values (tags, description, etc.)
   f. Calculate schedule time + jitter
   g. Update deviations → scheduled status
   h. Queue for publishing (deviation-publisher)
   i. Optionally add to sale queue
   j. Release execution lock
   k. Log execution results
```

**Execution Lock Pattern:**
```typescript
// Prevent concurrent automation execution
const lockTimeout = 5 * 60 * 1000; // 5 minutes
const lockCutoff = new Date(Date.now() - lockTimeout);

const lockAcquired = await prisma.automation.updateMany({
  where: {
    id: automation.id,
    OR: [
      { isExecuting: false },
      { lastExecutionLock: null },
      { lastExecutionLock: { lt: lockCutoff } } // Expired lock
    ]
  },
  data: {
    isExecuting: true,
    lastExecutionLock: new Date()
  }
});

if (lockAcquired.count === 0) {
  console.log('Automation already executing, skipping');
  return;
}

try {
  await executeAutomation(automation);
} finally {
  // Always release lock
  await prisma.automation.update({
    where: { id: automation.id },
    data: { isExecuting: false }
  });
}
```

**Schedule Rule Evaluation:**

### Fixed Time Rule
```typescript
// Rule: Post at 14:00 on Monday, Wednesday, Friday
{
  type: "fixed_time",
  timeOfDay: "14:00",
  daysOfWeek: ["monday", "wednesday", "friday"]
}

// Check if should trigger
const now = new Date();
const userTime = dateFnsTz.utcToZonedTime(now, user.timezone);
const currentDay = dateFnsTz.format(userTime, 'EEEE').toLowerCase();
const currentTime = dateFnsTz.format(userTime, 'HH:mm');

const shouldTrigger =
  rule.daysOfWeek.includes(currentDay) &&
  currentTime === rule.timeOfDay;
```

### Fixed Interval Rule
```typescript
// Rule: Every 4 hours, schedule 2 deviations
{
  type: "fixed_interval",
  intervalMinutes: 240,
  deviationsPerInterval: 2
}

// Check when last executed
const lastExecution = await prisma.automationExecutionLog.findFirst({
  where: { automationId: automation.id },
  orderBy: { executedAt: 'desc' }
});

const minutesSinceLastExecution =
  (Date.now() - lastExecution.executedAt.getTime()) / 60000;

if (minutesSinceLastExecution >= rule.intervalMinutes) {
  return rule.deviationsPerInterval; // Schedule this many
}
```

### Daily Quota Rule
```typescript
// Rule: Maximum 5 posts per day
{
  type: "daily_quota",
  dailyQuota: 5
}

// Count scheduled today
const startOfDay = dateFnsTz.startOfDay(
  dateFnsTz.utcToZonedTime(new Date(), user.timezone)
);

const scheduledToday = await prisma.deviation.count({
  where: {
    automationId: automation.id,
    status: { in: ['scheduled', 'uploading', 'publishing', 'published'] },
    createdAt: { gte: startOfDay }
  }
});

const remaining = rule.dailyQuota - scheduledToday;
return Math.max(0, remaining);
```

**Draft Selection Strategies:**

```typescript
// Random
const drafts = await prisma.deviation.findMany({
  where: { userId, status: 'draft' },
  take: count * 2 // Get more, then shuffle
});
const selected = shuffleArray(drafts).slice(0, count);

// FIFO (First In First Out)
const drafts = await prisma.deviation.findMany({
  where: { userId, status: 'draft' },
  orderBy: { createdAt: 'asc' },
  take: count
});

// LIFO (Last In First Out)
const drafts = await prisma.deviation.findMany({
  where: { userId, status: 'draft' },
  orderBy: { createdAt: 'desc' },
  take: count
});
```

**Apply Default Values:**
```typescript
for (const deviation of selectedDrafts) {
  for (const defaultValue of automation.defaultValues) {
    const currentValue = deviation[defaultValue.fieldName];

    // Only apply if empty (or always if applyIfEmpty = false)
    if (defaultValue.applyIfEmpty && currentValue != null) {
      continue;
    }

    deviation[defaultValue.fieldName] = defaultValue.value;
  }
}
```

**Calculate Schedule Time with Jitter:**
```typescript
// Base schedule time (now or future based on rule)
const scheduleTime = calculateScheduleTime(rule, user.timezone);

// Add jitter (random offset)
const jitterRange = automation.jitterMaxSeconds - automation.jitterMinSeconds;
const jitterSeconds =
  automation.jitterMinSeconds +
  Math.floor(Math.random() * jitterRange);

const actualPublishAt = new Date(
  scheduleTime.getTime() + jitterSeconds * 1000
);

await prisma.deviation.update({
  where: { id: deviation.id },
  data: {
    status: 'scheduled',
    scheduledAt: scheduleTime,
    jitterSeconds,
    actualPublishAt,
    automationId: automation.id
  }
});
```

**Error Handling:**
```typescript
try {
  const scheduledCount = await executeAutomation(automation);

  await prisma.automationExecutionLog.create({
    data: {
      automationId: automation.id,
      scheduledCount,
      triggeredByRuleType: rule.type
    }
  });
} catch (error) {
  await prisma.automationExecutionLog.create({
    data: {
      automationId: automation.id,
      scheduledCount: 0,
      errorMessage: error.message,
      triggeredByRuleType: rule.type
    }
  });
  throw error;
}
```

---

## 2. Stuck Job Recovery

**File:** `apps/isekai-publisher/src/jobs/stuck-job-recovery.ts`
**Schedule:** Every 5 minutes (`*/5 * * * *`)
**Purpose:** Recover jobs stuck in "active" state due to worker crashes

**Problem:**
When worker crashes mid-job, BullMQ job stays in "active" state forever.

**Solution:**
Detect stalled jobs and reset them for retry.

**Implementation:**
```typescript
const JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const MAX_STALLED_COUNT = 2; // BullMQ setting

async function recoverStuckJobs() {
  console.log('[Recovery] Checking for stuck jobs...');

  try {
    // Get active jobs from queue
    const activeJobs = await deviationQueue.getActive();

    if (activeJobs.length === 0) {
      console.log('[Recovery] No active jobs');
      return;
    }

    console.log(`[Recovery] Found ${activeJobs.length} active jobs`);
    let recoveredCount = 0;

    for (const job of activeJobs) {
      const stalledTime = Date.now() - job.processedOn;

      if (stalledTime > JOB_TIMEOUT) {
        console.log(`[Recovery] Job ${job.id} stalled for ${stalledTime}ms`);

        // Release execution lock in database
        const deviationId = job.data.deviationId;

        await prisma.deviation.updateMany({
          where: {
            id: deviationId,
            executionLockId: { not: null }
          },
          data: {
            executionLockId: null,
            executionLockedAt: null
          }
        });

        // Move job to failed (BullMQ will retry if attempts remain)
        try {
          await job.moveToFailed(
            new Error('Job stalled - recovered by stuck job recovery'),
            true // token (required by BullMQ)
          );
          recoveredCount++;
        } catch (error) {
          console.error(`[Recovery] Failed to recover job ${job.id}:`, error);
        }
      }
    }

    if (recoveredCount > 0) {
      console.log(`[Recovery] Recovered ${recoveredCount} stuck jobs`);
    }
  } catch (error) {
    console.error('[Recovery] Error in stuck job recovery:', error);
  }
}
```

**Why 10-Minute Timeout:**
Publishing typically takes 5-15 seconds, but slow API responses or retries can extend to several minutes. 10 minutes is conservative safety margin.

**BullMQ Stall Count:**
```typescript
// Queue configuration
const queue = new Queue('deviation-publisher', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 7,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

const worker = new Worker('deviation-publisher', processor, {
  connection: redis,
  settings: {
    stalledInterval: 60000, // Check every minute
    maxStalledCount: 2 // Move to failed after 2 stalls
  }
});
```

After 2 stall recoveries, job automatically moved to "failed" by BullMQ.

**Monitoring:**
Track recovery frequency - high recovery rate indicates worker stability issues.

---

## 3. Past-Due Recovery

**File:** `apps/isekai-publisher/src/jobs/past-due-recovery.ts`
**Schedule:** Every 1 minute (`*/1 * * * *`)
**Purpose:** Queue deviations whose `actualPublishAt` has passed

**Problem:**
- Worker downtime during scheduled time
- Queue backlog causes delay
- Clock skew between servers
- Automation scheduled for past time

**Solution:**
Scan for scheduled deviations past their time, queue immediately.

**Implementation:**
```typescript
const BATCH_SIZE = 50; // Process 50 at a time

async function recoverPastDue() {
  console.log('[Past-Due Recovery] Checking for past-due deviations...');

  try {
    const now = new Date();

    // Find scheduled deviations past their publish time
    const pastDue = await prisma.deviation.findMany({
      where: {
        status: 'scheduled',
        actualPublishAt: { lte: now },
        executionLockId: null // Not currently being processed
      },
      take: BATCH_SIZE,
      orderBy: { actualPublishAt: 'asc' } // Oldest first
    });

    if (pastDue.length === 0) {
      console.log('[Past-Due Recovery] No past-due deviations');
      return;
    }

    console.log(`[Past-Due Recovery] Found ${pastDue.length} past-due deviations`);

    for (const deviation of pastDue) {
      const delay = Date.now() - deviation.actualPublishAt.getTime();
      console.log(`[Past-Due Recovery] Queueing ${deviation.id} (${Math.floor(delay / 1000)}s late)`);

      try {
        // Add to queue with high priority
        await deviationQueue.add('publish', {
          deviationId: deviation.id
        }, {
          priority: 1, // High priority (default is 0)
          attempts: 7,
          backoff: { type: 'exponential', delay: 5000 }
        });
      } catch (error) {
        console.error(`[Past-Due Recovery] Failed to queue ${deviation.id}:`, error);
      }
    }

    console.log(`[Past-Due Recovery] Queued ${pastDue.length} past-due deviations`);
  } catch (error) {
    console.error('[Past-Due Recovery] Error in past-due recovery:', error);
  }
}
```

**Why 1-Minute Interval:**
Frequent checks minimize delay for time-sensitive posts. Lightweight query (indexed on `status` + `actualPublishAt`).

**Priority Queue:**
Past-due jobs get priority 1 (higher than default 0) to process before newly scheduled jobs.

**Batch Size:**
Limit to 50 to prevent overwhelming queue if large backlog exists.

---

## 4. Lock Cleanup

**File:** `apps/isekai-publisher/src/jobs/lock-cleanup.ts`
**Schedule:** Every 30 minutes (`*/30 * * * *`)
**Purpose:** Clear stale execution locks (>1 hour old)

**Problem:**
Execution locks not released due to:
- Worker crash before lock release
- Unexpected errors in try/finally block
- Network partition during update

**Solution:**
Periodically scan for old locks and clear them.

**Implementation:**
```typescript
const LOCK_TIMEOUT = 60 * 60 * 1000; // 1 hour

async function cleanupStaleLocks() {
  console.log('[Lock Cleanup] Checking for stale locks...');

  try {
    const oneHourAgo = new Date(Date.now() - LOCK_TIMEOUT);

    // Find deviations with locks older than 1 hour
    const result = await prisma.deviation.updateMany({
      where: {
        executionLockId: { not: null },
        executionLockedAt: { lte: oneHourAgo }
      },
      data: {
        executionLockId: null,
        executionLockedAt: null
      }
    });

    if (result.count > 0) {
      console.log(`[Lock Cleanup] Released ${result.count} stale locks`);
    } else {
      console.log('[Lock Cleanup] No stale locks found');
    }

    // Also cleanup automation execution locks
    const automationResult = await prisma.automation.updateMany({
      where: {
        isExecuting: true,
        lastExecutionLock: { lte: oneHourAgo }
      },
      data: {
        isExecuting: false
      }
    });

    if (automationResult.count > 0) {
      console.log(`[Lock Cleanup] Released ${automationResult.count} automation locks`);
    }
  } catch (error) {
    console.error('[Lock Cleanup] Error in lock cleanup:', error);
  }
}
```

**Why 1-Hour Timeout:**
- Publishing typically takes 5-15 seconds
- With retries and rate limiting, could take several minutes
- 1 hour is very conservative - anything longer is definitely stale

**Why 30-Minute Interval:**
Not time-critical. Stale locks are rare (only on crashes). 30-minute cleanup is sufficient.

**Database Performance:**
Query uses index on `executionLockId` + `executionLockedAt` for fast lookups.

---

## 5. Token Maintenance (Queue-Based)

**File:** `apps/isekai-publisher/src/queues/token-maintenance.ts`
**Schedule:** Every 6 hours (cron job adds to queue)
**Purpose:** Proactively refresh OAuth tokens before 90-day expiry

**Different from Other Jobs:**
Uses BullMQ queue instead of direct cron execution.

**Why Queue-Based:**
- Retry capability if refresh fails
- Better error handling
- Distributed processing across workers

**Schedule Setup:**
```typescript
// In publisher startup
async function scheduleTokenMaintenance() {
  const queue = new Queue('token-maintenance', { connection: redis });

  // Add repeatable job (every 6 hours)
  await queue.add('refresh-tokens', {}, {
    repeat: {
      pattern: '0 */6 * * *' // At minute 0 of every 6th hour
    }
  });
}
```

**Processor:**
```typescript
async function processTokenMaintenance() {
  console.log('[Token Maintenance] Checking tokens...');

  // Find users with tokens expiring within 7 days
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      refreshTokenExpiresAt: { lte: sevenDaysFromNow }
    }
  });

  console.log(`[Token Maintenance] Found ${users.length} users needing refresh`);

  for (const user of users) {
    try {
      await refreshUserToken(user);
    } catch (error) {
      console.error(`[Token Maintenance] Failed to refresh for user ${user.id}:`, error);
    }
  }
}

async function refreshUserToken(user: User) {
  // Call DeviantArt OAuth refresh endpoint
  const response = await fetch('https://www.deviantart.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: DEVIANTART_CLIENT_ID,
      client_secret: DEVIANTART_CLIENT_SECRET,
      refresh_token: decrypt(user.refreshToken, ENCRYPTION_KEY)
    })
  });

  const tokens = await response.json();

  // Update database
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: encrypt(tokens.access_token, ENCRYPTION_KEY),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      lastRefreshTokenRefresh: new Date()
    }
  });

  // Send email if within 7 days
  const daysUntilExpiry =
    (user.refreshTokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

  if (daysUntilExpiry <= 7 && !user.refreshTokenWarningEmailSent) {
    await sendEmail({
      to: user.email,
      subject: 'DeviantArt Token Expiring Soon',
      body: `Your refresh token expires in ${Math.floor(daysUntilExpiry)} days.`
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenWarningEmailSent: true }
    });
  }
}
```

---

## Job Scheduling with node-cron

**Setup (apps/isekai-publisher/src/index.ts):**
```typescript
import cron from 'node-cron';
import { startAutoScheduler } from './jobs/auto-scheduler.js';
import { startStuckJobRecovery } from './jobs/stuck-job-recovery.js';
import { startPastDueRecovery } from './jobs/past-due-recovery.js';
import { startLockCleanup } from './jobs/lock-cleanup.js';

async function startPublisher() {
  // ... Redis connection, health checks ...

  // Start cron jobs
  startAutoScheduler();       // Every 5 minutes
  startStuckJobRecovery();    // Every 5 minutes
  startPastDueRecovery();     // Every 1 minute
  startLockCleanup();         // Every 30 minutes

  console.log('Publisher ready');
}
```

**Cron Pattern Syntax:**
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday=0)
│ │ │ │ │
* * * * *
```

**Examples:**
```typescript
'*/1 * * * *'    // Every 1 minute
'*/5 * * * *'    // Every 5 minutes
'*/30 * * * *'   // Every 30 minutes
'0 */6 * * *'    // Every 6 hours (at minute 0)
'0 0 * * *'      // Daily at midnight
'0 0 * * 0'      // Weekly on Sunday at midnight
```

---

## Monitoring & Alerting

**Log Patterns:**
```typescript
console.log(JSON.stringify({
  level: 'info',
  job: 'auto-scheduler',
  message: 'Scheduled 5 deviations',
  automationId: automation.id,
  userId: automation.userId,
  scheduledCount: 5,
  timestamp: new Date().toISOString()
}));
```

**Metrics to Track:**
- Auto-scheduler: Executions per hour, deviations scheduled
- Stuck job recovery: Recovery count (should be near 0)
- Past-due recovery: Average delay, recovery count
- Lock cleanup: Stale locks released (should be near 0)
- Token maintenance: Refresh success rate

**Alerts:**
- Stuck job recovery >10/hour → Worker stability issue
- Past-due recovery >100 → Queue backlog
- Lock cleanup >50 → Execution lock bugs
- Token refresh failures → DeviantArt API issue

---

## Related Files

- `.context/workers/publisher.md` - Publisher architecture
- `.context/features/automation.md` - Auto-scheduler detailed workflow
- `.context/architecture/patterns.md` - Execution lock pattern
- `.context/boundaries.md` - DO NOT MODIFY execution lock logic
