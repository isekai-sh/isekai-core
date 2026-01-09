# Publishing System - Deviation Lifecycle

**Purpose:** Complete guide to deviation publishing workflow, status transitions, and queue processing
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

The **Publishing System** manages the complete lifecycle of deviations from creation to publication on DeviantArt. It uses BullMQ for reliable job processing and implements circuit breaker and adaptive rate limiting patterns.

**Core Components:**

- **Backend API** - Deviation CRUD and scheduling endpoints
- **Publisher Worker** - Microservice that processes publication jobs
- **BullMQ Queue** - Delayed job queue with retry logic
- **Storage Service** - R2/S3/MinIO abstraction for file uploads

**Related Files:**

- `/apps/isekai-backend/src/routes/deviations.ts` - API routes
- `/apps/isekai-publisher/src/queues/deviation-publisher.ts` - Queue worker
- `/packages/shared/src/publishers/deviation-publisher.ts` - Core publisher logic
- `/apps/isekai-publisher/src/lib/deviantart.ts` - DeviantArt API client

---

## Deviation Lifecycle

### Status Flow

```
review
  ↓ (user attaches files)
draft
  ↓ (user schedules OR automation schedules)
scheduled
  ↓ (actualPublishAt reached, job picked up by worker)
uploading
  ↓ (files uploaded to DeviantArt)
publishing
  ↓ (metadata submitted to DeviantArt)
published ✅
  OR
failed ❌ (with retry logic)
```

**Status Definitions:**

| Status       | Description                        | User Actions                        |
| ------------ | ---------------------------------- | ----------------------------------- |
| `review`     | Initial state, needs files         | Attach files, edit metadata         |
| `draft`      | Ready but not scheduled            | Schedule, publish now, edit, delete |
| `scheduled`  | Queued for future publishing       | Unschedule, view queue position     |
| `uploading`  | Files being uploaded to DeviantArt | View progress (via logs)            |
| `publishing` | Metadata being submitted           | View progress (via logs)            |
| `published`  | Successfully posted                | View on DeviantArt, cannot edit     |
| `failed`     | Error occurred                     | View error, retry, edit, delete     |

### Field Tracking

**Timestamps:**

```typescript
createdAt: DateTime       // When deviation was created
updatedAt: DateTime       // Last modification
scheduledAt: DateTime?    // When user/automation scheduled
actualPublishAt: DateTime? // scheduledAt + jitter (actual queue time)
publishedAt: DateTime?    // When successfully published
lastRetryAt: DateTime?    // Last retry attempt
```

**Execution Tracking:**

```typescript
executionLockId: String // UUID lock for concurrent protection
  ? executionLockedAt
  : DateTime // Lock acquisition time
    ? executionVersion
    : Int; // Optimistic locking counter
postCountIncremented: Boolean; // Prevents double-incrementing quota
```

**Publishing Results:**

```typescript
deviationId: String // DeviantArt's deviation ID
  ? deviationUrl
  : String // Public URL
    ? errorMessage
    : String // Human-readable error
      ? errorCode
      : String // Machine-readable code
        ? retryCount
        : Int; // Number of retry attempts
```

---

## Upload Flow

### Step 1: Create Deviation

**POST /api/deviations**

```json
{
  "title": "My Artwork",
  "description": "Created with digital painting",
  "tags": ["digital art", "fantasy"],
  "categoryPath": "digitalart/paintings/fantasy",
  "isMature": false,
  "uploadMode": "single"
}
```

**Response:**

```json
{
  "id": "deviation-uuid",
  "status": "review",
  "title": "My Artwork",
  "files": []
}
```

**Status:** `review` (waiting for files)

### Step 2: Upload Files

**POST /api/uploads/presigned-url**

```json
{
  "deviationId": "deviation-uuid",
  "filename": "artwork.png",
  "contentType": "image/png",
  "fileSize": 2048576
}
```

**Response:**

```json
{
  "uploadUrl": "https://r2.example.com/presigned?...",
  "fileId": "file-uuid",
  "storageKey": "deviations/deviation-uuid/artwork.png"
}
```

**Client uploads to presigned URL:**

```bash
curl -X PUT "${uploadUrl}" \
  -H "Content-Type: image/png" \
  --upload-file artwork.png
```

