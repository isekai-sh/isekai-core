# Prompt: Add Test Coverage

**Purpose:** Guide for increasing test coverage in Isekai Core

**Goal:** 30% baseline coverage (v0.1.0-alpha.5), targeting 60% for v1.0

---

## Step 1: Check Current Coverage

```bash
# Run tests with coverage report
pnpm test:coverage

# Open coverage report
open coverage/index.html
```

**Identify:**
- Files with < 30% coverage (red)
- Critical paths with low coverage (auth, publishing, locks)
- Untested functions

---

## Step 2: Prioritize What to Test

### High Priority (Must Have Tests)

1. **Authentication Logic**
   - OAuth flow
   - Session management
   - Token refresh

2. **Publishing System**
   - Execution locks
   - Queue processing
   - Error handling

3. **Automation Workflow**
   - Schedule rule evaluation
   - Draft selection
   - Execution flow

4. **Critical Business Logic**
   - Validation functions
   - Data transformations
   - State transitions

### Low Priority (Can Skip)

- UI components (visual, hard to test)
- Simple getters/setters
- Third-party library wrappers

---

## Step 3: Write Unit Tests

### Test Pure Functions

```typescript
// lib/jitter.ts
export function calculateJitter(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// lib/jitter.test.ts
import { describe, it, expect, vi } from "vitest";
import { calculateJitter } from "./jitter";

describe("calculateJitter", () => {
  it("should return value within range", () => {
    // Mock Math.random to return 0.5
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = calculateJitter(0, 300);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(300);

    vi.restoreAllMocks();
  });

  it("should handle zero range", () => {
    const result = calculateJitter(0, 0);
    expect(result).toBe(0);
  });
});
```

---

## Step 4: Write Integration Tests

### Test API Endpoints

```typescript
// routes/automations.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../index";
import { prisma } from "../db";

describe("POST /api/automations", () => {
  let userId: string;
  let authCookie: string;

  beforeEach(async () => {
    // Setup: Create test user and get auth cookie
    const user = await prisma.user.create({
      data: {
        deviantartId: "123456",
        deviantartUsername: "testuser",
        accessToken: "encrypted_token",
        refreshToken: "encrypted_refresh",
        tokenExpiresAt: new Date(Date.now() + 3600000),
        refreshTokenExpiresAt: new Date(Date.now() + 86400000),
      },
    });
    userId = user.id;

    const loginResponse = await request(app)
      .post("/api/auth/mock-login")
      .send({ userId });
    authCookie = loginResponse.headers["set-cookie"][0];
  });

  it("should create automation with schedule rules", async () => {
    const response = await request(app)
      .post("/api/automations")
      .set("Cookie", authCookie)
      .send({
        name: "Test Automation",
        enabled: true,
        scheduleRules: [
          {
            type: "day_of_week",
            daysOfWeek: ["monday", "wednesday", "friday"],
          },
        ],
      })
      .expect(201);

    expect(response.body.automation.name).toBe("Test Automation");
    expect(response.body.automation.scheduleRules).toHaveLength(1);
  });

  it("should return 401 if not authenticated", async () => {
    await request(app)
      .post("/api/automations")
      .send({ name: "Test Automation" })
      .expect(401);
  });

  it("should validate schedule rule parameters", async () => {
    const response = await request(app)
      .post("/api/automations")
      .set("Cookie", authCookie)
      .send({
        name: "Test Automation",
        scheduleRules: [
          {
            type: "daily_quota",
            // Missing dailyQuota parameter
          },
        ],
      })
      .expect(400);

    expect(response.body.error).toContain("validation");
  });
});
```

---

## Step 5: Write Database Tests

### Test Prisma Queries

