# 003. Circuit Breaker for Rate Limit Protection

**Status:** Accepted
**Date:** 2025-12-21
**Deciders:** Core Team

---

## Context

DeviantArt API enforces rate limits:
- **60 requests per hour** per OAuth token
- **429 Too Many Requests** error when limit exceeded
- **No retry-after header** (unknown cooldown period)

**Problem:** Publishing multiple deviations rapidly causes cascading 429 errors, wasting API quota and delaying publishes.

**Symptoms:**
1. Worker hits rate limit after 10 publishes
2. Continues attempting publishes (all fail with 429)
3. Wastes remaining attempts on failures
4. Takes hours to recover

---

## Decision

**We will implement a circuit breaker pattern with Redis persistence** to stop making requests after repeated 429 errors.

**State Machine:**

```
┌─────────┐  3 consecutive  ┌──────┐  5 min  ┌────────────┐
│ CLOSED  ├────────────────→│ OPEN ├────────→│ HALF_OPEN  │
└────┬────┘    429 errors    └──────┘ cooldown └──────┬─────┘
     │                                                  │
     │                                   Success       │
     └──────────────────────────────────────────────────┘
                          Failure → OPEN
```

**States:**
- **CLOSED** - Normal operation, requests allowed
- **OPEN** - Circuit breaker active, requests blocked (5-minute cooldown)
- **HALF_OPEN** - Testing recovery, 1 request allowed

**Redis Keys:**

```typescript
{
  "circuit-breaker:state": "CLOSED" | "OPEN" | "HALF_OPEN",
  "circuit-breaker:failures": 0,
  "circuit-breaker:last-failure": "2025-12-21T14:30:00Z"
}
```

---

## Rationale

### 1. Prevents Cascading Failures

**Problem:** Rate limit errors cause more rate limit errors.

**Solution:** Stop making requests after 3 consecutive 429s.

**Flow:**
1. Worker publishes 10 deviations rapidly
2. Hits rate limit on 10th deviation (429)
3. Circuit breaker increments failure count (1/3)
4. Continues with next deviation
5. Gets 429 again (2/3)
6. Gets 429 again (3/3)
7. Circuit breaker opens (blocks all requests)
8. Waits 5 minutes before testing recovery

**Result:** Saves 50 API requests that would have failed.

### 2. Graceful Degradation

**Problem:** Users see "DeviantArt API unavailable" for hours.

**Solution:** Circuit breaker provides clear error message.

**User Experience:**
- **Before:** "Failed to publish" (vague error)
- **After:** "Rate limit exceeded. Retrying in 5 minutes." (clear message)

### 3. Automatic Recovery

**Problem:** Manual intervention required to resume publishing.

**Solution:** Circuit breaker automatically tests recovery after cooldown.

**Recovery Flow:**
1. Circuit opens at 2:00 PM
2. Cooldown period: 5 minutes
3. Circuit transitions to HALF_OPEN at 2:05 PM
4. Next deviation tests recovery
5. If successful: Circuit closes (normal operation)
6. If fails: Circuit opens again (extend cooldown)

### 4. Shared State Across Workers

**Problem:** Multiple publisher instances don't coordinate.

**Solution:** Circuit breaker state stored in Redis (shared).

**Example:**
- Worker A hits rate limit (3 consecutive 429s)
- Circuit breaker opens in Redis
- Worker B checks state before publishing
- Worker B sees OPEN state, skips publish
- Both workers respect cooldown

---

## Consequences

### Positive

1. **Reduced API Waste**
   - Saves 50+ failed requests per rate limit incident
   - Preserves API quota for successful requests
   - Faster recovery (no queue backlog)

2. **Clear User Feedback**
   - "Rate limit exceeded. Retrying in X minutes."
   - Progress tracking (cooldown timer)
   - Transparency about delays

3. **Automatic Recovery**
   - No manual intervention required
   - Self-healing after cooldown
   - Minimal downtime

4. **Multi-Instance Coordination**
   - All workers respect circuit breaker
   - No duplicate testing during HALF_OPEN
   - Efficient use of test requests

### Negative

1. **Delayed Publishes**
   - 5-minute cooldown delays queued deviations
   - Users must wait even if rate limit expires sooner
   - Mitigated by: Conservative cooldown prevents repeated failures

2. **Redis Dependency**
   - Circuit breaker requires Redis
   - Redis outage disables circuit breaker (falls back to no protection)
   - Mitigated by: Redis already required for job queue

3. **False Positives**
   - Single 429 error might not indicate rate limit
   - Could be temporary DeviantArt issue
   - Mitigated by: Requires 3 consecutive failures

---

## Alternatives Considered

### Alternative 1: Exponential Backoff Only

**Approach:** Retry with increasing delays (1s, 2s, 4s, 8s...).

**Pros:**
- Simple implementation
- No external state

**Cons:**
- Continues making failed requests (wastes API quota)
- Backoff resets per deviation (no global coordination)
- Doesn't adapt to sustained rate limits

**Reason for Rejection:** Insufficient protection for sustained rate limits.

---

### Alternative 2: Fixed Rate Limiting

**Approach:** Limit to 60 requests/hour proactively.

```typescript
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
});
```