**POST /api/uploads/confirm**

```json
{
  "fileId": "file-uuid"
}
```

**Status:** Still `review` (can attach more files or proceed to draft)

### Step 3: Mark as Draft

**PATCH /api/deviations/:id**

```json
{
  "status": "draft"
}
```

**Validation:**

- Must have at least 1 file
- Required fields: `title`

**Status:** `draft` (ready to schedule or publish)

### Step 4: Schedule

**POST /api/deviations/:id/schedule**

```json
{
  "scheduledAt": "2025-01-10T14:00:00Z"
}
```

**Validation:**

```typescript
const scheduledDate = new Date(scheduledAt);
const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
const maxScheduleTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

if (scheduledDate < oneHourFromNow) {
  throw new AppError(400, 'Scheduled time must be at least 1 hour in the future');
}

if (scheduledDate > maxScheduleTime) {
  throw new AppError(400, 'Cannot schedule more than 365 days in the future');
}
```

**Jitter Calculation:**

```typescript
// Generate random jitter (0-300 seconds = 0-5 minutes)
const jitterSeconds = Math.floor(Math.random() * 301);
const actualPublishAt = new Date(scheduledDate.getTime() + jitterSeconds * 1000);

// Update deviation
await prisma.deviation.update({
  where: { id },
  data: {
    status: 'scheduled',
    scheduledAt: scheduledDate,
    jitterSeconds,
    actualPublishAt,
  },
});

// Queue for publisher
await scheduleDeviation(id, userId, actualPublishAt, uploadMode);
```

**Status:** `scheduled` (queued in BullMQ with delay)

### Step 5: Publishing Queue Processes

**Worker picks up job** when `actualPublishAt` is reached.

---

## Publisher Queue Architecture

### Queue Configuration

**BullMQ Settings:**

```typescript
export const deviationPublisherQueue = new Queue<DeviationPublishJobData>('deviation-publisher', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: parseInt(process.env.PUBLISHER_MAX_ATTEMPTS || '7'),
    backoff: calculateBackoff, // Custom backoff strategy
    removeOnComplete: {
      age: 48 * 3600, // Keep completed jobs for 48 hours
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      count: 1000,
    },
  },
});
```

**Worker Settings:**

```typescript
export const deviationPublisherWorker = new Worker<DeviationPublishJobData>(
  'deviation-publisher',
  async (job) => {
    /* ... */
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.PUBLISHER_CONCURRENCY || '2'), // Max 2 concurrent jobs
    lockDuration: parseInt(process.env.PUBLISHER_JOB_TIMEOUT_MS || '1200000'), // 20 minutes
    stalledInterval: parseInt(process.env.PUBLISHER_STALE_CHECK_INTERVAL_MS || '60000'),
    maxStalledCount: parseInt(process.env.PUBLISHER_MAX_STALLED_COUNT || '2'),
    limiter: {
      max: parseInt(process.env.PUBLISHER_LIMITER_MAX || '2'), // 2 jobs per second
      duration: 1000,
    },
  }
);
```

**Why Low Concurrency?**

- DeviantArt rate limits are per OAuth token (per user)
- Multiple concurrent requests from same user trigger 429 errors
- Better to process sequentially with backoff

### Custom Backoff Strategy

**Adaptive Backoff:**

```typescript
function calculateBackoff(attemptsMade: number, err: Error): number {
  const errorMessage = err?.message || '';

  // 1. Rate limit error - respect Retry-After header
  if (errorMessage.includes('RATE_LIMITED')) {
    const match = errorMessage.match(/Wait (\d+)ms/);
    if (match) {
      const waitMs = parseInt(match[1]);
      console.log(`Rate limited - respecting Retry-After: ${waitMs}ms`);
      return waitMs;
    }
  }

  // 2. Circuit breaker open - wait for cooldown
  if (errorMessage.includes('CIRCUIT_OPEN')) {
    const waitMs = 30000; // 30 seconds
    console.log(`Circuit breaker open - waiting ${waitMs}ms`);
    return waitMs;
  }

  // 3. Default exponential backoff
  // 2s, 4s, 8s, 16s, 32s, 64s (max)
  const exponentialDelay = Math.min(2000 * Math.pow(2, attemptsMade), 64000);
  console.log(`Using exponential backoff: ${exponentialDelay}ms (attempt ${attemptsMade + 1})`);
  return exponentialDelay;
}
```

