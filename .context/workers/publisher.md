# Publisher Worker - Microservice Architecture

**Purpose:** Dedicated worker microservice for background job processing
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)
**Location:** `apps/isekai-publisher/`

---

## Overview

**What:** Independent Node.js microservice that processes DeviantArt publishing jobs, token maintenance, and cleanup tasks.

**Why Separate from API:**
1. **Fault Isolation:** Publisher crashes don't affect API
2. **Independent Scaling:** Scale based on queue depth, not HTTP traffic
3. **Resource Isolation:** CPU-intensive jobs don't block API requests
4. **Zero-Downtime Deploys:** Update publisher while API serves requests
5. **Simplified Monitoring:** Dedicated health checks and metrics

**Communication:**
- **NO HTTP calls to API** - uses shared PostgreSQL database
- **Shared Redis** - BullMQ job queue
- **Shared Storage** - S3-compatible (R2/S3/MinIO)

---

## Architecture

### Process Structure

```
Main Process (apps/isekai-publisher/src/index.ts)
│
├─ Health Check Server (Express, port 8000)
│   ├─ GET /health (liveness probe)
│   ├─ GET /ready (readiness probe)
│   └─ GET /metrics (Prometheus metrics)
│
├─ Queue Workers (BullMQ)
│   ├─ deviation-publisher (concurrency: 5)
│   ├─ token-maintenance (concurrency: 1)
│   └─ r2-cleanup (concurrency: 2, planned)
│
├─ Background Jobs (node-cron)
│   ├─ auto-scheduler (every 5 minutes)
│   ├─ stuck-job-recovery (every 5 minutes)
│   ├─ past-due-recovery (every 1 minute)
│   └─ lock-cleanup (every 30 minutes)
│
└─ Graceful Shutdown Handler
    └─ 30-second drain period
```

### Health Check Server

**Purpose:** Provides liveness and readiness probes for container orchestration

**Endpoints:**

#### GET /health (Liveness)
Checks if process is running and responsive.

```typescript
{
  "status": "healthy",
  "service": "isekai-publisher",
  "uptime": 3600,  // seconds
  "timestamp": "2025-01-05T12:00:00.000Z"
}
```

**When to use:** Container orchestration (Docker, K8s) restarts container if this fails.

#### GET /ready (Readiness)
Checks if worker can process jobs (Redis connected, worker running).

```typescript
{
  "status": "ready",
  "service": "isekai-publisher",
  "worker": {
    "running": true,
    "activeJobs": 3
  },
  "redis": {
    "connected": true
  },
  "timestamp": "2025-01-05T12:00:00.000Z"
}
```

**Returns 503** if not ready.

**When to use:** Load balancer waits for "ready" before routing traffic (not applicable for publisher, but useful pattern).

#### GET /metrics (Prometheus)
Prometheus-compatible metrics export.

```text
# HELP publisher_active_jobs Number of jobs currently being processed
# TYPE publisher_active_jobs gauge
publisher_active_jobs 3

# HELP publisher_uptime_seconds Uptime of the publisher service in seconds
# TYPE publisher_uptime_seconds counter
publisher_uptime_seconds 3600
```

**Future Metrics:**
- `publisher_jobs_completed_total{status="success|failed"}`
- `publisher_job_duration_seconds{queue="deviation|token"}`

---

## Queue Workers

### 1. Deviation Publisher Worker

**Queue:** `deviation-publisher`
**Concurrency:** 5 (processes 5 jobs simultaneously)
**Location:** `apps/isekai-publisher/src/queues/deviation-publisher.ts`

**Purpose:** Publishes scheduled deviations to DeviantArt

**Job Flow:**
```
1. Dequeue job (deviationId)
2. Acquire execution lock (UUID-based)
3. Fetch deviation + files from database
4. Get user's valid access token
5. Check circuit breaker state
6. Apply rate limiter delay
7. Upload files to DeviantArt (Stash API)
8. Submit metadata (Publish API)
9. Update deviation status → published
10. Release execution lock
11. Record success metrics
```

