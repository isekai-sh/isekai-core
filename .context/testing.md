# Testing Strategy

**Purpose:** Test infrastructure, patterns, and coverage expectations
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

Isekai Core uses **Vitest** for unit and integration testing with a **30% baseline coverage requirement** (v0.1.0-alpha.2+).

**Test Types:**

- Unit tests (functions, utilities)
- Integration tests (API routes)
- Database tests (Prisma queries)

**Framework:** Vitest (faster alternative to Jest)

---

## Test Infrastructure

### Configuration

**File:** `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 30, // Baseline: 30% line coverage
      functions: 30,
      branches: 30,
      statements: 30,
    },
  },
});
```

### Setup File

**File:** `test/setup.ts`

```typescript
import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db';

// Setup test database
beforeAll(async () => {
  // Run migrations
  await prisma.$executeRaw`CREATE SCHEMA IF NOT EXISTS test`;
});

// Cleanup after tests
afterAll(async () => {
  await prisma.$disconnect();
});
```

---

## Running Tests

### Commands

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch

# Run specific file
pnpm test src/routes/auth.test.ts
```

### CI/CD Integration

**GitHub Actions:**

```yaml
- name: Run tests
  run: pnpm test:coverage

- name: Check coverage
  run: |
    if [ $(jq '.total.lines.pct' coverage/coverage-summary.json) -lt 30 ]; then
      echo "Coverage below 30% threshold"
      exit 1
    fi
```

---

## Test Patterns

### Unit Tests

**Testing Pure Functions:**

```typescript
// src/lib/jitter.test.ts
import { describe, it, expect } from 'vitest';
import { calculateJitter } from './jitter';

describe('calculateJitter', () => {
  it('should return value within range', () => {
    const result = calculateJitter(0, 300);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(300);
  });

  it('should handle zero range', () => {
    const result = calculateJitter(0, 0);
    expect(result).toBe(0);
  });
});
```

### Integration Tests

**Testing API Routes:**

```typescript
// src/routes/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../db';

describe('POST /api/auth/deviantart/callback', () => {
  beforeEach(async () => {
    // Clean database
    await prisma.user.deleteMany();
  });

  it('should create session on valid OAuth code', async () => {
    const response = await request(app)
      .get('/api/auth/deviantart/callback')
      .query({ code: 'valid_code' });

    expect(response.status).toBe(302);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should reject invalid code', async () => {
    const response = await request(app)
      .get('/api/auth/deviantart/callback')
      .query({ code: 'invalid' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('error');
  });
});
```

### Database Tests

**Testing Prisma Queries:**

```typescript
// src/db/user.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from './index';

describe('User Model', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('should create user with encrypted tokens', async () => {
    const user = await prisma.user.create({
      data: {
        deviantartId: '123456',
        deviantartUsername: 'artist',
        accessToken: 'encrypted_token',
        refreshToken: 'encrypted_refresh',
        tokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      },
    });

    expect(user.id).toBeDefined();
    expect(user.accessToken).toBe('encrypted_token');
  });

  it('should enforce unique deviantartId', async () => {
    await prisma.user.create({
      data: {
        deviantartId: '123456',
        deviantartUsername: 'artist',
        /* ... */
      },
    });

    await expect(
      prisma.user.create({
        data: {
          deviantartId: '123456', // Duplicate
          deviantartUsername: 'artist2',
          /* ... */
        },
      })
    ).rejects.toThrow();
  });
});
```

---

## Mocking

### External API Mocking

**DeviantArt API:**

```typescript
import { vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn((url) => {
  if (url.includes('deviantart.com/oauth2/token')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'mock_token',
          refresh_token: 'mock_refresh',
          expires_in: 3600,
        }),
    });
  }

  if (url.includes('/user/whoami')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          userid: '123456',
          username: 'testuser',
          usericon: 'http://example.com/avatar.png',
        }),
    });
  }

  return Promise.reject(new Error('Unmocked URL'));
});
```

### Database Mocking

**Use Test Database:**

```bash
DATABASE_URL=postgresql://test:test@localhost:5432/isekai_test pnpm test
```

**Transactions for Isolation:**

```typescript
import { prisma } from '../db';