**Why Adaptive?**

- DeviantArt's rate limits vary (some endpoints have specific Retry-After headers)
- Circuit breaker prevents wasting retries during known outages
- Exponential backoff prevents thundering herd on transient errors

### Job Processing Flow

**1. Acquire Execution Lock**

```typescript
// UUID-based execution lock (prevents duplicate publishes)
const lockId = randomUUID();
const lockAcquired = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    status: 'scheduled',
    executionLockId: null, // Not locked by another job
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 },
  },
});

if (lockAcquired.count === 0) {
  // Another job got it first (race condition) or deviation was already published
  logger.warn('Failed to acquire execution lock - deviation already processing');
  return; // Exit job
}
```

**2. Update Status to Uploading**

```typescript
await prisma.deviation.update({
  where: { id: deviationId, executionLockId: lockId },
  data: { status: 'uploading', updatedAt: new Date() },
});
```

**3. Upload Files to DeviantArt**

```typescript
const fileRecords = await prisma.deviationFile.findMany({
  where: { deviationId },
  orderBy: { sortOrder: 'asc' },
});

for (const fileRecord of fileRecords) {
  // Download from storage (R2/S3/MinIO)
  const fileBuffer = await storage.downloadFile(fileRecord.storageKey);

  // Upload to DeviantArt (stash API)
  const uploadResult = await deviantArt.uploadFile(accessToken, fileBuffer, {
    filename: fileRecord.filename,
    contentType: fileRecord.mimeType,
  });

  // Store stash item ID for final publish step
  fileRecord.stashItemId = uploadResult.itemid;
}
```

**4. Update Status to Publishing**

```typescript
await prisma.deviation.update({
  where: { id: deviationId, executionLockId: lockId },
  data: { status: 'publishing', updatedAt: new Date() },
});
```

**5. Submit Metadata to DeviantArt**

```typescript
const publishResult = await deviantArt.publishDeviation(accessToken, {
  title: deviation.title,
  description: deviation.description,
  tags: deviation.tags,
  is_mature: deviation.isMature,
  mature_level: deviation.matureLevel,
  stash_itemids: fileRecords.map((f) => f.stashItemId), // Files from step 3
  categorypath: deviation.categoryPath,
  gallery_ids: deviation.galleryIds,
  allow_comments: deviation.allowComments,
  allow_free_download: deviation.allowFreeDownload,
  is_ai_generated: deviation.isAiGenerated,
});
```

**6. Mark as Published**

```typescript
await prisma.deviation.update({
  where: { id: deviationId, executionLockId: lockId },
  data: {
    status: 'published',
    deviationId: publishResult.deviationid,
    deviationUrl: publishResult.url,
    publishedAt: new Date(),
    errorMessage: null,
    errorCode: null,
    executionLockId: null, // Release lock
    executionLockedAt: null,
    updatedAt: new Date(),
  },
});
```

**7. Queue Storage Cleanup**

```typescript
// Delete files from R2/S3/MinIO (no longer needed)
await queueStorageCleanup(deviationId, userId);
```

**8. Increment Post Count**

```typescript
// Prevent double-incrementing on job retry
if (!deviation.postCountIncremented) {
  await prisma.user.update({
    where: { id: userId },
    data: { postCount: { increment: 1 } },
  });

  await prisma.deviation.update({
    where: { id: deviationId },
    data: { postCountIncremented: true },
  });
}
```

---

## Error Handling

### Error Categories

**1. Transient Errors (Retryable)**

```typescript
// Network errors, 5xx errors, DeviantArt rate limits
if (error.code === 'NETWORK_ERROR' || error.status >= 500) {
  throw new RetriableError(error.message);
}
```

**Action:** Retry with exponential backoff (up to 7 attempts).

**2. Permanent Errors (Not Retryable)**

```typescript
// Invalid metadata, file format rejected
if (error.code === 'INVALID_METADATA' || error.status === 400) {
  throw new PermanentError(error.message);
}
```

**Action:** Mark deviation as `failed` immediately (no retry).

**3. Token Expiration (Special Handling)**