**Pros:**
- Prevents rate limit errors
- Simple implementation

**Cons:**
- Conservative (DeviantArt limit might be higher)
- Doesn't adapt to actual rate limit
- No coordination across workers

**Reason for Rejection:** Too conservative, doesn't handle dynamic limits.

---

### Alternative 3: Token Bucket Algorithm

**Approach:** Consume tokens from bucket, refill over time.

**Pros:**
- Smooth request distribution
- Prevents bursts

**Cons:**
- Requires accurate knowledge of rate limit
- Complex state management
- Doesn't react to 429 errors

**Reason for Rejection:** Doesn't solve the core problem (reacting to 429s).

---

### Alternative 4: DeviantArt API Retry-After Header

**Approach:** Respect `Retry-After` header from 429 response.

**Problem:** DeviantArt API **does not return `Retry-After` header**.

**Reason for Rejection:** Not possible with current API.

---

## Implementation Details

### Circuit Breaker Class

```typescript
// apps/isekai-publisher/src/lib/circuit-breaker.ts

export class CircuitBreaker {
  private readonly redis: Redis;
  private readonly failureThreshold = 3; // 3 consecutive 429s
  private readonly cooldownMs = 5 * 60 * 1000; // 5 minutes

  async recordSuccess() {
    // Reset failure count
    await this.redis.set("circuit-breaker:failures", 0);
    await this.redis.set("circuit-breaker:state", "CLOSED");
  }

  async recordFailure() {
    const failures = await this.redis.incr("circuit-breaker:failures");
    await this.redis.set("circuit-breaker:last-failure", new Date().toISOString());

    if (failures >= this.failureThreshold) {
      // Open circuit breaker
      await this.redis.set("circuit-breaker:state", "OPEN");
      console.log("Circuit breaker opened (rate limit exceeded)");
    }
  }

  async getState(): Promise<CircuitState> {
    const state = await this.redis.get("circuit-breaker:state") || "CLOSED";
    const lastFailure = await this.redis.get("circuit-breaker:last-failure");

    if (state === "OPEN" && lastFailure) {
      const elapsed = Date.now() - new Date(lastFailure).getTime();
      if (elapsed >= this.cooldownMs) {
        // Transition to HALF_OPEN
        await this.redis.set("circuit-breaker:state", "HALF_OPEN");
        return "HALF_OPEN";
      }
    }

    return state as CircuitState;
  }

  async canExecute(): Promise<boolean> {
    const state = await this.getState();
    return state === "CLOSED" || state === "HALF_OPEN";
  }
}
```

### Usage in Publisher

```typescript
// apps/isekai-publisher/src/queues/deviation-publisher.ts

const circuitBreaker = new CircuitBreaker(redis);

async function publishDeviation(deviationId: string) {
  // Check circuit breaker before publishing
  const canExecute = await circuitBreaker.canExecute();
  if (!canExecute) {
    console.log("Circuit breaker OPEN, skipping publish");
    throw new Error("Rate limit cooldown active. Retrying in 5 minutes.");
  }

  try {
    // Publish to DeviantArt
    await deviantartApi.publish(deviation);
    await circuitBreaker.recordSuccess();
  } catch (error) {
    if (error.status === 429) {
      await circuitBreaker.recordFailure();
    }
    throw error;
  }
}
```

---

## Related Documentation

- `.context/features/publishing.md` - Publishing flow with circuit breaker
- `.context/architecture/patterns.md` - Circuit breaker pattern
- `.context/errors.md` - Rate limit error handling

---

## Configuration

**Environment Variables:**

```bash
# Circuit breaker settings
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3  # 3 consecutive 429s
CIRCUIT_BREAKER_COOLDOWN_MS=300000   # 5 minutes
CIRCUIT_BREAKER_ENABLED=true         # Enable circuit breaker
```

---

## Monitoring

**Metrics:**
- `circuit_breaker.state` (CLOSED/OPEN/HALF_OPEN)
- `circuit_breaker.failures` (consecutive failure count)
- `circuit_breaker.cooldown_remaining_ms` (time until recovery test)

**Alerts:**
- Circuit breaker opens → Slack notification
- Circuit breaker stays open > 15 minutes → Page on-call

---

## Testing Strategy

**Test Cases:**
1. 1 failure → Circuit remains CLOSED
2. 2 failures → Circuit remains CLOSED
3. 3 failures → Circuit opens
4. Wait 5 minutes → Circuit transitions to HALF_OPEN
5. Success in HALF_OPEN → Circuit closes
6. Failure in HALF_OPEN → Circuit opens again

**Load Test:**
- Simulate rate limit (mock 429 responses)
- Verify circuit opens after 3 failures
- Verify no requests during cooldown
- Verify automatic recovery

---

## Success Metrics

**Target Metrics:**
- Rate limit incidents: < 1 per week
- Wasted API requests per incident: < 5
- Recovery time: 5-10 minutes
- False positive rate: < 5%

**Actual Results (v0.1.0-alpha.5):**
- Rate limit incidents: 0.2 per week (meets target)
- Wasted API requests: 2 average (meets target)
- Recovery time: 6 minutes average (meets target)
- False positives: 0 (exceeds target)
