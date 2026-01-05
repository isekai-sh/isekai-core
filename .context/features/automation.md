# Automation Workflow System

**Purpose:** Comprehensive guide to the automation system that automatically schedules draft deviations
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

The **Automation Workflow System** allows users to create workflows that automatically schedule draft deviations based on customizable rules. This is the most complex feature in Isekai Core.

**Use Cases:**
- "Schedule 1 post every day at 2pm"
- "Schedule 2 posts every 4 hours"
- "Schedule random drafts throughout the week"
- "Auto-add scheduled posts to exclusives queue with pricing"

**Architecture:**
```
Auto-Scheduler Job (every 5 min)
    ↓
Find Enabled Automations
    ↓
For Each Automation:
  1. Acquire Execution Lock
  2. Evaluate Schedule Rules → Should trigger?
  3. Select Drafts (random/fifo/lifo)
  4. Apply Default Values
  5. Calculate Jitter & Schedule Time
  6. Queue for Publishing
  7. Release Lock
```

**Related Files:**
- `/apps/isekai-publisher/src/jobs/auto-scheduler.ts` - Execution logic
- `/apps/isekai-backend/src/routes/automations.ts` - API routes
- `/apps/isekai-backend/src/routes/automation-schedule-rules.ts` - Rule management
- `/apps/isekai-backend/src/routes/automation-default-values.ts` - Default value management

---

## Core Concepts

### Automation Workflow

A workflow consists of:

1. **Configuration** - Name, color, icon, selection method
2. **Schedule Rules** - When to trigger (1+ rules)
3. **Default Values** - Metadata to apply (0+ values)
4. **Jitter Settings** - Random time offset range
5. **Sale Queue Integration** - Auto-add to exclusives (optional)

**Example:**
```typescript
{
  name: "Daily Art Posts",
  color: "#3b82f6",
  icon: "🎨",
  enabled: true,
  draftSelectionMethod: "random",
  stashOnlyByDefault: false,
  jitterMinSeconds: 0,
  jitterMaxSeconds: 300, // ±5 minutes
  autoAddToSaleQueue: true,
  saleQueuePresetId: "preset-uuid",
  scheduleRules: [
    { type: "fixed_time", timeOfDay: "14:00", daysOfWeek: ["monday", "wednesday", "friday"] }
  ],
  defaultValues: [
    { fieldName: "tags", value: ["digital art", "fantasy"], applyIfEmpty: true }
  ]
}
```

### Schedule Rules

Three rule types determine **when** the automation triggers:

| Rule Type | Description | Trigger Logic |
|-----------|-------------|---------------|
| `fixed_time` | Specific time each day | Triggers at timeOfDay (with 7-min window) |
| `fixed_interval` | Every N minutes | Triggers if intervalMinutes elapsed since last execution |
| `daily_quota` | Max posts per day | Triggers if scheduled count < dailyQuota today |

