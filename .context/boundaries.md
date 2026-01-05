# Boundaries - Modification Limits

**Purpose:** Define what code AI can modify freely vs. carefully vs. not at all
**Last Updated:** 2026-01-05

---

## Modify Freely ✅

These areas are safe for regular development and AI assistance.

### Feature Routes (API)
**Location:** `apps/isekai-backend/src/routes/`

- Add new endpoints for features
- Modify business logic within routes
- Add validation schemas
- Update response formats

**Exceptions:** Do NOT modify core auth logic within these routes

**Examples:**
- `deviations.ts` - CRUD operations
- `templates.ts` - Template management
- `galleries.ts` - Gallery sync
- `browse.ts` - DeviantArt browsing

### UI Components (Frontend)
**Location:** `apps/isekai-frontend/src/`

- Create new pages in `pages/`
- Add components in `components/`
- Create custom hooks in `hooks/`
- Add Zustand stores in `store/`

**Guidelines:**
- Follow existing patterns (shadcn/ui, Tailwind)
- Use TypeScript types from `@isekai/shared`
- Implement TanStack Query for API calls

### Background Jobs (Non-Critical)
**Location:** `apps/isekai-publisher/src/jobs/`

- Modify `auto-scheduler.ts` draft selection logic (with care)
- Update email notification templates
- Adjust job schedules (cron patterns)

**Note:** Be cautious with execution locking logic in auto-scheduler

### Tests
**Location:** `**/*.test.ts`, `**/*.test.tsx`

- Add new unit tests
- Update existing test cases
- Increase coverage

**Requirement:** Tests must pass before merging

### Documentation
**Location:** `.context/`, `README.md`, `CONTRIBUTING.md`

- Update documentation as features change
- Add new ADRs in `.context/decisions/`
- Create new prompt templates in `.context/prompts/`

---

## Modify With Care ⚠️

These areas require thorough understanding and testing. Changes have broad impact.

### Prisma Schema
**Location:** `packages/shared/prisma/schema.prisma`

**Why Critical:**
- Schema changes require migrations
- Breaking changes affect all apps (backend, publisher, frontend)
- Rollbacks are complex

**Process:**
1. Design change carefully
2. Run `pnpm db:generate` to create migration
3. Review generated SQL thoroughly
4. Test migration on database copy
5. Consider backward compatibility
6. Run `pnpm db:migrate` locally
7. Rebuild shared package: `pnpm --filter @isekai/shared build`
8. Update all TypeScript code using affected models

**Examples:**
- Adding new fields: Generally safe if nullable or with defaults
- Removing fields: Requires two-phase migration (mark unused → remove)
- Changing types: Risky - may lose data
- Adding indexes: Safe - improves performance

### Authentication Middleware
**Location:** `apps/isekai-backend/src/middleware/`

**Files:**
- `auth.ts` - Session-based auth (`requireAuth`)
- `hybrid-auth.ts` - Session + API key auth
- `api-key.ts` - API key extraction

**Why Critical:**
- Security implications
- Affects all protected routes
- Session handling complexity

**Requirements:**
- Never weaken security (e.g., skip authentication checks)
- Test authentication thoroughly
- Consider session storage (Redis vs PostgreSQL)
- Maintain backward compatibility with API keys

### Storage Service
**Location:** `apps/isekai-backend/src/lib/storage.ts`, `apps/isekai-publisher/src/lib/storage.ts`

**Why Critical:**
- Must support multiple backends (R2, S3, MinIO)
- Presigned URL generation is security-sensitive
- Multi-tenant storage requires S3_PATH_PREFIX

**Requirements:**
- Test with all supported storage backends
- Verify presigned URL expiration
- Ensure S3_PATH_PREFIX is applied consistently

### Rate Limiter
**Location:** `apps/isekai-backend/src/lib/adaptive-rate-limiter.ts`

**Why Critical:**
- Protects against DeviantArt API bans
- Adaptive algorithm must balance speed and safety

**Requirements:**
- Understand exponential backoff math
- Test edge cases (many failures, rapid successes)
- Monitor Redis persistence

---

## Do NOT Modify 🚫

These components are CRITICAL to system reliability. Only modify after thorough review and understanding.

### Execution Lock Logic
**Locations:**
- `apps/isekai-publisher/src/jobs/auto-scheduler.ts` (line ~150-200)
- `apps/isekai-publisher/src/queues/deviation-publisher.ts` (line ~50-100)

**What NOT to Change:**
- UUID generation and lock acquisition logic
- Optimistic locking with `executionVersion`
- Lock release on success/failure
- `updateMany` with `executionLockId: null` condition

**Why CRITICAL:**
Execution locks are the **ONLY** defense against:
- Duplicate deviation scheduling (automation runs twice)
- Duplicate publishing (same deviation posted 2+ times to DeviantArt)
- Race conditions in distributed publisher workers

**Example - DO NOT MODIFY:**
```typescript
// CRITICAL: Do not change this pattern
const lockId = randomUUID();
const locked = await prisma.deviation.updateMany({
  where: {
    id: deviationId,
    status: 'scheduled',
    executionLockId: null, // ← CRITICAL: Only lock if unlocked
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 }, // ← CRITICAL: Optimistic locking
  },
});

if (locked.count === 0) {
  return; // ← CRITICAL: Already being processed
}
```