beforeEach(async () => {
  await prisma.$executeRaw`BEGIN`;
});

afterEach(async () => {
  await prisma.$executeRaw`ROLLBACK`;
});
```

---

## Coverage Requirements

### Baseline: 30%

**Enforced on:**

- Lines
- Functions
- Branches
- Statements

**Rationale:** 30% minimum ensures critical paths tested.

### Priority Areas

**Must Have >50% Coverage:**

- Authentication (`/routes/auth.ts`)
- Publishing logic (`/queues/deviation-publisher.ts`)
- Execution locks (any file with `executionLockId`)
- Token refresh (`/lib/deviantart.ts`)

**Can Have <30% Coverage:**

- UI components (frontend)
- Admin routes (low usage)
- Legacy code (to be refactored)

---

## Test Data

### Factories

**File:** `test/factories/user.ts`

```typescript
import { faker } from '@faker-js/faker';

export function createUserData() {
  return {
    deviantartId: faker.string.numeric(6),
    deviantartUsername: faker.internet.userName(),
    email: faker.internet.email(),
    avatarUrl: faker.image.avatar(),
    accessToken: faker.string.alphanumeric(32),
    refreshToken: faker.string.alphanumeric(32),
    tokenExpiresAt: faker.date.future(),
    refreshTokenExpiresAt: faker.date.future(),
  };
}

export async function createUser() {
  return await prisma.user.create({
    data: createUserData(),
  });
}
```

### Fixtures

**File:** `test/fixtures/deviation.json`

```json
{
  "title": "Test Artwork",
  "description": "Test description",
  "tags": ["test", "artwork"],
  "uploadMode": "single",
  "isMature": false
}
```

---

## Testing Best Practices

### 1. Arrange-Act-Assert (AAA)

```typescript
it('should schedule deviation', async () => {
  // Arrange
  const user = await createUser();
  const deviation = await createDeviation(user.id);

  // Act
  const result = await scheduleDeviation(deviation.id, new Date());

  // Assert
  expect(result.status).toBe('scheduled');
  expect(result.actualPublishAt).toBeDefined();
});
```

### 2. Test One Thing

```typescript
// ❌ Bad: Multiple assertions
it('should handle deviation lifecycle', async () => {
  const deviation = await createDeviation();
  await scheduleDeviation(deviation.id);
  await publishDeviation(deviation.id);
  expect(deviation.status).toBe('published');
  expect(deviation.deviationUrl).toBeDefined();
});

// ✅ Good: One test per scenario
it('should schedule deviation', async () => {
  const deviation = await createDeviation();
  const result = await scheduleDeviation(deviation.id);
  expect(result.status).toBe('scheduled');
});

it('should publish deviation', async () => {
  const deviation = await createScheduledDeviation();
  const result = await publishDeviation(deviation.id);
  expect(result.status).toBe('published');
});
```

### 3. Use Descriptive Names

```typescript
// ❌ Bad
it('test 1', () => {
  /* ... */
});

// ✅ Good
it('should reject schedule time less than 1 hour in future', () => {
  /* ... */
});
```

### 4. Clean Up After Tests

```typescript
afterEach(async () => {
  await prisma.deviation.deleteMany();
  await prisma.user.deleteMany();
});
```

---

## Common Issues

### "Database locked"

**Cause:** Multiple tests accessing same database.

**Solution:** Use transactions or separate test databases.

### "Tests flaky"

**Cause:** Tests depend on timing or external state.

**Solution:**

- Mock time: `vi.useFakeTimers()`
- Mock random: `vi.spyOn(Math, 'random').mockReturnValue(0.5)`
- Clean state between tests

### "Coverage too low"

**Cause:** Untested code paths.

**Solution:**

1. Run `pnpm test:coverage`
2. Open `coverage/index.html`
3. Identify red (untested) lines
4. Add tests for critical paths

---

## Related Documentation

- `.context/ai-rules.md` - Testing requirements
- `.context/workflows.md` - Development workflow
- `.context/glossary.md` - Test terminology
