# Anti-Patterns - What NOT to Do

**Purpose:** Common mistakes and incorrect implementations to avoid
**Last Updated:** 2026-01-05

---

## Concurrency Anti-Patterns

### ❌ Missing Execution Locks

**Problem:** Publishing same deviation twice due to race condition

```typescript
// ❌ BAD: No execution lock
const deviation = await prisma.deviation.findUnique({ where: { id } });
if (deviation.status === 'scheduled') {
  await publishToDeviantArt(deviation);
  await prisma.deviation.update({
    where: { id },
    data: { status: 'published' },
  });
}
// Two concurrent processes can both pass the status check!
```

**✅ CORRECT: Use UUID-based execution lock**

```typescript
const lockId = randomUUID();
const locked = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    status: 'scheduled',
    executionLockId: null, // Only if unlocked
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 },
  },
});

if (locked.count === 0) {
  // Already being processed by another worker
  return;
}

try {
  await publishToDeviantArt(deviation);
  await prisma.deviation.update({
    where: { id, executionLockId: lockId }, // Verify still owns lock
    data: { status: 'published', executionLockId: null },
  });
} catch (error) {
  // Release lock on error
  await prisma.deviation.update({
    where: { id, executionLockId: lockId },
    data: { executionLockId: null },
  });
}
```

**Why:** Execution locks are CRITICAL. Without them, automation can schedule duplicates, or publisher can publish the same deviation multiple times.

### ❌ Ignoring Execution Version

**Problem:** Stale lock check allows outdated process to modify deviation

```typescript
// ❌ BAD: Check lock exists but ignore version
const deviation = await prisma.deviation.findUnique({ where: { id } });
if (deviation.executionLockId === lockId) {
  await prisma.deviation.update({ where: { id }, data: { status: 'published' } });
}
```

**✅ CORRECT: Use optimistic locking with version**

```typescript
const result = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    executionLockId: lockId,
    executionVersion: currentVersion, // Verify version hasn't changed
  },
  data: {
    status: 'published',
    executionVersion: { increment: 1 },
  },
});

if (result.count === 0) {
  // Lock was stolen or version changed - abort
  throw new Error('Execution lock lost or version mismatch');
}
```

## DeviantArt API Anti-Patterns

### ❌ Ignoring Rate Limits

**Problem:** Hammering API with rapid requests triggers 429 rate limit bans

```typescript
// ❌ BAD: No rate limiting or circuit breaker
for (const deviation of deviations) {
  await publishToDeviantArt(deviation); // Rapid-fire requests!
}
```

**✅ CORRECT: Use circuit breaker and adaptive rate limiter**

```typescript
import { circuitBreaker } from '../lib/circuit-breaker';
import { rateLimiter } from '../lib/adaptive-rate-limiter';

for (const deviation of deviations) {
  if (circuitBreaker.isOpen()) {
    console.log('Circuit breaker open, skipping publish');
    continue;
  }

  await rateLimiter.waitForSlot(); // Adaptive delay

  try {
    await publishToDeviantArt(deviation);
    circuitBreaker.recordSuccess();
    rateLimiter.recordSuccess();
  } catch (error) {
    if (error.status === 429) {
      circuitBreaker.recordFailure();
      rateLimiter.recordFailure();
    }
    throw error;
  }
}
```

**Why:** DeviantArt API has strict rate limits. Three consecutive 429s trigger circuit breaker for 5-minute cooldown.

### ❌ Not Handling Token Expiry

**Problem:** Access token expires mid-request, breaking publishing flow

```typescript
// ❌ BAD: Assume token is always valid
const response = await fetch('https://www.deviantart.com/api/v1/oauth2/stash/submit', {
  headers: { Authorization: `Bearer ${user.accessToken}` },
});
// Token might be expired!
```

**✅ CORRECT: Check expiry and refresh proactively**

```typescript
async function getValidAccessToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (new Date() >= new Date(user.tokenExpiresAt)) {
    // Token expired, refresh it
    const newTokens = await refreshDeviantArtToken(user.refreshToken);
    await prisma.user.update({
      where: { id: userId },
      data: {
        accessToken: encrypt(newTokens.accessToken),
        tokenExpiresAt: newTokens.expiresAt,
      },
    });
    return newTokens.accessToken;
  }

  return decrypt(user.accessToken);
}
```

**Why:** Token maintenance queue handles this proactively, but always check expiry before critical operations.

### ❌ Skipping Jitter

**Problem:** Predictable posting times create noticeable automation patterns

```typescript
// ❌ BAD: Exact scheduled time
const scheduledAt = new Date('2024-01-01T12:00:00Z');
await prisma.deviation.update({
  where: { id },
  data: { scheduledAt, actualPublishAt: scheduledAt },
});
```

**✅ CORRECT: Add jitter for natural variation**

