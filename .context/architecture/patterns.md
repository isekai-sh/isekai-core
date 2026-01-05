# Architecture Patterns

**Purpose:** Key design patterns and their implementations
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## 1. Microservice Publisher Pattern

**Problem:** Long-running publishing jobs (30+ seconds) block API server, and crashes affect all requests.

**Solution:** Dedicated worker microservice for job processing.

**Implementation:**
```
Backend API → BullMQ Queue (Redis) → Publisher Worker
                                            ↓
                                      DeviantArt API
```

**Benefits:**
- **Fault Isolation:** Publisher crashes don't affect API
- **Independent Scaling:** Scale workers based on queue depth
- **Resource Isolation:** CPU-intensive jobs don't block API threads
- **Zero-Downtime Deploys:** Update publisher while API serves requests
- **Graceful Shutdown:** 30-second drain period completes in-flight jobs

**Key Files:**
- `apps/isekai-publisher/src/index.ts` - Worker lifecycle
- `apps/isekai-publisher/src/queues/deviation-publisher.ts` - Main job processor

**ADR:** `.context/decisions/001-microservice-publisher.md`

---

## 2. Execution Lock Pattern

**Problem:** Multiple automation executions or publisher workers can process the same deviation simultaneously, causing duplicate DeviantArt posts.

**Solution:** UUID-based optimistic locking with execution version counter.

**Implementation:**

```typescript
// Step 1: Acquire lock (atomic)
const lockId = randomUUID();
const locked = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    status: 'scheduled',
    executionLockId: null, // ← CRITICAL: Only if unlocked
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 }, // ← Optimistic locking
  },
});

if (locked.count === 0) {
  // Already locked by another process
  return null;
}

// Step 2: Do work
try {
  await publishToDeviantArt(deviation);

  // Step 3: Release lock and update status (verify still own lock)
  await prisma.deviation.update({
    where: {
      id: deviationId,
      executionLockId: lockId, // ← Verify ownership
    },
    data: {
      status: 'published',
      executionLockId: null,
      publishedAt: new Date(),
    },
  });
} catch (error) {
  // Release lock on failure
  await prisma.deviation.update({
    where: { id: deviationId, executionLockId: lockId },
    data: { executionLockId: null },
  });
  throw error;
}
```

**Why `updateMany` instead of `update`:**
- `updateMany` returns `{ count: number }` - can detect if lock acquisition failed
- `update` throws error if row doesn't match - harder to distinguish "not found" from "already locked"

**Lock Cleanup:**
Stale locks (>1 hour old) are cleaned every 30 minutes by `lock-cleanup` job.

**Key Files:**
- `apps/isekai-publisher/src/jobs/auto-scheduler.ts:150-200`
- `apps/isekai-publisher/src/queues/deviation-publisher.ts:50-100`
- `apps/isekai-publisher/src/jobs/lock-cleanup.ts`

**ADR:** `.context/decisions/002-execution-locks.md`

---

## 3. Circuit Breaker Pattern

**Problem:** Repeated API calls during rate limit periods worsen the situation and risk IP bans.

**Solution:** State machine that "opens" (blocks requests) after threshold failures, allowing service to recover.

**States:**
```
CLOSED (normal) ─┬─ 3 failures ──→ OPEN (reject all)
                 └─ success ─────→ CLOSED
                                       ↓
                               5 minutes pass
                                       ↓
                             HALF_OPEN (test with 1 request)
                               ↙           ↘
                          success       failure
                             ↓              ↓
                          CLOSED         OPEN
```

**Implementation (apps/isekai-publisher/src/lib/circuit-breaker.ts):**

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Too many failures, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;

  async shouldAllowRequest(key: string): Promise<boolean> {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true; // Allow all requests

      case CircuitState.OPEN:
        // Check if cooldown period (5 min) passed
        if (Date.now() - this.lastFailureTime >= 300000) {
          this.state = CircuitState.HALF_OPEN;
          return true; // Test with one request
        }
        return false; // Still cooling down

      case CircuitState.HALF_OPEN:
        // Allow limited test requests
        return this.halfOpenAttempts < 1;
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= 3) {
      this.state = CircuitState.OPEN;
      console.log('[CircuitBreaker] OPEN - too many 429s');
    }
  }

  recordSuccess() {
    this.failures = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      console.log('[CircuitBreaker] CLOSED - service recovered');
    }
  }
}
```

**Redis Persistence (v0.1.0+):**
State persisted to Redis for survival across worker restarts:
```typescript
await redis.set(`circuit:${key}`, JSON.stringify(state), 'EX', 600);
```

**Configuration:**
```bash
CIRCUIT_BREAKER_THRESHOLD=3            # Failures before opening
CIRCUIT_BREAKER_OPEN_DURATION_MS=300000  # 5 minutes
CIRCUIT_BREAKER_PERSIST_TO_REDIS=true
```

**ADR:** `.context/decisions/003-circuit-breaker.md`

---

## 4. Adaptive Rate Limiter Pattern

**Problem:** Fixed delays are either too slow (wasted time) or too fast (trigger 429s).

**Solution:** Dynamic delay that decreases on success, increases on failure.

**Algorithm:**

```typescript
class AdaptiveRateLimiter {
  private baseDelay = 3000; // Start at 3 seconds
  private maxDelay = 300000; // Cap at 5 minutes