```typescript
// db/user.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./index";

describe("User Model", () => {
  beforeEach(async () => {
    // Clean database before each test
    await prisma.user.deleteMany();
  });

  it("should create user with encrypted tokens", async () => {
    const user = await prisma.user.create({
      data: {
        deviantartId: "123456",
        deviantartUsername: "artist",
        accessToken: "encrypted_token",
        refreshToken: "encrypted_refresh",
        tokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      },
    });

    expect(user.id).toBeDefined();
    expect(user.deviantartId).toBe("123456");
  });

  it("should enforce unique deviantartId", async () => {
    await prisma.user.create({
      data: {
        deviantartId: "123456",
        deviantartUsername: "artist",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      },
    });

    // Attempt to create duplicate
    await expect(
      prisma.user.create({
        data: {
          deviantartId: "123456", // Duplicate
          deviantartUsername: "artist2",
          accessToken: "token",
          refreshToken: "refresh",
          tokenExpiresAt: new Date(),
          refreshTokenExpiresAt: new Date(),
        },
      })
    ).rejects.toThrow(/Unique constraint failed/);
  });
});
```

---

## Step 6: Mock External APIs

### Mock DeviantArt API

```typescript
import { vi } from "vitest";

// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      userid: "123456",
      username: "testuser",
      usericon: "http://example.com/avatar.png",
    }),
  } as Response);
});

afterEach(() => {
  vi.clearAllMocks();
});
```

---

## Step 7: Test Edge Cases

**Common Edge Cases:**

1. **Empty Lists**
   ```typescript
   it("should handle empty deviation list", async () => {
     const result = await prisma.deviation.findMany({
       where: { userId: "nonexistent" },
     });
     expect(result).toEqual([]);
   });
   ```

2. **Null/Undefined Values**
   ```typescript
   it("should handle optional fields", async () => {
     const deviation = await prisma.deviation.create({
       data: {
         title: "Test",
         userId: "user123",
         // description is optional
       },
     });
     expect(deviation.description).toBeNull();
   });
   ```

3. **Boundary Conditions**
   ```typescript
   it("should handle time range at midnight", () => {
     const result = evaluateTimeRange({
       timeStart: "23:00",
       timeEnd: "01:00",
     }, "00:30");
     expect(result).toBe(true);
   });
   ```

4. **Race Conditions**
   ```typescript
   it("should prevent duplicate publishes with execution lock", async () => {
     const deviationId = "dev123";

     // Simulate two workers trying to lock same deviation
     const [result1, result2] = await Promise.all([
       acquireExecutionLock(deviationId),
       acquireExecutionLock(deviationId),
     ]);

     // Only one should succeed
     expect([result1, result2].filter(Boolean)).toHaveLength(1);
   });
   ```

---

## Step 8: Measure Improvement

```bash
# Run tests with coverage
pnpm test:coverage

# Check coverage report
# Coverage increased from 25% → 35% ✅
```

---

## Checklist

- [ ] Current coverage measured
- [ ] Priority areas identified
- [ ] Unit tests written for pure functions
- [ ] Integration tests written for API endpoints
- [ ] Database tests written for Prisma queries
- [ ] External APIs mocked
- [ ] Edge cases tested
- [ ] Coverage report shows improvement
- [ ] Tests pass consistently

---

## Common Pitfalls

1. **Testing Implementation Details**
   - ❌ Test internal variables
   - ✅ Test public API behavior

2. **Flaky Tests**
   - ❌ Tests depend on timing or randomness
   - ✅ Mock time and random functions

3. **Missing Cleanup**
   - ❌ Tests leave data in database
   - ✅ Clean up in `beforeEach`/`afterEach`

4. **Testing Third-Party Code**
   - ❌ Test Prisma's query logic
   - ✅ Test your business logic

---

## Test Templates

### API Endpoint Test Template

```typescript
describe("POST /api/endpoint", () => {
  it("should succeed with valid data", async () => {});
  it("should return 401 if not authenticated", async () => {});
  it("should return 400 if validation fails", async () => {});
  it("should return 404 if resource not found", async () => {});
});
```

### Pure Function Test Template

```typescript
describe("myFunction", () => {
  it("should return expected output for valid input", () => {});
  it("should handle edge cases", () => {});
  it("should throw error for invalid input", () => {});
});
```

---

## Related Documentation

- `.context/testing.md`
- `.context/ai-rules.md`
- `.context/workflows.md`
