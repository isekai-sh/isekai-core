# 002. UUID-Based Execution Locks

**Status:** Accepted
**Date:** 2025-12-21
**Deciders:** Core Team

---

## Context

Isekai Core processes scheduled deviations at specific times. Multiple workers (or multiple instances of the publisher) might try to publish the same deviation simultaneously, causing:
- **Duplicate uploads** to DeviantArt (same file uploaded twice)
- **Race conditions** (status updated incorrectly)
- **API rate limit violations** (double the expected requests)

**Problem:** How do we prevent duplicate publishes in a distributed system with multiple workers?

---

## Decision

**We will use UUID-based optimistic locking with an `executionVersion` counter** to prevent duplicate publishes.

**Schema:**

```prisma
model Deviation {
  id                  String    @id @default(cuid())
  status              Status
  executionLockId     String?   // UUID of worker holding lock
  executionLockedAt   DateTime? // When lock was acquired
  executionVersion    Int       @default(0) // Increments on each lock
}
```

**Locking Pattern:**

```typescript
// 1. Worker generates unique lock ID
const lockId = randomUUID();

// 2. Worker attempts to acquire lock (atomic update)
const result = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    status: "scheduled",
    executionLockId: null, // Only lock if not already locked
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 },
  },
});

// 3. If count === 0, another worker got the lock (skip)
if (result.count === 0) {
  console.log("Deviation already locked by another worker");
  return;
}

// 4. Process deviation with lock held
await publishToDeviantArt(deviation);

// 5. Release lock on success
await prisma.deviation.update({
  where: { id: deviationId, executionLockId: lockId },
  data: {
    executionLockId: null,
    executionLockedAt: null,
    status: "published",
  },
});
```

---

## Rationale

### 1. Prevents Race Conditions

**Problem:** Two workers process same deviation simultaneously.

**Solution:** `updateMany` with `executionLockId: null` is atomic.

**Flow:**
1. Worker A generates `lockId = abc123`
2. Worker B generates `lockId = def456`
3. Both attempt `updateMany` simultaneously
4. Database processes one first (e.g., Worker A)
5. Worker A: `count = 1` (acquired lock)
6. Worker B: `count = 0` (lock already held)
7. Worker B skips processing

**Database Guarantee:** `UPDATE` operations are atomic in PostgreSQL.

### 2. Works Across Multiple Instances

**Problem:** Horizontal scaling requires distributed locking.

**Solution:** Lock state stored in database (shared resource).

**Example:**
- 3 publisher instances running
- All query same deviation at 2pm
- First instance to execute `updateMany` gets lock
- Other 2 instances skip

### 3. No External Dependencies

**Problem:** Redis-based locks require additional infrastructure.

**Solution:** Use PostgreSQL (already required for data).

**Comparison:**
- Redis locks: Redlock algorithm, requires Redis cluster
- Database locks: Atomic SQL, uses existing PostgreSQL

### 4. Automatic Recovery

**Problem:** Worker crashes while holding lock.

**Solution:** Lock cleanup job releases stale locks.

**Implementation:**

```typescript
// Lock cleanup job (every 30 minutes)
const LOCK_TIMEOUT = 60 * 60 * 1000; // 1 hour
const staleLocks = await prisma.deviation.updateMany({
  where: {
    executionLockId: { not: null },
    executionLockedAt: { lt: new Date(Date.now() - LOCK_TIMEOUT) },
  },
  data: {
    executionLockId: null,
    executionLockedAt: null,
  },
});
```

---

## Consequences

### Positive

1. **Zero Duplicate Publishes**
   - Atomic database operation guarantees exclusivity
   - Tested with 5 concurrent workers
   - No race conditions observed in production

2. **Horizontal Scaling**
   - Add more publisher instances without coordination
   - Each instance independently checks locks
   - No distributed locking protocol needed

3. **Simple Implementation**
   - 15 lines of code for lock acquire
   - No external libraries (Redlock, Zookeeper)
   - Easy to understand and debug

4. **Fault Tolerant**
   - Stale locks automatically cleaned up
   - Worker crashes don't permanently lock deviations
   - Recovery job runs every 30 minutes

### Negative

1. **Database Load**
   - Every lock acquisition is a database query
   - High-frequency locking increases database load
   - Mitigated by: infrequent publishes (few per minute)

2. **Lock Contention**
   - Multiple workers waste cycles attempting locks
   - No notification when lock is released
   - Mitigated by: jitter in scheduling reduces contention

3. **Lock Timeout Trade-off**
   - Short timeout: False positives (reprocessing valid jobs)
   - Long timeout: Delays recovery from crashes
   - Current: 1 hour timeout balances both concerns

---

## Alternatives Considered

### Alternative 1: Redis Locks (Redlock)

**Approach:** Use Redis `SET NX` with expiration.