**Error Handling:**
- **429 Rate Limit:** Trigger circuit breaker, exponential backoff
- **Network Error:** Retry with exponential backoff (max 7 attempts)
- **Auth Error:** Mark as failed, send email to user
- **Other Error:** Retry up to 7 times, then mark as failed

**Retry Configuration:**
```typescript
{
  attempts: 7,
  backoff: {
    type: 'exponential',
    delay: 5000  // 5s, 10s, 20s, 40s, 80s, 160s, 320s
  }
}
```

**Circuit Breaker Integration:**
```typescript
if (circuitBreaker.isOpen()) {
  // Skip publishing, let job requeue
  throw new Error('Circuit breaker open - rate limit protection');
}
```

**Adaptive Rate Limiter:**
```typescript
await rateLimiter.waitForSlot(userId);

try {
  await publishToDeviantArt(deviation);
  rateLimiter.recordSuccess(userId);
  circuitBreaker.recordSuccess();
} catch (error) {
  if (error.status === 429) {
    rateLimiter.recordFailure(userId, error.headers['retry-after']);
    circuitBreaker.recordFailure();
  }
  throw error;
}
```

### 2. Token Maintenance Worker

**Queue:** `token-maintenance`
**Concurrency:** 1 (sequential processing)
**Location:** `apps/isekai-publisher/src/queues/token-maintenance.ts`

**Purpose:** Proactively refresh OAuth tokens before 90-day expiry

**Job Flow:**
```
1. Find users with tokens expiring < 7 days
2. For each user:
   a. Call DeviantArt OAuth refresh endpoint
   b. Encrypt new tokens (AES-256-GCM)
   c. Update database
   d. Send email if < 7 days remaining
   e. Send urgent email if < 1 day remaining
3. Log results
```

**Schedule:** Every 6 hours (via cron job)

**Email Warnings:**
```typescript
if (daysUntilExpiry <= 7 && !user.refreshTokenWarningEmailSent) {
  await sendEmail({
    to: user.email,
    subject: 'DeviantArt Token Expiring Soon',
    body: 'Your refresh token expires in 7 days. Please re-authenticate.'
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokenWarningEmailSent: true }
  });
}
```

**Critical:** This prevents users losing access after 90 days.

### 3. R2 Cleanup Worker (Planned)

**Queue:** `r2-cleanup`
**Concurrency:** 2
**Status:** Database model exists, worker not implemented

**Purpose:** Delete orphaned files from S3-compatible storage

**Planned Logic:**
1. Find DeviationFiles deleted > 7 days ago
2. Delete corresponding S3 objects
3. Purge DeviationFile records

---

## Background Jobs (Cron)

### 1. Auto-Scheduler

**Schedule:** Every 5 minutes
**Location:** `apps/isekai-publisher/src/jobs/auto-scheduler.ts`

**Purpose:** Execute automation workflows - select drafts and schedule them

**See:** `.context/features/automation.md` for detailed workflow

**Brief Flow:**
```
1. Find enabled automations
2. For each automation:
   a. Acquire execution lock
   b. Check schedule rules (should run now?)
   c. Select drafts based on strategy (random, fifo, lifo)
   d. Apply default values (tags, description, etc.)
   e. Calculate schedule time + jitter
   f. Update deviations → scheduled status
   g. Optionally add to sale queue
   h. Release execution lock
   i. Log execution
```

**Execution Lock:**
```typescript
// Prevent concurrent automation runs
if (automation.isExecuting) {
  console.log('Automation already executing, skipping');
  return;
}

await prisma.automation.update({
  where: { id: automation.id },
  data: { isExecuting: true, lastExecutionLock: new Date() }
});

try {
  // Execute automation logic
  await scheduleDeviations(automation);
} finally {
  await prisma.automation.update({
    where: { id: automation.id },
    data: { isExecuting: false }
  });
}
```

### 2. Stuck Job Recovery

**Schedule:** Every 5 minutes
**Location:** `apps/isekai-publisher/src/jobs/stuck-job-recovery.ts`

**Purpose:** Detect and recover jobs stuck in "active" state due to worker crashes

