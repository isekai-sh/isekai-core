# Prompt: Add Automation Rule Type

**Purpose:** Guide for extending the automation workflow system with new rule types

---

## Prerequisites

- [ ] Understand existing rule types (day of week, time range, daily quota)
- [ ] Database schema knowledge
- [ ] Auto-scheduler job understanding

---

## Step 1: Define Rule Type

**Questions to Answer:**
1. What scheduling behavior does this rule provide?
2. What parameters does it need?
3. How does it evaluate (boolean logic)?
4. Does it conflict with existing rules?

**Example:**
```
Type: Weekly Quota
Purpose: Limit posts per week (e.g., max 10 per week)
Parameters: maxPostsPerWeek (number)
Evaluation: Count posts in current week, allow if < max
Conflicts: None (can combine with other rules)
```

---

## Step 2: Update Prisma Schema

**File:** `packages/shared/prisma/schema.prisma`

```prisma
enum AutomationScheduleRuleType {
  day_of_week
  time_range
  daily_quota
  weekly_quota  // NEW
}

model AutomationScheduleRule {
  // ... existing fields ...

  // Add new rule-specific fields
  maxPostsPerWeek Int?  // For weekly_quota type
}
```

---

## Step 3: Add Validation Logic

**File:** `apps/isekai-backend/src/routes/automations.ts`

```typescript
// Zod schema for API validation
const scheduleRuleSchema = z.object({
  type: z.enum(["day_of_week", "time_range", "daily_quota", "weekly_quota"]),
  daysOfWeek: z.array(z.enum(["monday", "tuesday", /* ... */])).optional(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dailyQuota: z.number().int().positive().optional(),
  maxPostsPerWeek: z.number().int().positive().optional(), // NEW
}).refine((data) => {
  // Validate weekly_quota has required fields
  if (data.type === "weekly_quota") {
    return data.maxPostsPerWeek !== undefined;
  }
  return true;
}, { message: "weekly_quota requires maxPostsPerWeek" });
```

---

## Step 4: Implement Evaluation Logic

**File:** `apps/isekai-publisher/src/jobs/auto-scheduler.ts`

```typescript
async function evaluateScheduleRules(
  automation: Automation,
  rules: AutomationScheduleRule[],
  userTimezone: string
): Promise<boolean> {
  for (const rule of rules) {
    // ... existing rule evaluations ...

    // NEW: Weekly quota rule
    if (rule.type === "weekly_quota") {
      const startOfWeek = dateFnsTz.startOfWeek(new Date(), {
        weekStartsOn: 0, // Sunday
        timeZone: userTimezone,
      });

      const postsThisWeek = await prisma.automation ExecutionLog.count({
        where: {
          automationId: automation.id,
          executedAt: { gte: startOfWeek },
        },
      });

      if (postsThisWeek >= rule.maxPostsPerWeek!) {
        console.log(`Weekly quota reached: ${postsThisWeek}/${rule.maxPostsPerWeek}`);
        return false; // Don't schedule
      }
    }
  }

  return true; // All rules passed
}
```

---

## Step 5: Update Frontend

**File:** `apps/isekai-frontend/src/components/DefaultValueEditor.tsx`

```tsx
// Add UI for new rule type
{ruleType === "weekly_quota" && (
  <div>
    <Label htmlFor="maxPostsPerWeek">Max Posts Per Week</Label>
    <Input
      id="maxPostsPerWeek"
      type="number"
      min={1}
      value={rule.maxPostsPerWeek || ""}
      onChange={(e) =>
        updateRule(index, {
          ...rule,
          maxPostsPerWeek: parseInt(e.target.value),
        })
      }
    />
  </div>
)}
```

---

## Step 6: Add Tests

**Location:** `apps/isekai-publisher/src/jobs/auto-scheduler.test.ts`

```typescript
describe("Weekly Quota Rule", () => {
  it("should allow post if under weekly quota", async () => {
    const automation = await createAutomation({
      rules: [{ type: "weekly_quota", maxPostsPerWeek: 10 }],
    });

    // Simulate 5 posts this week
    await createExecutionLogs(automation.id, 5);

    const canSchedule = await evaluateScheduleRules(
      automation,
      automation.rules,
      "America/New_York"
    );

    expect(canSchedule).toBe(true);
  });

  it("should block post if weekly quota reached", async () => {
    const automation = await createAutomation({
      rules: [{ type: "weekly_quota", maxPostsPerWeek: 10 }],
    });

    // Simulate 10 posts this week (quota reached)
    await createExecutionLogs(automation.id, 10);

    const canSchedule = await evaluateScheduleRules(
      automation,
      automation.rules,
      "America/New_York"
    );

    expect(canSchedule).toBe(false);
  });
});
```

---

## Step 7: Update Documentation

**File:** `.context/features/automation.md`

```markdown
### Weekly Quota Rule

**Type:** `weekly_quota`

**Purpose:** Limit the number of posts per calendar week.

**Parameters:**
- `maxPostsPerWeek` (number) - Maximum posts allowed per week

**Evaluation:**
- Counts posts in current week (Sunday to Saturday)
- Timezone-aware (uses user's timezone)
- Allows scheduling if count < maxPostsPerWeek

**Example:**
```json
{
  "type": "weekly_quota",
  "maxPostsPerWeek": 10
}
```

**Use Cases:**
- Prevent overwhelming followers with too many posts
- Spread content evenly across weeks
- Comply with platform limits
```

---

## Checklist

- [ ] Prisma schema updated with new fields
- [ ] Zod validation added for API
- [ ] Evaluation logic implemented in auto-scheduler
- [ ] Frontend UI added for rule configuration
- [ ] Tests written for new rule type
- [ ] Documentation updated
- [ ] Tested with existing rules (no conflicts)

---

## Common Pitfalls

1. **Timezone Issues**
   - ❌ Use `new Date()` (server timezone)
   - ✅ Use `dateFnsTz.toZonedTime()` (user timezone)

2. **Missing Validation**
   - ❌ Allow rule without required parameters
   - ✅ Validate in Zod schema

3. **Performance**
   - ❌ Query all execution logs
   - ✅ Use `count()` with date filter

4. **Rule Conflicts**
   - ❌ Weekly quota overrides daily quota
   - ✅ All rules must pass (AND logic)

---

## Related Documentation

- `.context/features/automation.md`
- `.context/database/models.md`
- `.context/testing.md`
