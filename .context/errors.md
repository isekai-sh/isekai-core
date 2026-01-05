# Error Codes & Handling

**Purpose:** Complete catalog of error codes, categories, and handling patterns
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Error Categories

### Transient Errors (Retryable)

**Can be resolved by retrying:**
- Network timeouts
- DeviantArt 5xx errors
- Rate limit (429) errors
- Database connection errors

**Handling:** Exponential backoff, circuit breaker.

### Permanent Errors (Not Retryable)

**Cannot be resolved by retrying:**
- Invalid metadata (400)
- Resource not found (404)
- Token expired (401)
- Permission denied (403)

**Handling:** Mark as failed, notify user.

### System Errors

**Internal application errors:**
- Database constraint violations
- Missing environment variables
- Storage failures
- Worker crashes

**Handling:** Log error, alert admin, return 500.

---

## HTTP Status Codes

| Code | Name | Category | Retry? |
|------|------|----------|--------|
| 200 | OK | Success | - |
| 201 | Created | Success | - |
| 204 | No Content | Success | - |
| 400 | Bad Request | Client Error | No |
| 401 | Unauthorized | Client Error | No |
| 403 | Forbidden | Client Error | No |
| 404 | Not Found | Client Error | No |
| 409 | Conflict | Client Error | No |
| 429 | Too Many Requests | Rate Limit | Yes |
| 500 | Internal Server Error | Server Error | Yes |
| 502 | Bad Gateway | Server Error | Yes |
| 503 | Service Unavailable | Server Error | Yes |

---

## Application Error Codes

### Authentication Errors

#### UNAUTHORIZED
```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```
**HTTP:** 401
**Cause:** No session or invalid API key
**Solution:** Login or provide valid API key

#### REFRESH_TOKEN_EXPIRED
```json
{
  "error": "DeviantArt authentication expired. Please re-connect your account.",
  "code": "REFRESH_TOKEN_EXPIRED"
}
```
**HTTP:** 401
**Cause:** 90-day refresh token expired
**Solution:** User must re-login via OAuth
**Auto-Action:** All scheduled posts paused

#### FORBIDDEN
```json
{
  "error": "Insufficient permissions",
  "code": "FORBIDDEN"
}
```
**HTTP:** 403
**Cause:** User lacks required role
**Solution:** Contact admin

### Validation Errors

#### VALIDATION_ERROR
```json
{
  "error": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "scheduledAt",
    "message": "Scheduled time must be at least 1 hour in the future"
  }
}
```
**HTTP:** 400
**Cause:** Invalid request body (Zod validation)
**Solution:** Fix input and retry

### Resource Errors

#### NOT_FOUND
```json
{
  "error": "Deviation not found",
  "code": "NOT_FOUND"
}
```
**HTTP:** 404
**Cause:** Resource doesn't exist or user doesn't own it
**Solution:** Check resource ID

#### CONFLICT
```json
{
  "error": "Deviation already in queue",
  "code": "CONFLICT"
}
```
**HTTP:** 409
**Cause:** Duplicate resource
**Solution:** Skip or update existing

### Rate Limit Errors

#### RATE_LIMITED
```json
{
  "error": "Too many requests. Try again later.",
  "code": "RATE_LIMITED",
  "retryAfter": 60
}
```
**HTTP:** 429
**Cause:** Application rate limit exceeded
**Solution:** Wait `retryAfter` seconds

#### DEVIANTART_RATE_LIMITED
```json
{
  "error": "Rate limited by DeviantArt. Please try again later.",
  "code": "DEVIANTART_RATE_LIMITED",
  "retryAfter": 300
}
```
**HTTP:** 429
**Cause:** DeviantArt API rate limit
**Solution:** Wait 5 minutes, circuit breaker activates

### System Errors

#### INTERNAL_ERROR
```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```
**HTTP:** 500
**Cause:** Unexpected server error
**Solution:** Check logs, report if persistent

#### DATABASE_ERROR
```json
{
  "error": "Database operation failed",
  "code": "DATABASE_ERROR"
}
```
**HTTP:** 500
**Cause:** Database query failed
**Solution:** Check database connectivity

#### UPSTREAM_ERROR
```json
{
  "error": "Failed to fetch data from DeviantArt",
  "code": "UPSTREAM_ERROR",
  "details": {
    "service": "DeviantArt API",
    "endpoint": "/browse/home"
  }
}
```
**HTTP:** 500
**Cause:** Upstream service (DeviantArt) error
**Solution:** Wait and retry, check DeviantArt status

---

## Publisher Worker Error Codes

### CIRCUIT_OPEN
```typescript
throw new Error("CIRCUIT_OPEN: Rate limit protection active. Wait 5 minutes.");
```
**Category:** Transient
**Retry:** Yes (after circuit closes)
**Cause:** Circuit breaker opened after 3 consecutive 429 errors
**Backoff:** 30 seconds

### NETWORK_ERROR
```typescript
throw new Error("NETWORK_ERROR: Failed to connect to DeviantArt");
```
**Category:** Transient
**Retry:** Yes
**Backoff:** Exponential (2s, 4s, 8s, ...)