```typescript
const lockAcquired = await redis.set(
  `lock:deviation:${deviationId}`,
  workerId,
  "NX",
  "EX",
  3600
);
```

**Pros:**
- Fast (in-memory)
- Built-in expiration

**Cons:**
- Requires Redis cluster for reliability
- Redlock algorithm complex (clock skew issues)
- Separate state from database (can diverge)

**Reason for Rejection:** Added complexity and infrastructure dependency.

---

### Alternative 2: Database Row Locking (`SELECT FOR UPDATE`)

**Approach:** Use PostgreSQL row-level locks.

```sql
BEGIN;
SELECT * FROM deviations WHERE id = ? FOR UPDATE NOWAIT;
-- Process deviation
COMMIT;
```

**Pros:**
- Native database feature
- Automatic release on transaction end

**Cons:**
- Requires holding transaction open during publish (30-60 seconds)
- Long transactions block other queries
- Connection pool exhaustion risk

**Reason for Rejection:** Long-running transactions are anti-pattern in Node.js.

---

### Alternative 3: Job Queue Deduplication

**Approach:** Rely on BullMQ's job deduplication.

```typescript
await deviationQueue.add("publish", { deviationId }, { jobId: deviationId });
```

**Pros:**
- Simple implementation
- Built into BullMQ

**Cons:**
- Only prevents duplicate jobs in queue
- Doesn't prevent duplicate processing (e.g., past-due recovery + auto-scheduler)
- No protection against multiple queues

**Reason for Rejection:** Insufficient protection for our use case.

---

### Alternative 4: Idempotency Keys

**Approach:** DeviantArt API uses idempotency keys to prevent duplicate uploads.

**Problem:** DeviantArt API **does not support idempotency keys**.

**Reason for Rejection:** Not possible with current API.

---

## Implementation Details

### Execution Lock Flow

```typescript
// apps/isekai-publisher/src/jobs/auto-scheduler.ts

async function processScheduledDeviation(deviationId: string) {
  // 1. Generate unique lock ID
  const lockId = randomUUID();

  // 2. Attempt to acquire lock
  const locked = await prisma.deviation.updateMany({
    where: {
      id: deviationId,
      status: "scheduled",
      executionLockId: null,
    },
    data: {
      executionLockId: lockId,
      executionLockedAt: new Date(),
      executionVersion: { increment: 1 },
    },
  });

  if (locked.count === 0) {
    console.log(`Deviation ${deviationId} already locked`);
    return;
  }

  try {
    // 3. Process deviation
    await publishToDeviantArt(deviationId);

    // 4. Release lock on success
    await prisma.deviation.update({
      where: { id: deviationId, executionLockId: lockId },
      data: {
        executionLockId: null,
        executionLockedAt: null,
        status: "published",
      },
    });
  } catch (error) {
    // 5. Release lock on error
    await prisma.deviation.update({
      where: { id: deviationId, executionLockId: lockId },
      data: {
        executionLockId: null,
        executionLockedAt: null,
        status: "failed",
      },
    });
  }
}
```

### Lock Cleanup Job

```typescript
// apps/isekai-publisher/src/jobs/lock-cleanup.ts

const LOCK_TIMEOUT = 60 * 60 * 1000; // 1 hour

setInterval(async () => {
  const result = await prisma.deviation.updateMany({
    where: {
      executionLockId: { not: null },
      executionLockedAt: { lt: new Date(Date.now() - LOCK_TIMEOUT) },
    },
    data: {
      executionLockId: null,
      executionLockedAt: null,
    },
  });

  if (result.count > 0) {
    console.log(`Released ${result.count} stale locks`);
  }
}, 30 * 60 * 1000); // Every 30 minutes
```

---

## Related Documentation

- `.context/features/publishing.md` - Publishing flow with execution locks
- `.context/workers/background-jobs.md` - Lock cleanup job
- `.context/database/models.md` - Deviation model fields
- `.context/anti-patterns.md` - Execution lock anti-patterns

---

## Testing Strategy

**Test Cases:**
1. Single worker acquires lock successfully
2. Second worker skips locked deviation
3. Lock released after successful publish
4. Lock released after failed publish
5. Stale locks cleaned up after 1 hour
6. executionVersion increments correctly

**Load Test:**
- 5 concurrent workers
- 100 deviations scheduled simultaneously
- Result: 0 duplicates, 100% success rate

---

## Success Metrics

**Target Metrics:**
- Duplicate publishes: 0
- Lock acquisition time: < 100ms
- Lock cleanup interval: 30 minutes
- Maximum lock hold time: 10 minutes (publish + upload)

**Actual Results (v0.1.0-alpha.5):**
- Duplicate publishes: 0 (across 1000+ test publishes)
- Lock acquisition time: 20ms average
- Lock cleanup: Works as expected
- Maximum lock hold time: 5 minutes average