**Logic:**
```typescript
const JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes

async function recoverStuckJobs() {
  const jobs = await deviationQueue.getActive();

  for (const job of jobs) {
    const stalledTime = Date.now() - job.processedOn;

    if (stalledTime > JOB_TIMEOUT) {
      console.log(`[Recovery] Job ${job.id} stalled for ${stalledTime}ms`);

      // Release execution lock in database
      await prisma.deviation.updateMany({
        where: {
          id: job.data.deviationId,
          executionLockId: { not: null }
        },
        data: { executionLockId: null, executionLockedAt: null }
      });

      // Move job to failed (BullMQ will retry)
      await job.moveToFailed(new Error('Job stalled - recovered'), true);
    }
  }
}
```

**Why Needed:**
Worker crashes leave jobs in "active" forever without recovery.

**Max Stalled Count:**
BullMQ automatically moves jobs to failed after 2 stall recoveries.

### 3. Past-Due Recovery

**Schedule:** Every 1 minute
**Location:** `apps/isekai-publisher/src/jobs/past-due-recovery.ts`

**Purpose:** Queue deviations whose `actualPublishAt` has passed

**Logic:**
```typescript
async function recoverPastDue() {
  const now = new Date();

  // Find scheduled deviations past their publish time
  const pastDue = await prisma.deviation.findMany({
    where: {
      status: 'scheduled',
      actualPublishAt: { lte: now },
      executionLockId: null  // Not currently being processed
    },
    take: 50  // Batch size
  });

  for (const deviation of pastDue) {
    console.log(`[Recovery] Past due: ${deviation.id} (${deviation.actualPublishAt})`);

    // Add to queue for immediate publishing
    await deviationQueue.add('publish', {
      deviationId: deviation.id
    }, {
      priority: 1  // High priority
    });
  }
}
```

**Why Needed:**
- Worker downtime during scheduled time
- Queue backlog causes delay
- Clock skew between servers

**Runs Frequently:**
1-minute interval ensures minimal delay for time-sensitive posts.

### 4. Lock Cleanup

**Schedule:** Every 30 minutes
**Location:** `apps/isekai-publisher/src/jobs/lock-cleanup.ts`

**Purpose:** Clear stale execution locks (>1 hour old)

**Logic:**
```typescript
async function cleanupStaleLocks() {
  const oneHourAgo = new Date(Date.now() - 3600000);

  // Find locks older than 1 hour
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

  console.log(`[Cleanup] Released ${result.count} stale locks`);
}
```

**Why Needed:**
Safety net for locks that weren't properly released (unexpected crashes, bugs).

**Conservative Timeout:**
1 hour ensures legitimate long-running jobs aren't interrupted.

---

## Graceful Shutdown

**Trigger:** Docker sends `SIGTERM` signal during deployment

**Flow:**
```typescript
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. Pause workers (stop accepting new jobs)
    await deviationPublisherWorker.pause();
    await tokenMaintenanceWorker.pause();

    // 2. Wait for active jobs to complete (max 30 seconds)
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 3. Close workers gracefully
    await deviationPublisherWorker.close();
    await tokenMaintenanceWorker.close();

    // 4. Close Redis connection
    await RedisClientManager.close();

    // 5. Close health check server
    if (healthCheckServer) {
      await new Promise(resolve => {
        healthCheckServer.close(() => resolve());
      });
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
}
```

**Signal Handlers:**
```typescript
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Why 30 Seconds:**
Balance between completing jobs and minimizing deployment time. Publishing typically takes 5-15 seconds.

**Container Orchestration:**
```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

Container restarted if health check fails 3 times.

---

## Error Handling

### Uncaught Exceptions

```typescript
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  setTimeout(() => process.exit(1), 5000);  // 5s delay for log flush
});
```

**Exits after 5 seconds** to allow logs to flush.

### Unhandled Promise Rejections

```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
  // Don't exit - log for debugging
});
```

### Worker-Level Error Handling

```typescript
deviationWorker.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
  // BullMQ automatically retries based on job config
});
```

---

## Monitoring & Observability

### Structured Logging