```typescript
if (error.code === 'REFRESH_TOKEN_EXPIRED') {
  // Pause ALL scheduled posts for this user
  await prisma.deviation.updateMany({
    where: { userId, status: 'scheduled' },
    data: {
      status: 'draft',
      errorMessage: 'DeviantArt authentication expired. Please re-connect your account.',
    },
  });

  // Send notification email
  await sendRefreshTokenExpiredJobNotification(user, deviation.title);
}
```

**Action:** User must re-authenticate via OAuth.

### Failure Handling

**On Permanent Failure (7 attempts exhausted):**

```typescript
await prisma.deviation.update({
  where: { id: deviationId },
  data: {
    status: 'failed',
    errorMessage: error.message,
    errorCode: error.code,
    retryCount: job.attemptsMade,
    lastRetryAt: new Date(),
    executionLockId: null, // Release lock
    updatedAt: new Date(),
  },
});
```

**User Actions:**

- View error details
- Edit metadata and retry
- Contact support if DeviantArt issue

---

## Validation Rules

### Scheduling Validation

**Minimum Schedule Time:**

```typescript
const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
if (scheduledDate < oneHourFromNow) {
  throw new AppError(400, 'Scheduled time must be at least 1 hour in the future');
}
```

**Maximum Schedule Time:**

```typescript
const maxScheduleTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
if (scheduledDate > maxScheduleTime) {
  throw new AppError(400, 'Cannot schedule more than 365 days in the future');
}
```

### Status Validation

**Only Drafts and Failed Deviations Can Be Scheduled:**

```typescript
if (deviation.status !== 'draft' && deviation.status !== 'failed') {
  throw new AppError(400, 'Only drafts and failed deviations can be scheduled');
}
```

**Cannot Edit Published Deviations:**

```typescript
if (deviation.status === 'published') {
  throw new AppError(400, 'Cannot edit published deviation');
}
```

### File Validation

**Must Have Files:**

```typescript
if (!deviation.files || deviation.files.length === 0) {
  throw new AppError(400, 'Deviation must have at least one file');
}
```

---

## Queue Management

### De-Duplication

**Job ID Pattern:**

```typescript
const jobId = `deviation-${deviationId}`;
```

**Check Before Queueing:**

```typescript
const existingJob = await deviationPublisherQueue.getJob(jobId);
if (existingJob) {
  const state = await existingJob.getState();
  if (state === 'waiting' || state === 'delayed' || state === 'active') {
    console.log(`Job ${jobId} already exists with state ${state}, skipping`);
    return; // Don't queue duplicate
  }
  // Remove completed/failed jobs to allow re-queueing
  await existingJob.remove();
}
```

**Why?** Prevents duplicate publications if user schedules same deviation twice.

### Immediate Publishing

**POST /api/deviations/:id/publish**

```typescript
// Queue with delay=0
await publishDeviationNow(deviationId, userId, uploadMode);

// Internally:
await deviationPublisherQueue.add(
  'publish-deviation',
  { deviationId, userId, uploadMode },
  {
    delay: 0,
    jobId: `deviation-${deviationId}`,
  }
);
```

**Use Case:** "Publish now" button bypasses scheduling.

### Cancellation

**DELETE /api/deviations/:id** (while scheduled)

```typescript
// Cancel scheduled job
await cancelScheduledDeviation(deviationId);

// Internally:
const jobId = `deviation-${deviationId}`;
const job = await deviationPublisherQueue.getJob(jobId);
if (job) {
  await job.remove();
}
```

---

## Performance Considerations

### Worker Throughput

**Theoretical Max:**

- Concurrency: 2
- Limiter: 2 jobs/sec
- Max throughput: 7200 jobs/hour

**Actual Throughput:**

- Depends on DeviantArt API latency (~2-5 seconds per publish)
- Circuit breaker reduces throughput during rate limit events
- Typically: 100-500 publishes/hour

### Job Retention

**Completed Jobs:**

- Keep for 48 hours (debugging)
- Max 5000 jobs

**Failed Jobs:**

- Keep for 7 days (investigation)
- Max 1000 jobs

**Why Limits?** Prevent Redis memory exhaustion.

### Metrics Collection

**Tracked Metrics:**