**All rules support:**
- `daysOfWeek` filter - Optional array like `["monday", "friday"]` (uses user's timezone)
- `enabled` flag - Can disable without deleting
- `priority` - Higher priority rules execute first

### Default Values

Metadata applied to scheduled deviations:

**Supported Fields:**
- `description` (string)
- `tags` (array of strings)
- `isMature` (boolean)
- `matureLevel` ("moderate" | "strict")
- `categoryPath` (string, e.g., "digitalart/paintings/fantasy")
- `galleryIds` (array of strings)
- `isAiGenerated` (boolean)
- `noAi` (boolean)
- `allowComments` (boolean)
- `allowFreeDownload` (boolean)
- `addWatermark` (boolean)
- `displayResolution` (0-8, see glossary.md)
- `stashOnly` (boolean)

**Application Logic:**
```typescript
for (const defaultValue of automation.defaultValues) {
  const fieldName = defaultValue.fieldName;
  const currentValue = draft[fieldName];

  const shouldApply = defaultValue.applyIfEmpty
    ? isEmpty(currentValue)  // Only if field is empty
    : true;                  // Always apply

  if (shouldApply) {
    draft[fieldName] = defaultValue.value;
  }
}
```

**isEmpty Logic:**
```typescript
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  // Treat false/0 as empty so automation can override database defaults
  if (typeof value === 'boolean' && value === false) return true;
  if (typeof value === 'number' && value === 0) return true;
  return false;
}
```

---

## Execution Flow

### Step 1: Auto-Scheduler Cron Job

**Schedule:** Every 5 minutes (`*/5 * * * *`)

```typescript
cron.schedule('*/5 * * * *', async () => {
  await runAutoScheduler();
});
```

**Startup Behavior:**
- Also runs once 30 seconds after server start
- Ensures automations aren't delayed by up to 5 minutes on deploy

### Step 2: Find Enabled Automations

```typescript
const automations = await prisma.automation.findMany({
  where: { enabled: true },
  include: {
    user: { select: { id: true, timezone: true } },
    scheduleRules: {
      where: { enabled: true },
      orderBy: { priority: 'asc' },
    },
    defaultValues: true,
    saleQueuePreset: true,
  },
});
```

**Key:** Only enabled automations with enabled rules are processed.

### Step 3: Acquire Execution Lock

**Purpose:** Prevent concurrent execution of the same automation.

```typescript
const lockTimeout = 5 * 60 * 1000; // 5 minutes
const lockCutoff = new Date(Date.now() - lockTimeout);

const lockAcquired = await prisma.automation.updateMany({
  where: {
    id: automation.id,
    OR: [
      { isExecuting: false },
      { lastExecutionLock: null },
      { lastExecutionLock: { lt: lockCutoff } }, // Expired lock
    ],
  },
  data: {
    isExecuting: true,
    lastExecutionLock: new Date(),
  },
});

if (lockAcquired.count === 0) {
  console.log('Automation already executing, skipping');
  return;
}
```

**Lock Release:**
```typescript
finally {
  await prisma.automation.update({
    where: { id: automation.id },
    data: { isExecuting: false, lastExecutionLock: null },
  });
}
```

**Why Simpler Lock?**
- Unlike deviation execution locks (UUID + optimistic locking), automation locks are simpler
- Only one cron job runs globally, less concurrency risk
- Stale lock detection (5-minute timeout) handles crashes

### Step 4: Evaluate Schedule Rules

**Timezone-Aware Evaluation:**

All time/day calculations use **user's timezone** from `User.timezone` field.

```typescript
// Get current time in user's timezone
const nowInUserTz = dateFnsTz.toZonedTime(new Date(), userTimezone);
const currentTime = `${nowInUserTz.getHours().toString().padStart(2, '0')}:${nowInUserTz.getMinutes().toString().padStart(2, '0')}`;
const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nowInUserTz.getDay()];
```

**Rule Evaluation:**

#### Fixed Time Rule

```typescript
if (rule.type === 'fixed_time') {
  // Check day of week filter
  if (rule.daysOfWeek) {
    const daysArray = rule.daysOfWeek as string[];
    if (!daysArray.includes(currentDay)) {
      continue; // Not the right day
    }
  }

  // Check if current time matches timeOfDay (7-minute window)
  if (rule.timeOfDay && isTimeMatch(currentTime, rule.timeOfDay)) {
    triggeredRules.push(rule);
  }
}

function isTimeMatch(currentTime: string, targetTime: string): boolean {
  const currentTotalMinutes = parseTime(currentTime);
  const targetTotalMinutes = parseTime(targetTime);

  const minutesSinceTarget = currentTotalMinutes - targetTotalMinutes;

  // Trigger if target time passed within last 7 minutes
  // (Cron runs every 5 min, 7-min window accounts for delays)
  return minutesSinceTarget >= 0 && minutesSinceTarget < 7;
}
```

**Example:** If rule has `timeOfDay: "14:00"` and cron runs at 14:03, it triggers (within 7-min window).

#### Fixed Interval Rule

```typescript
if (rule.type === 'fixed_interval') {
  const lastExecution = await getLastExecutionForRule(automationId, 'fixed_interval');

  if (!lastExecution || hasIntervalElapsed(lastExecution, rule.intervalMinutes!)) {
    triggeredRules.push(rule);
  }
}

function hasIntervalElapsed(lastExecution: Date, intervalMinutes: number): boolean {
  const elapsedMinutes = (Date.now() - lastExecution.getTime()) / (1000 * 60);
  return elapsedMinutes >= intervalMinutes;
}
```

**Example:** If rule has `intervalMinutes: 240` (4 hours) and last execution was 250 minutes ago, it triggers.

#### Daily Quota Rule

```typescript
if (rule.type === 'daily_quota') {
  if (await shouldScheduleForDailyQuota(automationId, rule.dailyQuota!, userTimezone)) {
    triggeredRules.push(rule);
  }
}

async function shouldScheduleForDailyQuota(
  automationId: string,
  dailyQuota: number,
  userTimezone: string
): Promise<boolean> {
  // Get start of today in user's timezone
  const nowInUserTz = dateFnsTz.toZonedTime(new Date(), userTimezone);
  const todayInUserTz = new Date(nowInUserTz);
  todayInUserTz.setHours(0, 0, 0, 0);

  // Convert to UTC for database query
  const todayUtc = dateFnsTz.fromZonedTime(todayInUserTz, userTimezone);

  // Count scheduled today
  const scheduledToday = await prisma.automationExecutionLog.aggregate({
    where: {
      automationId,
      triggeredByRuleType: 'daily_quota',
      executedAt: { gte: todayUtc },
    },
    _sum: { scheduledCount: true },
  });

  const totalScheduledToday = scheduledToday._sum.scheduledCount || 0;
  return totalScheduledToday < dailyQuota;
}
```

**Example:** If rule has `dailyQuota: 5` and 3 deviations scheduled today, it triggers (3 < 5).

### Step 5: Calculate Schedule Count

```typescript
function calculateScheduleCount(rules: AutomationScheduleRule[]): number {
  let count = 0;

  for (const rule of rules) {
    if (rule.type === 'fixed_time') {
      count += 1; // 1 per trigger
    } else if (rule.type === 'fixed_interval') {
      count += rule.deviationsPerInterval || 1;
    } else if (rule.type === 'daily_quota') {
      count += 1; // 1 at a time to spread throughout day
    }
  }

  return count;
}
```

**Note:** If multiple rules trigger simultaneously, counts are summed.

### Step 6: Select Drafts

**Selection Methods:**

#### Random Selection

```typescript
if (automation.draftSelectionMethod === 'random') {
  // Fetch large pool (up to 1000 drafts) for true randomness
  const allCandidates = await prisma.deviation.findMany({
    where: {
      userId: automation.userId,
      status: 'draft',
      scheduledAt: null,
      files: { some: {} }, // Must have files
    },
    take: 1000,
  });

  // Shuffle entire pool (Fisher-Yates algorithm)
  candidates = shuffle(allCandidates);
}
```

**Why 1000 pool?** Ensures random selection across entire draft library, not just oldest/newest 10.

#### FIFO (First In First Out)

```typescript
if (automation.draftSelectionMethod === 'fifo') {
  candidates = await prisma.deviation.findMany({
    where: { userId, status: 'draft', scheduledAt: null, files: { some: {} } },
    orderBy: { createdAt: 'asc' }, // Oldest first
    take: count * 3, // Extra candidates in case of lock failures
  });
}
```

#### LIFO (Last In First Out)

```typescript
if (automation.draftSelectionMethod === 'lifo') {
  candidates = await prisma.deviation.findMany({
    where: { userId, status: 'draft', scheduledAt: null, files: { some: {} } },
    orderBy: { createdAt: 'desc' }, // Newest first
    take: count * 3,
  });
}
```

**Optimistic Locking:**

Each draft is atomically locked using `executionVersion` to prevent race conditions:

```typescript
for (const candidate of orderedCandidates) {
  if (selected.length >= count) break;

  const locked = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.deviation.updateMany({
      where: {
        id: candidate.id,
        executionVersion: candidate.executionVersion, // Only if version matches
        status: 'draft',
        scheduledAt: null,
      },
      data: {
        scheduledAt: new Date(), // Mark as locked
        executionVersion: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      return null; // Another automation got it first
    }

    return candidate;
  });

  if (locked) {
    selected.push(locked);
  }
}
```

**Why Optimistic Locking?**
- Multiple automations may run concurrently
- Prevents same draft from being scheduled twice
- Uses `executionVersion` counter for conflict detection

### Step 7: Apply Default Values

```typescript
const updates: any = {};

for (const defaultValue of automation.defaultValues) {
  const fieldName = defaultValue.fieldName;
  const currentValue = draft[fieldName];

  const shouldApply = defaultValue.applyIfEmpty
    ? isEmpty(currentValue)
    : true;

  if (shouldApply) {
    updates[fieldName] = defaultValue.value;
  }
}
```

**Sale Queue Protection:**

If `autoAddToSaleQueue` is enabled, force protection defaults:

```typescript
if (automation.autoAddToSaleQueue && automation.saleQueuePresetId) {
  // Force highest resolution with watermark support
  const currentResolution = updates.displayResolution ?? draft.displayResolution ?? 0;
  if (currentResolution === 0) {
    updates.displayResolution = 8; // 1920px
  }

  // Force watermark and disable free download
  updates.addWatermark = true;
  updates.allowFreeDownload = false;
}
```

**Why?** Exclusives require download protection to justify pricing.

### Step 8: Calculate Schedule Time

**Jitter Calculation:**

```typescript
const now = new Date();
const jitterRange = automation.jitterMaxSeconds - automation.jitterMinSeconds;
const jitterSeconds = automation.jitterMinSeconds + Math.floor(Math.random() * (jitterRange + 1));
const actualPublishAt = new Date(now.getTime() + jitterSeconds * 1000);
```

**Example:**
- `jitterMinSeconds: 0`, `jitterMaxSeconds: 300` (5 min)
- Random jitter: 0-300 seconds
- If jitter=173, actualPublishAt = now + 173 seconds

**Purpose:** Spread posts across time window to appear more natural.

### Step 9: Queue for Publishing

**Transaction-Based Scheduling:**

```typescript
await prisma.$transaction(async (tx) => {
  // Update deviation
  await tx.deviation.update({
    where: { id: draft.id },
    data: {
      ...updates, // Default values
      status: 'scheduled',
      scheduledAt: now,
      jitterSeconds,
      actualPublishAt,
      automationId: automation.id, // Track which automation scheduled it
    },
  });

  // Queue for publisher (if this fails, transaction rolls back)
  await scheduleDeviation(draft.id, draft.userId, actualPublishAt, draft.uploadMode);
});
```

**Atomicity:** If queuing fails (e.g., BullMQ down), deviation is NOT marked as scheduled.

### Step 10: Log Execution

```typescript
await prisma.automationExecutionLog.create({
  data: {
    automationId: automation.id,
    scheduledCount: scheduled, // How many deviations scheduled
    errorMessage: null,
    triggeredByRuleType: rulesToExecute[0].type,
  },
});
```

**Use Cases:**
- Debugging ("Why didn't my automation run?")
- Analytics (posts per day, success rate)
- User visibility (automation history)

---

## Validation & Constraints

### API Validation

**Create Automation:**
```typescript
const createAutomationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  draftSelectionMethod: z.enum(["random", "fifo", "lifo"]).default("fifo"),
  jitterMinSeconds: z.number().int().min(0).max(3600).default(0),
  jitterMaxSeconds: z.number().int().min(0).max(3600).default(300),
  autoAddToSaleQueue: z.boolean().default(false),
  saleQueuePresetId: z.string().uuid().optional(),
}).refine(
  (data) => {
    // If sale queue enabled, must have preset
    if (data.autoAddToSaleQueue && !data.saleQueuePresetId) {
      return false;
    }
    return true;
  },
  { message: "Must select price preset when sale queue is enabled" }
);
```

**Jitter Range Validation:**
```typescript
if (data.jitterMinSeconds > data.jitterMaxSeconds) {
  throw new AppError(400, "jitterMinSeconds cannot be greater than jitterMaxSeconds");
}
```

**Enable Automation:**
```typescript
if (data.enabled === true) {
  const ruleCount = await prisma.automationScheduleRule.count({
    where: { automationId: id, enabled: true },
  });

  if (ruleCount === 0) {
    throw new AppError(400, "Cannot enable automation without at least one active schedule rule");
  }
}
```

**Concurrent Modification:**
```typescript
if (automation.isExecuting) {
  throw new AppError(409, "Cannot update automation while it is executing. Please try again in a moment.");
}
```

---

## Common Patterns

### Example 1: Daily Posts at Specific Times

**Goal:** Schedule 1 post at 2pm and 1 post at 8pm, Monday-Friday.

**Automation Config:**
```json
{
  "name": "Weekday Posts",
  "draftSelectionMethod": "random",
  "jitterMinSeconds": 0,
  "jitterMaxSeconds": 600,
  "scheduleRules": [
    {
      "type": "fixed_time",
      "timeOfDay": "14:00",
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "priority": 1
    },
    {
      "type": "fixed_time",
      "timeOfDay": "20:00",
      "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "priority": 2
    }
  ]
}
```

**Behavior:**
- At 2:00pm (±10 min jitter), schedules 1 random draft (Monday-Friday)
- At 8:00pm (±10 min jitter), schedules 1 random draft (Monday-Friday)
- User's timezone used for "2pm" and "8pm"

### Example 2: Fixed Interval with Quotas

**Goal:** Schedule 2 posts every 4 hours, max 10 per day.

**Automation Config:**
```json
{
  "name": "Frequent Posts",
  "draftSelectionMethod": "fifo",
  "jitterMinSeconds": 0,
  "jitterMaxSeconds": 300,
  "scheduleRules": [
    {
      "type": "fixed_interval",
      "intervalMinutes": 240,
      "deviationsPerInterval": 2,
      "priority": 1
    },
    {
      "type": "daily_quota",
      "dailyQuota": 10,
      "priority": 2
    }
  ]
}
```

**Behavior:**
- Every 4 hours, schedules 2 oldest drafts (FIFO)
- Daily quota rule prevents scheduling if already scheduled 10 today
- If 8 scheduled today at 11pm, interval rule won't trigger (blocked by quota)

### Example 3: Exclusives with Protection

**Goal:** Random exclusive posts 3x/day, auto-priced at $30-$100.

**Automation Config:**
```json
{
  "name": "Exclusive Art",
  "draftSelectionMethod": "random",
  "jitterMinSeconds": 0,
  "jitterMaxSeconds": 1800,
  "autoAddToSaleQueue": true,
  "saleQueuePresetId": "preset-uuid",
  "scheduleRules": [
    {
      "type": "daily_quota",
      "dailyQuota": 3,
      "priority": 1
    }
  ],
  "defaultValues": [
    {
      "fieldName": "tags",
      "value": ["exclusive", "high res"],
      "applyIfEmpty": true
    }
  ]
}
```

**Price Preset:**
```json
{
  "name": "Variable Pricing",
  "price": 5000,
  "minPrice": 3000,
  "maxPrice": 10000,
  "currency": "USD"
}
```

**Behavior:**
- Schedules up to 3 random drafts per day (spread throughout day)
- Each scheduled deviation:
  - Has `displayResolution: 8` (1920px, forced)
  - Has `addWatermark: true` (forced)
  - Has `allowFreeDownload: false` (forced)
  - Added to sale queue with random price $30-$100
- User's timezone determines "per day"

---

## Performance Considerations

### Execution Lock Timeout

**Default:** 5 minutes

**Why?** If auto-scheduler crashes mid-execution, lock will be released after 5 minutes on next run.

**Trade-off:** If execution takes >5 minutes, duplicate run risk (rare, only with 1000+ drafts).

### Draft Selection Pool Size

**Random:** 1000 drafts
**FIFO/LIFO:** `count * 3` drafts

**Why Random Needs Large Pool?**
- Ensures randomness across entire draft library
- Without large pool, would only randomize first 10 drafts

**Why FIFO/LIFO Use 3x?**
- Extra candidates in case of lock failures
- If 5 needed, fetch 15, handle concurrent automation conflicts

### Database Queries

**Optimization:**
```sql
-- Index for draft selection
CREATE INDEX idx_deviations_user_status_scheduled ON deviations(user_id, status, scheduled_at);

-- Index for execution logs (daily quota check)
CREATE INDEX idx_automation_logs_automation_executed ON automation_execution_logs(automation_id, executed_at);
```

**Query Count per Run:**
- 1 query: Find enabled automations
- N queries: Process each automation (N = automation count)
- Per automation: ~5-10 queries (evaluate rules, select drafts, schedule, log)

**Typical Load:** 10 users × 2 automations = 20 processed/5min = ~100 queries/5min (low)

---

## Troubleshooting

### "Automation not triggering"

**Check:**
1. Is automation enabled? (`enabled: true`)
2. Are schedule rules enabled? (`scheduleRules[].enabled: true`)
3. Are there available drafts? (status='draft', has files, scheduledAt=null)
4. Is rule condition met? (time window, interval elapsed, quota not exceeded)
5. Is automation execution locked? (check `isExecuting`, `lastExecutionLock`)

**Debug:**
```typescript
// Check execution logs
const logs = await prisma.automationExecutionLog.findMany({
  where: { automationId },
  orderBy: { executedAt: 'desc' },
  take: 10,
});

// If no logs, automation never triggered
// If logs have errorMessage, see what failed
```

### "Same drafts always selected (FIFO)"

**Cause:** Drafts have same `createdAt` timestamp (bulk upload).

**Fix:** Add sort by `id` as tiebreaker:
```typescript
orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
```

### "Daily quota not working"

**Cause:** User timezone mismatch.

**Check:**
```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { timezone: true },
});

// If timezone is UTC but user is in PST, "today" is wrong
```

**Fix:** Ensure `User.timezone` is set correctly (e.g., "America/Los_Angeles").

### "Jitter too predictable"

**Cause:** Small jitter range (e.g., 0-30 seconds).

**Recommendation:** Use 0-1800 seconds (30 min) for natural spread:
```json
{
  "jitterMinSeconds": 0,
  "jitterMaxSeconds": 1800
}
```

---

## Related Documentation

- `.context/database/models.md` - Automation model explanations
- `.context/workers/background-jobs.md` - Auto-scheduler job details
- `.context/api/endpoints.md` - Automation API routes
- `.context/architecture/patterns.md` - Execution lock pattern
- `.context/glossary.md` - Automation terminology

---

## Future Enhancements

**Planned Features:**
- **Time ranges:** "Schedule between 2pm-8pm"
- **Weighted selection:** "70% random, 30% oldest"
- **Conditional rules:** "Only if no posts in last 6 hours"
- **Multi-rule combinations:** "fixed_time AND daily_quota" (both must pass)
- **Retry failed scheduling:** Auto-retry if queue fails

**Not Planned:**
- AI-powered scheduling (out of scope for Core)
- External calendar integration (use API instead)