```typescript
const scheduledAt = new Date('2024-01-01T12:00:00Z');
const jitterSeconds = Math.floor(Math.random() * 1800) - 900; // ±15 min
const actualPublishAt = new Date(scheduledAt.getTime() + jitterSeconds * 1000);

await prisma.deviation.update({
  where: { id },
  data: {
    scheduledAt,
    jitterSeconds,
    actualPublishAt,
  },
});
```

**Why:** Jitter makes automation less detectable and reduces rate limit clustering.

## Database Anti-Patterns

### ❌ N+1 Query Problem

**Problem:** Fetching relations in a loop creates hundreds of queries

```typescript
// ❌ BAD: N+1 queries
const deviations = await prisma.deviation.findMany({ where: { userId } });
for (const deviation of deviations) {
  const files = await prisma.deviationFile.findMany({
    where: { deviationId: deviation.id },
  }); // N queries!
}
```

**✅ CORRECT: Include relations in initial query**

```typescript
const deviations = await prisma.deviation.findMany({
  where: { userId },
  include: { files: true }, // Single query with JOIN
});
```

### ❌ Missing Indexes

**Problem:** Full table scans for frequently queried columns

```prisma
// ❌ BAD: No index on status
model Deviation {
  id     String @id
  userId String
  status DeviationStatus // Frequently filtered, not indexed!
}
```

**✅ CORRECT: Add composite index**

```prisma
model Deviation {
  id     String @id
  userId String
  status DeviationStatus

  @@index([userId, status]) // Fast lookups by user and status
  @@index([status, actualPublishAt]) // For past-due recovery
}
```

**Why:** Indexes are CRITICAL for queries filtering on `status`, `actualPublishAt`, `executionLockId`.

### ❌ Fetching All Fields Unnecessarily

**Problem:** Retrieving entire user record when only ID is needed

```typescript
// ❌ BAD: Fetch all fields
const user = await prisma.user.findUnique({ where: { id: userId } });
console.log(user.id); // Only need ID, but fetched accessToken, refreshToken, etc.
```

**✅ CORRECT: Use select for specific fields**

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, username: true, avatarUrl: true },
});
```

## Job Queue Anti-Patterns

### ❌ No Retry Limits

**Problem:** Job fails permanently and keeps retrying forever

```typescript
// ❌ BAD: Unlimited retries
await deviationQueue.add('publish', { deviationId }, {
  attempts: Infinity, // Never gives up!
});
```

**✅ CORRECT: Set max attempts**

```typescript
await deviationQueue.add('publish', { deviationId }, {
  attempts: 7, // Publisher max attempts
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s initial delay
  },
});
```

### ❌ Ignoring Stalled Jobs

**Problem:** Jobs get stuck in processing state forever due to crashes

```typescript
// ❌ BAD: No stale job monitoring
const worker = new Worker(queueName, processor);
// If processor crashes, jobs stay in "active" state permanently
```

**✅ CORRECT: Use stale job recovery**

```typescript
const worker = new Worker(queueName, processor, {
  settings: {
    stalledInterval: 60000, // Check every minute
    maxStalledCount: 2, // Max 2 stall recoveries
  },
});

// Plus dedicated stuck-job-recovery job running every 5 minutes
```

**Why:** Stuck job recovery (`apps/isekai-publisher/src/jobs/stuck-job-recovery.ts`) handles this system-wide.

### ❌ Synchronous Publishing in API

**Problem:** HTTP request hangs for 30+ seconds while publishing

```typescript
// ❌ BAD: Block HTTP request
app.post('/api/deviations/:id/publish', async (req, res) => {
  await publishToDeviantArt(req.params.id); // Blocks 30+ seconds!
  res.json({ success: true });
});
```

**✅ CORRECT: Queue the job, return immediately**

```typescript
app.post('/api/deviations/:id/publish', async (req, res) => {
  await prisma.deviation.update({
    where: { id: req.params.id },
    data: { status: 'uploading' },
  });

  await deviationQueue.add('publish', { deviationId: req.params.id });

  res.json({ success: true, message: 'Publishing queued' });
});
```

## State Management Anti-Patterns (Frontend)

### ❌ Prop Drilling

**Problem:** Passing props through 5+ component levels

```tsx
// ❌ BAD: Prop drilling
<App user={user}>
  <Layout user={user}>
    <Page user={user}>
      <Component user={user}>
        <DeepComponent user={user} /> {/* Finally used here */}
      </Component>
    </Page>
  </Layout>
</App>
```

**✅ CORRECT: Use Zustand store**

```typescript
// store/user-store.ts
export const useUserStore = create<UserStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// DeepComponent.tsx
const { user } = useUserStore();
```

### ❌ Manual Server State Management

**Problem:** Managing loading/error/data state manually with useState

```tsx
// ❌ BAD: Manual state management
const [deviations, setDeviations] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  setLoading(true);
  fetch('/api/deviations')
    .then(r => r.json())
    .then(setDeviations)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);