### INVALID_METADATA
```typescript
throw new Error("INVALID_METADATA: Title exceeds 200 characters");
```
**Category:** Permanent
**Retry:** No
**Action:** Mark as failed, notify user

---

## Error Categorizer

**File:** `/apps/isekai-publisher/src/lib/error-categorizer.ts`

```typescript
export class ErrorCategorizer {
  isTransient(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('econnrefused') || message.includes('etimedout')) {
      return true;
    }

    // DeviantArt 5xx errors
    if (message.includes('502') || message.includes('503')) {
      return true;
    }

    // Rate limits
    if (message.includes('rate_limited') || message.includes('429')) {
      return true;
    }

    return false;
  }

  isPermanent(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Validation errors
    if (message.includes('invalid') || message.includes('validation')) {
      return true;
    }

    // Auth errors
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return true;
    }

    return false;
  }
}
```

---

## Retry Strategies

### Exponential Backoff

```typescript
function calculateBackoff(attempt: number): number {
  // 2s, 4s, 8s, 16s, 32s, 64s (max)
  return Math.min(2000 * Math.pow(2, attempt), 64000);
}
```

**Use:** Network errors, DeviantArt 5xx errors.

### Rate Limit Backoff

```typescript
if (error.message.includes('RATE_LIMITED')) {
  // Extract wait time from error
  const match = error.message.match(/Wait (\d+)ms/);
  if (match) {
    return parseInt(match[1]); // Respect Retry-After
  }
}
```

**Use:** DeviantArt 429 responses with Retry-After header.

### Circuit Breaker Backoff

```typescript
if (error.message.includes('CIRCUIT_OPEN')) {
  return 30000; // 30 seconds
}
```

**Use:** Circuit breaker open, wait for potential close.

---

## Error Logging

### Structured Logger

```typescript
const logger = StructuredLogger.createJobLogger(job);

logger.error("Failed to upload file", {
  deviationId: deviation.id,
  filename: file.filename,
  error: error.message,
  stack: error.stack,
});
```

**Includes:**
- Job ID
- Deviation ID
- User ID
- Attempt number
- Error message & stack trace

### Error Persistence

**Stored in Deviation:**
```typescript
await prisma.deviation.update({
  where: { id: deviationId },
  data: {
    status: 'failed',
    errorMessage: error.message,  // User-facing
    errorCode: error.code,
    retryCount: job.attemptsMade,
  },
});
```

**Stored in Sale Queue:**
```typescript
await prisma.saleQueue.update({
  where: { id: queueItemId },
  data: {
    status: 'failed',
    errorMessage: error.message,
    errorDetails: {
      stack: error.stack,
      code: error.code,
      context: { /* ... */ },
    },
  },
});
```

---

## User-Facing Error Messages

### Generic Errors

**User Sees:**
> "Something went wrong. Please try again."

**Developer Sees:** Full error in logs with stack trace.

### Specific Errors

**Rate Limit:**
> "DeviantArt rate limit reached. Please wait 5 minutes and try again."

**Token Expired:**
> "Your DeviantArt authentication has expired. Please log in again."

**Validation Error:**
> "Scheduled time must be at least 1 hour in the future."

**Maintenance:**
> "DeviantArt is currently under maintenance. Your post will be published automatically when service resumes."

---

## Error Recovery Jobs

### Stuck Job Recovery

**Runs:** Every 5 minutes
**Detects:** Jobs running >10 minutes
**Action:** Release execution lock, requeue

### Past-Due Recovery

**Runs:** Every 1 minute
**Detects:** Scheduled deviations past `actualPublishAt`
**Action:** Queue for immediate publishing

### Lock Cleanup

**Runs:** Every 30 minutes
**Detects:** Execution locks >1 hour old
**Action:** Release stale locks

---

## Troubleshooting

### "Job keeps failing with 429"

**Check:**
1. Circuit breaker enabled? (`CIRCUIT_BREAKER_ENABLED=true`)
2. Rate limiter configured? (`RATE_LIMITER_ENABLED=true`)
3. Concurrency too high? (Reduce `PUBLISHER_CONCURRENCY`)

**Solution:**
- Lower concurrency to 2
- Increase `RATE_LIMITER_BASE_DELAY_MS` to 5000 (5 seconds)

### "Jobs timing out"

**Check:**
- Job timeout: `PUBLISHER_JOB_TIMEOUT_MS=600000` (10 minutes)
- Network latency to DeviantArt

**Solution:**
- Increase timeout to 20 minutes (1200000ms)
- Check network connectivity

### "Permanent errors not retrying"

**Expected Behavior:** Permanent errors should NOT retry.

**Check Error Code:**
- 400 errors → Permanent (fix input)
- 404 errors → Permanent (resource deleted)
- 500 errors → Transient (retry)

---

## Related Documentation

- `.context/workers/publisher.md` - Publisher error handling
- `.context/features/publishing.md` - Publishing error flow
- `.context/architecture/patterns.md` - Circuit breaker, adaptive rate limiter
- `.context/api/responses.md` - API error formats