```typescript
metricsCollector.recordSuccess(userId, uploadMode, processingTimeMs);
metricsCollector.recordFailure(userId, errorCategory);
metricsCollector.recordStalledJob(jobId);
metricsCollector.recordRateLimitHit(userId);
```

**Reporting:**

```typescript
// Every 5 minutes
const metrics = metricsCollector.getMetrics('5min');
console.log('[Publisher] Metrics:', JSON.stringify(metrics, null, 2));
```

---

## Graceful Shutdown

**SIGTERM Handler:**

```typescript
process.on('SIGTERM', async () => {
  console.log('[Publisher] Shutting down worker gracefully...');

  // 1. Stop accepting new jobs
  await deviationPublisherWorker.pause();

  // 2. Wait for active jobs to complete (max 30s)
  const activeJobs = await deviationPublisherQueue.getJobs(['active']);
  if (activeJobs.length > 0) {
    console.log(`[Publisher] Waiting for ${activeJobs.length} active jobs to complete...`);
    await Promise.race([
      Promise.all(activeJobs.map((job) => job.waitUntilFinished(queueEvents))),
      new Promise((resolve) => setTimeout(resolve, 30000)), // 30s timeout
    ]);
  }

  // 3. Shutdown metrics collector
  await metricsCollector.shutdown();

  // 4. Close worker and connections
  await deviationPublisherWorker.close();
  await deviationPublisherQueue.close();
  await connection.quit();

  console.log('[Publisher] Graceful shutdown complete');
  process.exit(0);
});
```

**Why 30s Drain Period?**

- Most publishes complete in 2-10 seconds
- 30s allows even slow jobs to finish
- Prevents aborted uploads (which waste DeviantArt quota)

---

## Troubleshooting

### "Deviation stuck in uploading"

**Cause:** Worker crashed mid-job.

**Solution:** Stuck job recovery runs every 5 minutes:

```typescript
// apps/isekai-publisher/src/jobs/stuck-job-recovery.ts
const JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes

const activeJobs = await deviationQueue.getActive();
for (const job of activeJobs) {
  const stalledTime = Date.now() - job.processedOn;
  if (stalledTime > JOB_TIMEOUT) {
    // Release execution lock
    await prisma.deviation.updateMany({
      where: { id: job.data.deviationId, executionLockId: { not: null } },
      data: { executionLockId: null, executionLockedAt: null },
    });
    await job.moveToFailed(new Error('Job stalled - recovered'), true);
  }
}
```

### "Rate limit errors despite low concurrency"

**Cause:** Multiple users or automations triggering simultaneously.

**Solution:** Circuit breaker pattern opens after 3 consecutive failures:

```typescript
// apps/isekai-publisher/src/lib/circuit-breaker.ts
if (error.status === 429) {
  circuitBreaker.recordFailure(userId);
  if (circuitBreaker.isOpen(userId)) {
    throw new Error('CIRCUIT_OPEN: Wait 5 minutes');
  }
}
```

### "Past-due recovery isn't running"

**Cause:** Past-due recovery job runs every 1 minute, may miss deviations if actualPublishAt is >1 minute ago.

**Solution:** Past-due recovery batches 50 at a time:

```typescript
const pastDueDeviations = await prisma.deviation.findMany({
  where: {
    status: 'scheduled',
    actualPublishAt: { lt: new Date() }, // Past due
    executionLockId: null, // Not locked
  },
  take: 50,
  orderBy: { actualPublishAt: 'asc' },
});
```

---

## Related Documentation

- `.context/database/models.md` - Deviation model details
- `.context/workers/publisher.md` - Publisher microservice architecture
- `.context/workers/background-jobs.md` - Recovery jobs
- `.context/architecture/patterns.md` - Execution lock, circuit breaker
- `.context/api/endpoints.md` - Deviation API routes
- `.context/glossary.md` - Status definitions

---

## Future Enhancements

**Planned Features:**

- **Progress tracking:** Real-time upload/publish progress
- **Bulk operations:** Schedule/publish multiple deviations at once
- **Draft templates:** Save metadata as template
- **Smart retry:** Skip permanent errors, aggressive retry for transient

**Not Planned:**

- Client-side file validation (use DeviantArt's API response)
- Multi-file diff upload (DeviantArt doesn't support)