```

**✅ CORRECT: Use TanStack Query**

```tsx
const { data: deviations, isLoading, error } = useQuery({
  queryKey: ['deviations', userId],
  queryFn: () => fetchDeviations(userId),
});
```

## Security Anti-Patterns

### ❌ Logging Sensitive Data

**Problem:** Access tokens leaked in logs

```typescript
// ❌ BAD: Log entire user object
console.log('User:', user); // Contains accessToken, refreshToken!
```

**✅ CORRECT: Log only safe fields**

```typescript
console.log(JSON.stringify({
  level: 'info',
  message: 'User authenticated',
  userId: user.id,
  username: user.username,
  // NO tokens!
}));
```

### ❌ Plain Text Tokens

**Problem:** Tokens stored unencrypted in database

```typescript
// ❌ BAD: Plain text storage
await prisma.user.create({
  data: {
    deviantartId,
    username,
    accessToken: tokens.accessToken, // Plain text!
  },
});
```

**✅ CORRECT: Encrypt before storage**

```typescript
import { encrypt } from '@isekai/shared/crypto';

await prisma.user.create({
  data: {
    deviantartId,
    username,
    accessToken: encrypt(tokens.accessToken, ENCRYPTION_KEY),
    refreshToken: encrypt(tokens.refreshToken, ENCRYPTION_KEY),
  },
});
```

### ❌ No Input Validation

**Problem:** Accepting malicious user input

```typescript
// ❌ BAD: No validation
app.post('/api/deviations', async (req, res) => {
  const deviation = await prisma.deviation.create({ data: req.body });
  res.json(deviation);
});
```

**✅ CORRECT: Validate with Zod**

```typescript
const schema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(50000).optional(),
  tags: z.array(z.string().max(50)).max(30),
  categoryPath: z.string().optional(),
});

app.post('/api/deviations', async (req, res) => {
  const validated = schema.parse(req.body); // Throws if invalid
  const deviation = await prisma.deviation.create({ data: validated });
  res.json(deviation);
});
```

## Storage Anti-Patterns

### ❌ Hardcoded R2 Client

**Problem:** Can't switch to MinIO or S3 without code changes

```typescript
// ❌ BAD: Direct R2 client usage
import { S3Client } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});
```

**✅ CORRECT: Use abstracted StorageService**

```typescript
import { getStorageService } from '../lib/storage';

const storage = getStorageService();
await storage.upload(file, key);
const url = await storage.getPresignedUrl(key, 'getObject');
```

**Why:** Storage abstraction supports R2, S3, and MinIO via environment variables.

### ❌ Missing Multi-Tenant Prefix

**Problem:** Files from different tenants collide in shared bucket

```typescript
// ❌ BAD: No tenant isolation
const storageKey = `deviations/${deviationId}/${filename}`;
```

**✅ CORRECT: Use S3_PATH_PREFIX**

```typescript
const storageKey = `${S3_PATH_PREFIX || ''}deviations/${deviationId}/${filename}`;
```

## Architecture Anti-Patterns

### ❌ Publisher Calling API

**Problem:** Circular dependency and increased latency

```typescript
// ❌ BAD: Publisher making HTTP request to API
const response = await fetch('http://backend:4000/api/users/123');
const user = await response.json();
```

**✅ CORRECT: Direct database access**

```typescript
const user = await prisma.user.findUnique({ where: { id: userId } });
```

**Why:** Publisher and API both access the same database. No HTTP needed.

### ❌ Tight Coupling to DeviantArt API

**Problem:** Business logic mixed with API client code

```typescript
// ❌ BAD: Mixed concerns
async function publishDeviation(id: string) {
  const dev = await prisma.deviation.findUnique({ where: { id } });
  const response = await fetch('https://deviantart.com/api/v1/stash/submit', {
    method: 'POST',
    body: JSON.stringify({ title: dev.title }),
  });
  await prisma.deviation.update({ where: { id }, data: { status: 'published' } });
}
```

**✅ CORRECT: Separate concerns**

```typescript
// lib/deviantart-api.ts
class DeviantArtClient {
  async submitStash(params: StashParams): Promise<StashResponse> { /* ... */ }
}

// queues/deviation-publisher.ts
async function publishDeviation(id: string) {
  const deviation = await prisma.deviation.findUnique({ where: { id } });
  const client = new DeviantArtClient(user.accessToken);
  const result = await client.submitStash({ title: deviation.title });
  await updateDeviationStatus(id, 'published', result.stashItemId);
}
```

## Related Files

- See `.context/ai-rules.md` for correct patterns
- See `.context/boundaries.md` for what not to modify
- See `.context/architecture/patterns.md` for approved design patterns
