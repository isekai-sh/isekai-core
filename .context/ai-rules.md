# AI Rules & Development Constraints

**Purpose:** Hard constraints for code generation and development
**Last Updated:** 2026-01-05 (updated for v0.1.0-alpha.5)

---

## License & Copyright

**CRITICAL:** All source files MUST include the AGPL-3.0 license header:

```typescript
/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 */
```

## Code Style

### TypeScript

**Strict Mode:** Always enabled
- Use TypeScript for ALL new code
- Avoid `any` - use proper types or `unknown`
- Define interfaces for object shapes
- Use type aliases for unions/intersections

```typescript
// ✅ Good
interface Deviation {
  id: string;
  title: string;
  status: DeviationStatus;
  scheduledAt: Date | null;
}

// ❌ Bad
const deviation: any = {...};
```

### Naming Conventions

- **Files**: kebab-case (`deviation-publisher.ts`, `auto-scheduler.ts`)
- **Components**: PascalCase (`DeviationCard.tsx`, `ScheduleView.tsx`)
- **Functions**: camelCase (`createDeviation`, `schedulePublish`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`, `DEFAULT_JITTER`)
- **Database fields**: snake_case (handled by Prisma `@map`)
- **Environment variables**: SCREAMING_SNAKE_CASE

### Formatting (Prettier)

- **Semi-colons:** Required
- **Quotes:** Single quotes
- **Print width:** 100 characters
- **Tab width:** 2 spaces
- **Trailing commas:** ES5 style

### ESLint Rules

- `no-console`: OFF (server-side logging allowed)
- `no-unused-vars`: WARN
- `@typescript-eslint/no-unused-vars`: WARN (ignores `_` prefixed vars)
- `@typescript-eslint/no-explicit-any`: WARN
- `prefer-const`: WARN
- `no-var`: ERROR

## Commit Message Format

**CRITICAL:** ALL commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/) with multi-line messages.

### Structure (Strict)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Line 1:** Type, scope, and brief subject (max 72 characters)
**Line 2:** Blank line (required)
**Line 3+:** Detailed body with bullet points explaining changes
**Last line:** Issue reference if applicable (e.g., `Closes #42`)

### Rules

1. **No emojis** - Keep commits professional
2. **No AI attribution** - Commits should appear human-written
3. **No "Generated with" or "Co-Authored-By" lines**
4. **Always include detailed body** - Single-line commits not allowed
5. **Use imperative mood** - "add feature" not "added feature"
6. **Reference related files** - Mention key files changed

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code formatting (no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding/updating tests
- `chore`: Maintenance (deps, config)
- `build`: Build system changes
- `ci`: CI/CD changes

### Multi-Line Examples

**Feature Commit:**
```
feat(automation): add weekly quota rule type

Implements weekly_quota rule type that limits posts per calendar week.

- Add maxPostsPerWeek field to AutomationScheduleRule model
- Implement quota evaluation in auto-scheduler
- Add timezone-aware week calculation using date-fns-tz
- Update frontend UI to support weekly quota configuration
- Add validation for maxPostsPerWeek parameter

The weekly quota complements existing daily quota by tracking posts
across Sunday-Saturday periods using the user's timezone.

Closes #42
```

**Bug Fix Commit:**
```
fix(publisher): prevent race condition in execution lock

Fixes race condition where multiple workers could publish same deviation.

- Add executionVersion counter to Deviation model
- Implement atomic lock acquisition with updateMany
- Add lock timeout cleanup job (runs every 30 minutes)
- Update tests to verify single worker acquires lock

The lock now uses UUID-based optimistic locking with version counter
to ensure only one worker can process each deviation.

Fixes #87
```

**Documentation Commit:**
```
docs(api): document browse endpoints and caching strategy

Adds complete documentation for all browse endpoints.

- Document 6 browse modes (home, daily, following, tags, topic, user)
- Explain Redis caching with 5-minute TTL
- Add request coalescing pattern explanation
- Document stale cache fallback strategy

Updates .context/api/endpoints.md with code examples and response formats.
```

**Refactor Commit:**
```
refactor(storage): abstract S3-compatible storage layer

Removes hardcoded Cloudflare R2 usage, adds multi-provider support.

- Extract StorageService interface
- Implement R2StorageService, S3StorageService, MinIOStorageService
- Add getStorageService() factory based on S3_ENDPOINT
- Update all file upload/download calls to use abstraction
- Add S3_PATH_PREFIX for multi-tenant storage isolation

Enables using MinIO for local development and AWS S3 for production
without code changes.
```

### ❌ Bad Examples

**Too short:**
```
feat: add feature
```

**Has emoji:**
```
feat(api): add endpoint 🚀
```

**Has AI attribution:**
```
feat(api): add endpoint

Generated with Claude Code
```

**No body:**
```
fix(bug): fix the bug
```

**Wrong tense:**
```
feat(api): added new endpoint
```

## Architecture Constraints

### 1. Microservice Separation

**Rule:** Keep publisher worker independent from API

```typescript
// ✅ Good: Publisher processes jobs independently
// apps/isekai-publisher/src/queues/deviation-publisher.ts

// ❌ Bad: Don't make API HTTP calls from publisher
// Use shared database access instead
```

### 2. Execution Locks

**Rule:** ALWAYS use execution locks for deviation publishing

```typescript
// ✅ Good: UUID-based execution lock
const lockId = randomUUID();
await prisma.deviation.update({
  where: {
    id: deviationId,
    executionLockId: null, // Only if unlocked
  },
  data: {
    executionLockId: lockId,
    executionLockedAt: new Date(),
    executionVersion: { increment: 1 },
  },
});

// ❌ Bad: No lock - allows race conditions
```

### 3. No Global State

**Rule:** Avoid global mutable state - use dependency injection

```typescript
// ✅ Good: Inject dependencies
class DeviationPublisher {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private storage: StorageService
  ) {}
}

// ❌ Bad: Global singletons
const globalPrisma = new PrismaClient();
```

### 4. BullMQ for Long Operations

**Rule:** Use BullMQ queues for operations > 5 seconds

```typescript
// ✅ Good: Queue long-running publish job
await deviationQueue.add('publish', { deviationId });

// ❌ Bad: Synchronous publishing in HTTP handler
app.post('/api/deviations/:id/publish', async (req, res) => {
  await publishToDeviantArt(req.params.id); // Blocks!
  res.json({ success: true });
});
```

### 5. Storage Abstraction

**Rule:** Use abstracted StorageService, not direct R2/S3 calls

```typescript
// ✅ Good: Abstract storage interface
await storageService.upload(file, key);
const url = await storageService.getPresignedUrl(key);

// ❌ Bad: Direct R2 client usage
await r2Client.putObject({ Bucket: 'isekai', Key: key, Body: file });
```

**Supported backends:** Cloudflare R2, AWS S3, MinIO (S3-compatible)

### 6. Instance Settings

**Rule:** Check InstanceSettings for runtime-configurable features

```typescript
// ✅ Good: Respect instance settings
const settings = await prisma.instanceSettings.findUnique({
  where: { id: 'singleton' }
});
if (!settings?.teamInvitesEnabled) {
  return res.status(403).json({ error: 'Team invites disabled' });
}

// ❌ Bad: Hardcode feature availability
```

## Security Rules

### 1. OAuth Token Management

- **NEVER** log access tokens or refresh tokens
- **ALWAYS** encrypt tokens at rest (use `packages/shared/src/crypto.ts`)
- **ALWAYS** refresh tokens 7 days before expiry (handled by `token-maintenance` queue)

```typescript
// ✅ Good: Encrypted storage
const encryptedToken = encrypt(accessToken, ENCRYPTION_KEY);
await prisma.user.update({
  where: { id: userId },
  data: { accessToken: encryptedToken },
});

// ❌ Bad: Plain text tokens
```

### 2. Input Validation

**Rule:** Validate ALL user inputs with Zod or Prisma types

```typescript
// ✅ Good: Zod validation
const schema = z.object({
  title: z.string().min(1).max(255),
  tags: z.array(z.string()).max(30),
});
const validated = schema.parse(req.body);

// ❌ Bad: Direct use of req.body
```

### 3. SQL Injection Protection

**Rule:** ONLY use Prisma ORM - NEVER raw SQL without parameterization

```typescript
// ✅ Good: Prisma query
await prisma.deviation.findMany({ where: { userId } });

// ❌ Bad: Raw SQL with string interpolation
await prisma.$queryRaw`SELECT * FROM deviations WHERE user_id = ${userId}`;
// Use $queryRaw`...${Prisma.sql`${userId}`}` if raw SQL is necessary
```

### 4. API Authentication

**Rule:** Use `requireAuth` or `hybridAuth` middleware on protected routes

```typescript
// ✅ Good: Protected route
app.get('/api/deviations', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  // ...
});

// ❌ Bad: No auth check
app.get('/api/deviations', async (req, res) => {
  // Anyone can access!
});
```

## Database Rules

### 1. Schema Changes

**Process:**
1. Edit `packages/shared/prisma/schema.prisma`
2. Run `pnpm db:generate` to create migration
3. Review generated SQL carefully
4. Run `pnpm db:migrate` to apply
5. Rebuild shared package: `pnpm --filter @isekai/shared build`

### 2. Migration Best Practices

- **Never** edit existing migrations
- **Never** add NOT NULL columns without default values
- **Always** add indexes for frequently queried columns
- **Test** migrations on a database copy first

### 3. Cascading Deletes

**Rule:** Use Prisma `onDelete` cascade carefully

```prisma
// ✅ Good: Cascade deletes for owned data
model DeviationFile {
  deviation Deviation @relation(fields: [deviationId], references: [id], onDelete: Cascade)
}

// ⚠️  Careful: Set null for referenced data
model Deviation {
  automation Automation? @relation(fields: [automationId], references: [id], onDelete: SetNull)
}
```

## Frontend Rules (React)

### 1. Component Structure

- Use functional components with hooks
- Extract reusable logic into custom hooks
- Keep components small and focused (< 200 lines)
- Use proper TypeScript prop types

```tsx
// ✅ Good
interface DeviationCardProps {
  deviation: Deviation;
  onEdit: (id: string) => void;
  showActions?: boolean;
}

export function DeviationCard({ deviation, onEdit, showActions = true }: DeviationCardProps) {
  return <Card>...</Card>;
}

// ❌ Bad: No types, too many responsibilities
```

### 2. State Management

- **Local state:** `useState` for component-only state
- **Global state:** Zustand stores for shared state
- **Server state:** TanStack Query for API data

```typescript
// ✅ Good: TanStack Query for API data
const { data, isLoading } = useQuery({
  queryKey: ['deviations', userId],
  queryFn: () => fetchDeviations(userId),
});

// ❌ Bad: Manual fetch with useState
const [data, setData] = useState(null);
useEffect(() => {
  fetch('/api/deviations').then(r => r.json()).then(setData);
}, []);
```

### 3. Styling

- **Primary:** Tailwind utility classes
- **Components:** shadcn/ui components
- **Avoid:** Inline styles, CSS modules

```tsx
// ✅ Good: Tailwind utilities
<div className="flex items-center gap-4 p-6 bg-background border border-border rounded-lg">
  <Avatar src={user.avatarUrl} />
  <h3 className="font-semibold">{user.username}</h3>
</div>

// ❌ Bad: Inline styles
<div style={{ display: 'flex', padding: '24px' }}>...</div>
```

## Testing Rules

### 1. Test Coverage

**Minimum:** 30% coverage (current baseline)
**Target:** 80% coverage for critical paths

### 2. Test Structure

```typescript
// ✅ Good: Descriptive test names
describe('DeviationCard', () => {
  it('should display deviation title and status', () => {
    const deviation = { id: '1', title: 'Test', status: 'draft' };
    render(<DeviationCard deviation={deviation} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});

// ❌ Bad: Unclear test names
it('works', () => { /* ... */ });
```

### 3. Mocking

- Mock external APIs (DeviantArt, R2)
- Mock Prisma in unit tests
- Use actual database in integration tests

## Error Handling

### 1. Structured Errors

```typescript
// ✅ Good: Structured error response
return res.status(400).json({
  error: 'Invalid deviation status',
  code: 'INVALID_STATUS',
  details: { allowed: ['draft', 'scheduled'], received: status },
});

// ❌ Bad: String error
return res.status(400).send('Bad request');
```

### 2. Logging

- Use structured logging (JSON format)
- Include context (userId, deviationId, etc.)
- **Never** log sensitive data (tokens, passwords)

```typescript
// ✅ Good
console.log(JSON.stringify({
  level: 'error',
  message: 'Failed to publish deviation',
  deviationId,
  userId,
  error: err.message,
}));

// ❌ Bad
console.log('Error:', err); // Unstructured, may leak tokens
```

## Performance Rules

### 1. Database Queries

- Use `select` to limit fields returned
- Use `include` sparingly - prefer separate queries for optional data
- Add indexes for frequently filtered/sorted columns

```typescript
// ✅ Good: Select only needed fields
const deviation = await prisma.deviation.findUnique({
  where: { id },
  select: { id: true, title: true, status: true },
});

// ❌ Bad: Fetch all fields
const deviation = await prisma.deviation.findUnique({ where: { id } });
```

### 2. Caching

- Use Redis for frequently accessed data (galleries, browse cache)
- Set appropriate TTLs (5 minutes default, 2 hours stale)
- Implement stale-while-revalidate pattern

### 3. Pagination

**Rule:** ALWAYS paginate list endpoints

```typescript
// ✅ Good: Cursor-based pagination
const deviations = await prisma.deviation.findMany({
  where: { userId },
  take: 20,
  cursor: lastId ? { id: lastId } : undefined,
  orderBy: { createdAt: 'desc' },
});

// ❌ Bad: No pagination
const deviations = await prisma.deviation.findMany({ where: { userId } });
```

## File Organization

```
apps/isekai-backend/
├── src/
│   ├── routes/        # Express route handlers (1 file per resource)
│   ├── middleware/    # Auth, rate limiting, error handling
│   ├── lib/           # Shared utilities (deviantart-api, storage, redis)
│   ├── queues/        # BullMQ queue setup
│   └── jobs/          # (deprecated - moved to publisher)

apps/isekai-publisher/
├── src/
│   ├── queues/        # Queue processors (deviation-publisher, token-maintenance)
│   ├── jobs/          # Background jobs (auto-scheduler, recovery jobs)
│   ├── lib/           # Publisher-specific utilities
│   └── index.ts       # Entry point with graceful shutdown

apps/isekai-frontend/
├── src/
│   ├── pages/         # React Router pages
│   ├── components/    # Reusable UI components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Frontend utilities
│   └── store/         # Zustand stores

packages/shared/
├── prisma/
│   └── schema.prisma  # Single source of truth for database schema
├── src/
│   ├── index.ts       # Shared types export
│   ├── crypto.ts      # Encryption utilities
│   └── publisher/     # Publisher queue types
```

## Dependencies

**Approved packages:** See `.context/architecture/dependencies.md`

**License compatibility:** All dependencies MUST be AGPL-3.0 compatible

**Adding dependencies:**
1. Check license compatibility
2. Evaluate bundle size impact (frontend)
3. Consider security/maintenance status
4. Document in `architecture/dependencies.md`

## Version Compatibility

- **Node.js:** 20+ (LTS)
- **pnpm:** 9+
- **PostgreSQL:** 16+
- **Redis:** 7+
- **TypeScript:** 5.6+

## Multi-Tenancy (SaaS Mode)

**Rule:** Use InstanceSettings and InstanceUser models for SaaS features

```typescript
// ✅ Good: Check instance role
const instanceUser = await prisma.instanceUser.findUnique({
  where: { daUserId: user.deviantartId },
});
if (instanceUser?.role !== 'admin') {
  return res.status(403).json({ error: 'Admin only' });
}

// ✅ Good: Use S3_PATH_PREFIX for multi-tenant storage
const storageKey = `${S3_PATH_PREFIX || ''}deviations/${deviationId}/${filename}`;
```

## Critical Don'ts

1. **NEVER** modify execution lock logic without thorough review
2. **NEVER** skip token refresh mechanism
3. **NEVER** bypass circuit breaker protection
4. **NEVER** make HTTP calls from publisher to backend API
5. **NEVER** commit `.env` files or secrets
6. **NEVER** push directly to `main` branch
7. **NEVER** merge PRs without passing CI checks
8. **NEVER** use `docker-compose up` in production (use `docker-compose.yml` for dev only)

## Pre-Commit Checklist

- [ ] Code follows style guidelines
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (warnings acceptable)
- [ ] No console.logs in production code (unless intentional logging)
- [ ] Commit message follows Conventional Commits
- [ ] License header present in new files
- [ ] Tests added for new features
- [ ] Documentation updated if needed

## Related Files

- See `.context/anti-patterns.md` for common mistakes
- See `.context/boundaries.md` for modification limits
- See `.context/workflows.md` for development process
- See `.context/guidelines.md` for PR review checklist
