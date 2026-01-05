# Prompt: Fix a Bug

**Purpose:** Systematic approach to debugging and fixing bugs in Isekai Core

---

## Step 1: Reproduce the Bug

**Checklist:**
- [ ] Can you reproduce the bug locally?
- [ ] What are the exact steps to reproduce?
- [ ] Is it consistent or intermittent?
- [ ] What is the expected behavior?
- [ ] What is the actual behavior?

**Document:**
```
Steps to Reproduce:
1. Navigate to /automation
2. Click "Create Automation"
3. Add schedule rule with time range 23:00-01:00
4. Save automation

Expected: Automation saves successfully
Actual: Error "timeEnd must be after timeStart"
```

---

## Step 2: Gather Information

### Check Logs

```bash
# Backend logs
docker-compose logs -f backend

# Publisher logs
docker-compose logs -f publisher

# Frontend console (browser DevTools)
```

### Check Database State

```bash
# Open Prisma Studio
DATABASE_URL="..." pnpm --filter @isekai/shared prisma:studio

# Query directly
psql "postgresql://..." -c "SELECT * FROM deviations WHERE id = 'xxx';"
```

### Check Redis State (if applicable)

```bash
# Connect to Redis
docker exec -it isekai-redis redis-cli

# Check circuit breaker state
GET circuit-breaker:state

# Check queue
LRANGE bull:deviation-publisher:wait 0 -1
```

---

## Step 3: Identify Root Cause

**Common Bug Categories:**

### 1. Validation Error
- Issue: Input rejected by Zod schema
- Location: API route handlers
- Fix: Update validation schema

### 2. Race Condition
- Issue: Concurrent operations conflict
- Location: Publisher worker, auto-scheduler
- Fix: Add execution locks

### 3. Timezone Bug
- Issue: Time calculations incorrect
- Location: Auto-scheduler, time range evaluation
- Fix: Use `date-fns-tz` with user timezone

### 4. State Synchronization
- Issue: Frontend shows stale data
- Location: TanStack Query cache
- Fix: Add cache invalidation

### 5. API Error
- Issue: DeviantArt API returns unexpected response
- Location: Publisher worker
- Fix: Add error handling, update types

---

## Step 4: Write a Failing Test

**Before fixing the bug, write a test that reproduces it:**

```typescript
// Example: Time range across midnight
describe("Time Range Rule", () => {
  it("should allow time range across midnight", async () => {
    const rule = {
      type: "time_range",
      timeStart: "23:00",
      timeEnd: "01:00", // Next day
    };

    // Test at 23:30 (should pass)
    const result1 = await evaluateTimeRange(rule, "23:30", "America/New_York");
    expect(result1).toBe(true);

    // Test at 00:30 (should pass)
    const result2 = await evaluateTimeRange(rule, "00:30", "America/New_York");
    expect(result2).toBe(true);

    // Test at 02:00 (should fail)
    const result3 = await evaluateTimeRange(rule, "02:00", "America/New_York");
    expect(result3).toBe(false);
  });
});
```

**Run the test:**

```bash
pnpm test -- fix-bug.test.ts
```

**Result:** Test should fail (reproducing the bug).

---

## Step 5: Fix the Bug

**Example Fix:**

```typescript
// BEFORE (buggy code)
function evaluateTimeRange(rule, currentTime) {
  return currentTime >= rule.timeStart && currentTime <= rule.timeEnd;
  // ❌ Fails for ranges across midnight (23:00-01:00)
}

// AFTER (fixed code)
function evaluateTimeRange(rule, currentTime, timezone) {
  const { timeStart, timeEnd } = rule;

  // Handle time range across midnight
  if (timeStart > timeEnd) {
    // Range like 23:00-01:00
    return currentTime >= timeStart || currentTime <= timeEnd;
  } else {
    // Normal range like 09:00-17:00
    return currentTime >= timeStart && currentTime <= timeEnd;
  }
}
```

---

## Step 6: Verify the Fix

**Run the test again:**

```bash
pnpm test -- fix-bug.test.ts
```

**Result:** Test should pass.

**Manual Testing:**

1. Reproduce the original bug steps
2. Verify expected behavior now works
3. Test edge cases
4. Check for regressions

---

## Step 7: Add Additional Tests

**Cover edge cases:**

```typescript
it("should handle exact time boundaries", () => {
  const rule = { type: "time_range", timeStart: "09:00", timeEnd: "17:00" };

  expect(evaluateTimeRange(rule, "09:00")).toBe(true); // Exact start
  expect(evaluateTimeRange(rule, "17:00")).toBe(true); // Exact end
  expect(evaluateTimeRange(rule, "08:59")).toBe(false); // Just before
  expect(evaluateTimeRange(rule, "17:01")).toBe(false); // Just after
});
```

---

## Step 8: Update Documentation (if needed)

**If the bug revealed unclear behavior:**

```markdown
## Time Range Rules

**Time ranges can span midnight:**

✅ Valid: `23:00-01:00` (11 PM to 1 AM next day)
✅ Valid: `09:00-17:00` (9 AM to 5 PM same day)

**Evaluation:**
- If timeStart > timeEnd: Range spans midnight
- If timeStart < timeEnd: Range is same-day
```

---

## Step 9: Create Pull Request

**Commit Message:**

```
fix(automation): handle time ranges across midnight

Time range rules like 23:00-01:00 were incorrectly validated,
rejecting valid ranges that span midnight.

Updated evaluation logic to detect midnight-spanning ranges
and adjust boolean logic accordingly.

Fixes #42
```

**PR Description:**

```markdown
## Summary
Fixes time range validation for rules that span midnight.

## Root Cause
Time range evaluation used simple comparison (start <= current <= end),
which fails when end < start (midnight-spanning ranges).

## Fix
Added logic to detect midnight-spanning ranges (start > end) and
use OR logic instead of AND logic.

## Testing
- Added test for midnight-spanning ranges
- Added tests for edge cases (exact boundaries)
- Manual testing confirmed fix
```

---

## Checklist

- [ ] Bug reproduced locally
- [ ] Root cause identified
- [ ] Failing test written
- [ ] Fix implemented
- [ ] Test passes
- [ ] Edge cases tested
- [ ] Manual testing performed
- [ ] Documentation updated (if needed)
- [ ] Commit follows conventional commits
- [ ] Pull request created

---

## Common Debugging Techniques

### 1. Binary Search

- Comment out half the code
- If bug disappears, bug is in commented section
- Repeat until bug isolated

### 2. Rubber Duck Debugging

- Explain the code line-by-line to someone (or a rubber duck)
- Often reveals the issue during explanation

### 3. Git Bisect

```bash
# Find commit that introduced bug
git bisect start
git bisect bad  # Current commit has bug
git bisect good v0.1.0-alpha.3  # This version was good
# Git will checkout commits, test each with `git bisect good/bad`
```

### 4. Add Logging

```typescript
console.log("[DEBUG] currentTime:", currentTime);
console.log("[DEBUG] timeStart:", timeStart);
console.log("[DEBUG] timeEnd:", timeEnd);
console.log("[DEBUG] result:", result);
```

---

## Related Documentation

- `.context/testing.md`
- `.context/anti-patterns.md`
- `.context/errors.md`