**If you must modify:**
1. Read `.context/decisions/002-execution-locks.md`
2. Understand optimistic locking patterns
3. Write comprehensive tests
4. Test with multiple concurrent workers
5. Get explicit approval

### Token Refresh Mechanism
**Location:** `apps/isekai-publisher/src/queues/token-maintenance.ts`

**What NOT to Change:**
- 7-day advance refresh schedule
- Email warning system (7 days, 1 day remaining)
- Token expiry calculation
- Encryption/decryption of tokens

**Why CRITICAL:**
- DeviantArt refresh tokens expire after 90 days
- If token expires, user loses access permanently (must re-authorize)
- Proactive refresh prevents service interruption

**Exception:** Can modify email templates, but NOT the timing logic

### Circuit Breaker State Machine
**Location:** `apps/isekai-publisher/src/lib/circuit-breaker.ts`

**What NOT to Change:**
- State transitions (closed → open → half-open)
- Failure threshold (3 consecutive 429s)
- Open duration (5 minutes)
- Redis persistence logic

**Why CRITICAL:**
- Protects against catastrophic API bans
- State machine logic is carefully tuned
- Distributed state (Redis) requires precise handling

**Exception:** Can adjust thresholds via environment variables (`CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_OPEN_DURATION_MS`)

### Publisher Worker Lifecycle
**Location:** `apps/isekai-publisher/src/index.ts`

**What NOT to Change:**
- Graceful shutdown handler
- 30-second drain period
- Health check endpoints (`/health`, `/ready`, `/metrics`)
- Worker initialization order

**Why CRITICAL:**
- Ensures jobs complete before shutdown
- Container orchestration relies on health checks
- Prevents job loss during deployments

**Example - DO NOT MODIFY:**
```typescript
// CRITICAL: Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');
  isShuttingDown = true; // ← Prevents new jobs

  await new Promise((resolve) => setTimeout(resolve, 30000)); // ← 30s drain

  await Promise.all([
    deviationWorker.close(),
    tokenWorker.close(),
    cleanupWorker.close(),
  ]);

  process.exit(0);
});
```

### Stuck Job Recovery
**Location:** `apps/isekai-publisher/src/jobs/stuck-job-recovery.ts`

**What NOT to Change:**
- Stale job detection threshold (1 hour)
- Lock cleanup logic
- Max stall count (2)

**Why CRITICAL:**
- Safety net for crashed workers
- Incorrect logic could cause job loops or permanent stalls

### Post Count Guard
**Location:** `apps/isekai-publisher/src/queues/deviation-publisher.ts` (line ~200)

**What NOT to Change:**
```typescript
if (!deviation.postCountIncremented) {
  await prisma.user.update({
    where: { id: deviation.userId },
    data: { postCount: { increment: 1 } },
  });
  await prisma.deviation.update({
    where: { id: deviationId },
    data: { postCountIncremented: true },
  });
}
```

**Why CRITICAL:**
- Prevents double-incrementing user's post count on retry
- Idempotency guard for user metrics

---

## External Dependencies

These are outside our control - work around limitations, don't try to change them.

### DeviantArt API
**Constraints:**
- Rate limits enforced (exact limits undocumented)
- OAuth refresh tokens expire after 90 days
- 429 responses require exponential backoff
- Mature content policies must be followed

**Strategy:** Adapt our code to handle constraints gracefully

### Cloudflare R2 / AWS S3
**Constraints:**
- Eventual consistency (rare but possible)
- Presigned URL expiration
- Object size limits (5GB per object for standard upload)

**Strategy:** Use multi-part upload for large files, handle retries

### PostgreSQL / Redis
**Constraints:**
- Connection limits
- Transaction isolation levels
- Redis memory limits

**Strategy:** Use connection pooling, monitor resource usage

---

## License Constraints

**AGPL-3.0 Requirements:**

✅ **Allowed:**
- Modify code for personal use
- Deploy privately
- Use commercially (must provide source)

🚫 **Must NOT:**
- Add proprietary dependencies with incompatible licenses
- Remove AGPL license headers from files
- Distribute without providing source code

**Adding Dependencies:**
1. Check license compatibility (MIT, Apache 2.0, BSD = OK)
2. Avoid GPL-incompatible licenses (e.g., certain commercial licenses)
3. Document in `.context/architecture/dependencies.md`

---

## Version Compatibility

**DO NOT downgrade:**
- Node.js < 20 (uses ES modules, modern APIs)
- PostgreSQL < 16 (Prisma requires modern features)
- Redis < 7 (BullMQ compatibility)
- pnpm < 9 (workspace features)

**Upgrading:**
- Test thoroughly in development first
- Check Prisma compatibility
- Review CHANGELOG for breaking changes

---

## Summary

| Zone | Modification Level | Examples |
|------|-------------------|----------|
| **Free** | Unrestricted development | Routes, components, tests, docs |
| **Careful** | Requires understanding | Prisma schema, auth middleware, storage |
| **Critical** | Expert review required | Execution locks, token refresh, circuit breaker |
| **Off-Limits** | External constraints | DeviantArt API, R2/S3, license terms |

**When in doubt, ask before modifying critical sections.**

---

## Related Files

- `.context/ai-rules.md` - Development constraints
- `.context/anti-patterns.md` - Common mistakes
- `.context/decisions/` - ADRs explain why critical code exists
- `.context/architecture/patterns.md` - Design patterns in use