  async waitForSlot(userId: string) {
    const state = await this.getState(userId);

    // Check Retry-After header from DeviantArt
    if (state.retryAfter && state.retryAfter > Date.now()) {
      const waitMs = state.retryAfter - Date.now();
      await sleep(waitMs);
      return;
    }

    // Apply adaptive delay with jitter
    const delay = this.addJitter(state.baseDelay);
    await sleep(delay);
  }

  recordSuccess(userId: string) {
    // Decrease delay by 10% on success
    state.baseDelay *= 0.9;
    state.baseDelay = Math.max(state.baseDelay, this.baseDelay);
    state.consecutiveSuccesses++;
    state.consecutiveFailures = 0;
  }

  recordFailure(userId: string, retryAfterHeader?: string) {
    // Double delay on 429 failure
    state.baseDelay *= 2.0;
    state.baseDelay = Math.min(state.baseDelay, this.maxDelay);
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;

    // Parse Retry-After header
    if (retryAfterHeader) {
      state.retryAfter = this.parseRetryAfter(retryAfterHeader);
    }
  }

  addJitter(delay: number): number {
    // Add ±20% randomization
    const jitter = delay * 0.2;
    return delay + (Math.random() * 2 - 1) * jitter;
  }
}
```

**Retry-After Header Parsing:**
Supports both formats:
- `Retry-After: 120` (seconds)
- `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` (HTTP-date)

**Redis Coordination (v0.1.0-alpha.3+):**
State stored in Redis for cross-worker coordination:
```typescript
await redis.set(`rate-limit:${userId}`, JSON.stringify(state), 'EX', 3600);
```

**Key Files:**
- `apps/isekai-publisher/src/lib/rate-limiter.ts`

---

## 5. Job Recovery Patterns

**Problem:** Workers crash, containers restart, jobs get stuck in "active" state permanently.

**Solutions:**

### A. Stuck Job Recovery (every 5 minutes)

```typescript
async function recoverStuckJobs() {
  const jobs = await deviationQueue.getActive();

  for (const job of jobs) {
    const stalledTime = Date.now() - job.processedOn;

    if (stalledTime > JOB_TIMEOUT) {
      console.log(`[Recovery] Job ${job.id} stalled for ${stalledTime}ms`);

      // Release execution lock
      await prisma.deviation.updateMany({
        where: {
          id: job.data.deviationId,
          executionLockId: { not: null },
        },
        data: { executionLockId: null },
      });

      // Requeue job (BullMQ handles this internally)
      await job.moveToFailed(new Error('Job stalled'), true);
    }
  }
}
```

### B. Past-Due Recovery (every 1 minute)

```typescript
async function recoverPastDue() {
  const now = new Date();

  // Find scheduled deviations past their publish time
  const pastDue = await prisma.deviation.findMany({
    where: {
      status: 'scheduled',
      actualPublishAt: { lte: now },
      executionLockId: null, // Not currently being processed
    },
    take: 50, // Batch size
  });

  for (const deviation of pastDue) {
    console.log(`[Recovery] Past due: ${deviation.id}`);
    await deviationQueue.add('publish', { deviationId: deviation.id });
  }
}
```

### C. Lock Cleanup (every 30 minutes)

```typescript
async function cleanupStaleLocks() {
  const oneHourAgo = new Date(Date.now() - 3600000);

  const result = await prisma.deviation.updateMany({
    where: {
      executionLockId: { not: null },
      executionLockedAt: { lte: oneHourAgo }, // Locked > 1 hour ago
    },
    data: {
      executionLockId: null,
      executionLockedAt: null,
    },
  });

  console.log(`[Cleanup] Released ${result.count} stale locks`);
}
```

**Key Files:**
- `apps/isekai-publisher/src/jobs/stuck-job-recovery.ts`
- `apps/isekai-publisher/src/jobs/past-due-recovery.ts`
- `apps/isekai-publisher/src/jobs/lock-cleanup.ts`

---

## 6. Cache Strategy Pattern

**Problem:** Repeated API calls to DeviantArt for gallery/browse data are slow and hit rate limits.

**Solution:** Redis cache with stale-while-revalidate pattern.

**Implementation:**

```typescript
async function getGalleries(userId: string, forceRefresh = false) {
  const cacheKey = `galleries:${userId}`;

  if (!forceRefresh) {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { data, cachedAt } = JSON.parse(cached);
      const age = Date.now() - cachedAt;

      if (age < FRESH_TTL) {
        // Fresh cache (< 5 minutes)
        return data;
      } else if (age < STALE_TTL) {
        // Stale but usable (< 2 hours)
        // Return stale, revalidate in background
        this.revalidateInBackground(userId);
        return data;
      }
    }
  }

  // Cache miss or too old - fetch fresh
  const fresh = await deviantArtApi.getGalleries(userId);

  await redis.set(
    cacheKey,
    JSON.stringify({ data: fresh, cachedAt: Date.now() }),
    'EX',
    STALE_TTL
  );

  return fresh;
}
```

**TTL Configuration:**
- **Fresh**: 5 minutes (return immediately)
- **Stale**: 2 hours (return but revalidate)
- **Expired**: > 2 hours (force fetch)

**Database Cache Models (v0.1.0-alpha.1+):**
- `GalleryCache` - Persistent cache with TTL
- `BrowseCache` - Browse results cache

---

## 7. Storage Abstraction Pattern

**Problem (v0.1.0-alpha.3):** Hardcoded Cloudflare R2 prevents using AWS S3 or MinIO for development/self-hosting.

**Solution:** Abstract storage interface with multiple backends.

**Interface:**

```typescript
interface StorageService {
  upload(file: Buffer, key: string, contentType: string): Promise<void>;
  getPresignedUrl(key: string, operation: 'getObject' | 'putObject', expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}
```

**Factory Pattern:**

```typescript
export function getStorageService(): StorageService {
  const endpoint = process.env.S3_ENDPOINT;

  if (endpoint?.includes('r2.cloudflarestorage.com')) {
    return new R2StorageService();
  } else if (endpoint?.includes('amazonaws.com')) {
    return new S3StorageService();
  } else {
    return new MinIOStorageService(); // Self-hosted
  }
}
```

**Multi-Tenant Support (v0.1.0-alpha.3+):**

```typescript
class StorageService {
  private getKey(key: string): string {
    const prefix = process.env.S3_PATH_PREFIX || '';
    return prefix ? `${prefix}/${key}` : key;
  }