```typescript
console.log(JSON.stringify({
  level: 'info',
  message: 'Deviation published',
  deviationId: deviation.id,
  userId: deviation.userId,
  duration: Date.now() - startTime,
  timestamp: new Date().toISOString()
}));
```

**Future:** Integrate with logging service (Datadog, CloudWatch, etc.)

### Metrics Endpoint

**Current (Basic):**
```text
publisher_active_jobs 3
publisher_uptime_seconds 3600
```

**Planned:**
```text
publisher_jobs_completed_total{queue="deviation",status="success"} 1234
publisher_jobs_completed_total{queue="deviation",status="failed"} 45
publisher_job_duration_seconds_bucket{queue="deviation",le="10"} 1000
publisher_job_duration_seconds_bucket{queue="deviation",le="30"} 1200
publisher_job_duration_seconds_bucket{queue="deviation",le="+Inf"} 1234
```

**Prometheus Integration:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'isekai-publisher'
    static_configs:
      - targets: ['publisher:8000']
```

---

## Environment Variables

**Required:**
```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NODE_ENV=production
DEVIANTART_CLIENT_ID=...
DEVIANTART_CLIENT_SECRET=...
```

**Storage (S3-Compatible):**
```bash
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=isekai-uploads
S3_REGION=auto
S3_PATH_PREFIX=tenant-abc123  # Multi-tenant isolation
```

**Publisher Configuration:**
```bash
PUBLISHER_CONCURRENCY=5
PUBLISHER_MAX_ATTEMPTS=7
PUBLISHER_JOB_TIMEOUT_MS=600000  # 10 minutes
```

**Rate Limiter:**
```bash
RATE_LIMITER_ENABLED=true
RATE_LIMITER_BASE_DELAY_MS=3000
RATE_LIMITER_MAX_DELAY_MS=300000
RATE_LIMITER_JITTER_PERCENT=20
RATE_LIMITER_SUCCESS_DECREASE_FACTOR=0.9
RATE_LIMITER_FAILURE_INCREASE_FACTOR=2.0
```

**Circuit Breaker:**
```bash
CIRCUIT_BREAKER_ENABLED=true
CIRCUIT_BREAKER_THRESHOLD=3
CIRCUIT_BREAKER_OPEN_DURATION_MS=300000  # 5 minutes
CIRCUIT_BREAKER_PERSIST_TO_REDIS=true
```

**Health Checks:**
```bash
HEALTH_CHECK_PORT=8000
HEALTH_CHECK_ENABLED=true
```

---

## Deployment

**Docker:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN pnpm install --prod
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

**Docker Compose:**
```yaml
publisher:
  build: ./apps/isekai-publisher
  ports:
    - "8000:8000"  # Health checks
  environment:
    DATABASE_URL: ${DATABASE_URL}
    REDIS_URL: ${REDIS_URL}
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "wget", "--spider", "http://localhost:8000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

---

## Scaling

### Horizontal Scaling

**Easy:** Run multiple publisher instances

```yaml
# docker-compose.yml
publisher:
  # ... config
  deploy:
    replicas: 3  # 3 publisher instances
```

**BullMQ Handles Distribution:**
- Each worker picks jobs from shared queue
- Execution locks prevent duplicate processing
- No coordination needed between workers

**When to Scale:**
- Queue backlog growing
- Average job wait time increasing
- High publish volume (>100/hour)

### Vertical Scaling

**Increase Concurrency:**
```bash
PUBLISHER_CONCURRENCY=10  # Process 10 jobs simultaneously
```

**Trade-offs:**
- **More concurrency:** Faster processing, higher risk of rate limits
- **Less concurrency:** Safer, slower processing

**Recommended:** Start at 5, increase gradually while monitoring 429 errors.

---

## Related Files

- `.context/workers/background-jobs.md` - Detailed job documentation
- `.context/features/automation.md` - Auto-scheduler workflow
- `.context/architecture/patterns.md` - Circuit breaker, rate limiter patterns
- `.context/decisions/001-microservice-publisher.md` - Why separate microservice
- `apps/isekai-publisher/src/index.ts` - Main entry point