  async upload(file: Buffer, key: string) {
    const fullKey = this.getKey(key); // tenant-abc123/deviations/...
    await this.s3.putObject({ Bucket: this.bucket, Key: fullKey, Body: file });
  }
}
```

**Key Files:**
- `apps/isekai-backend/src/lib/storage.ts`
- `apps/isekai-publisher/src/lib/storage.ts`

---

## 8. Session Store Auto-Detection Pattern

**Problem (v0.1.0-alpha.3):** Forcing Redis for sessions makes local development harder.

**Solution:** Auto-detect Redis availability, fall back to PostgreSQL.

**Implementation:**

```typescript
export async function createSessionStore() {
  const REDIS_URL = process.env.REDIS_URL;

  if (REDIS_URL) {
    try {
      const redis = await RedisClientManager.getClient();
      console.log('[Session] Using RedisStore');
      return new RedisStore({ client: redis });
    } catch (error) {
      console.warn('[Session] Redis unavailable, falling back to PostgreSQL');
    }
  }

  console.log('[Session] Using PrismaSessionStore (PostgreSQL)');
  return new PrismaSessionStore(prisma, {
    checkPeriod: 2 * 60 * 1000, // Cleanup every 2 minutes
    ttl: 30 * 24 * 60 * 60, // 30 days
  });
}
```

**Benefits:**
- Production: Use Redis for performance
- Development: No Redis requirement
- Fallback: Automatic if Redis fails

**Key Files:**
- `apps/isekai-backend/src/lib/session-store.ts`

---

## 9. Post Count Guard Pattern

**Problem:** Job retries can increment user's `postCount` multiple times for the same deviation.

**Solution:** Idempotency flag on deviation model.

**Implementation:**

```typescript
// In publisher worker after successful publish
if (!deviation.postCountIncremented) {
  await prisma.user.update({
    where: { id: deviation.userId },
    data: { postCount: { increment: 1 } },
  });

  await prisma.deviation.update({
    where: { id: deviation.id },
    data: { postCountIncremented: true }, // Guard flag
  });
}
```

**Why Important:**
- BullMQ retries jobs on failure (up to 7 attempts)
- Without guard, user's postCount increments 7 times
- Breaks analytics and metrics

**Key Files:**
- `apps/isekai-publisher/src/queues/deviation-publisher.ts:200`

---

## 10. Graceful Shutdown Pattern

**Problem:** Killing worker mid-job loses work and leaves locks orphaned.

**Solution:** Signal handler with drain period.

**Implementation:**

```typescript
let isShuttingDown = false;

// Signal handler (Docker sends SIGTERM)
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received');
  isShuttingDown = true;

  // Stop accepting new jobs
  await deviationWorker.pause();
  await tokenWorker.pause();

  // Wait 30 seconds for in-flight jobs to complete
  console.log('[Shutdown] Draining active jobs (30s)...');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Close workers gracefully
  await deviationWorker.close();
  await tokenWorker.close();
  await cleanupWorker.close();

  // Close database connections
  await prisma.$disconnect();
  await redis.quit();

  console.log('[Shutdown] Graceful shutdown complete');
  process.exit(0);
});
```

**Container Health Checks:**
```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:8000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**Key Files:**
- `apps/isekai-publisher/src/index.ts:130-160`

---

## Related Files

- `.context/architecture/overview.md` - System architecture
- `.context/architecture/dependencies.md` - Tech stack
- `.context/decisions/` - ADRs explaining pattern choices
- `.context/boundaries.md` - What not to modify (execution locks, circuit breaker, etc.)
- `.context/anti-patterns.md` - Common mistakes violating these patterns
