# Development Workflows

**Purpose:** Complete guide to local development, testing, and contribution workflow
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Local Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL client (optional, for debugging)

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/isekai-sh/isekai-core.git
cd isekai-core

# 2. Install dependencies
pnpm install

# 3. Start infrastructure
cd docker
docker-compose up -d

# 4. Copy environment file
cp .env.example .env

# 5. Configure DeviantArt OAuth (see .context/auth/oauth.md)
# Edit .env and set:
# - DEVIANTART_CLIENT_ID
# - DEVIANTART_CLIENT_SECRET
# - DEVIANTART_REDIRECT_URI

# 6. Generate encryption keys
openssl rand -base64 32  # SESSION_SECRET
openssl rand -hex 32     # ENCRYPTION_KEY

# 7. Push database schema
DATABASE_URL="postgresql://isekai:isekai@localhost:5434/isekai_run" \
  pnpm --filter @isekai/shared prisma:push

# 8. Generate Prisma client
pnpm --filter @isekai/shared prisma:generate

# 9. Build shared package
pnpm --filter @isekai/shared build

# 10. Start development servers
pnpm dev
```

**Servers Running:**
- Backend: http://localhost:4000
- Frontend: http://localhost:3000
- Publisher: http://localhost:8000 (health check)

---

## Development Commands

### Database

```bash
# Push schema changes (development)
DATABASE_URL="..." pnpm --filter @isekai/shared prisma:push

# Generate Prisma client
pnpm --filter @isekai/shared prisma:generate

# Open Prisma Studio
DATABASE_URL="..." pnpm --filter @isekai/shared prisma:studio

# Seed test data
DATABASE_URL="..." ENCRYPTION_KEY="..." \
  pnpm --filter @isekai/shared prisma:seed your@email.com

# Format schema
pnpm --filter @isekai/shared prisma:format

# Validate schema
pnpm --filter @isekai/shared prisma:validate
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch

# Specific file
pnpm test src/routes/auth.test.ts
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @isekai/shared build
pnpm --filter isekai-backend build
pnpm --filter isekai-frontend build
pnpm --filter isekai-publisher build

# Clean build artifacts
pnpm clean
```

### Linting

```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type check
pnpm typecheck
```

---

## Git Workflow

### Branch Strategy

**CRITICAL:** ALL work MUST be done in feature branches. NEVER commit directly to `main`.

**Main Branch:**
- `main` - Production-ready code (protected, merge via PR only)

**Feature Branches (Required):**
```
feature/add-bulk-scheduling
fix/execution-lock-race-condition
refactor/storage-abstraction
docs/api-endpoints
test/add-coverage-publisher
chore/update-dependencies
```

**Branch Naming Convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Testing improvements
- `chore/` - Maintenance tasks

### Commit Format (Strict)

**CRITICAL:** ALL commits MUST use multi-line Conventional Commits format.

```
<type>(<scope>): <subject>

<body with bullet points>

<footer>
```

**Required Elements:**
1. **Line 1:** Type, scope, subject (max 72 chars)
2. **Line 2:** Blank line
3. **Line 3+:** Detailed body with bullet points
4. **Last line:** Issue reference if applicable

**Forbidden:**
- ❌ Single-line commits
- ❌ Emojis
- ❌ "Generated with" or "Co-Authored-By" lines
- ❌ AI attribution

**Multi-Line Commit Example:**
```bash
git commit -m "feat(automation): add weekly quota rule type

Implements weekly_quota rule type that limits posts per calendar week.

- Add maxPostsPerWeek field to AutomationScheduleRule model
- Implement quota evaluation in auto-scheduler
- Add timezone-aware week calculation using date-fns-tz
- Update frontend UI to support weekly quota configuration
- Add validation for maxPostsPerWeek parameter

The weekly quota complements existing daily quota by tracking posts
across Sunday-Saturday periods using the user's timezone.

Closes #42"
```

**See `.context/ai-rules.md` for complete commit message guidelines.**

---

## Feature Development Workflow

**CRITICAL:** All changes go through feature branches, no direct commits to `main`.

### 1. Plan Feature

Create `.context/decisions/NNN-feature-name.md` if architectural change.

### 2. Create Feature Branch

```bash
# Always start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/feature-name
```

### 3. Implement Feature

**Make incremental commits with detailed messages:**

```bash
# Make changes
git add .

# Commit with multi-line message
git commit -m "feat(automation): add weekly quota rule type

Implements weekly_quota rule type that limits posts per calendar week.

- Add maxPostsPerWeek field to AutomationScheduleRule model
- Implement quota evaluation in auto-scheduler
- Add timezone-aware week calculation using date-fns-tz

The weekly quota complements existing daily quota by tracking posts
across Sunday-Saturday periods."

# Continue development
git add .
git commit -m "test(automation): add weekly quota tests

Adds comprehensive tests for weekly quota functionality.

- Test quota enforcement across week boundaries
- Test timezone-aware week calculation
- Test quota reset on new week
- Add edge case tests for Sunday/Saturday boundaries"
```

### 4. Test

```bash
# Run all quality checks
pnpm test
pnpm lint
pnpm typecheck

# Ensure all pass before pushing
```

### 5. Update Documentation

Update relevant `.context/` files if:
- Adding new features
- Changing architecture
- Modifying API endpoints
- Updating database schema

### 6. Push Feature Branch

```bash
# Push branch to remote
git push origin feature/feature-name
```

**CRITICAL:** Push to feature branch, NOT to `main`.

### 7. Merge to Main (Manual)

**When ready to merge:**

```bash
# Switch to main and pull latest
git checkout main
git pull origin main

# Merge feature branch
git merge feature/feature-name

# Push merged changes
git push origin main
```

**No Pull Requests required** - Direct merge to main after push.

### 8. Cleanup

```bash
# Delete local feature branch
git branch -d feature/feature-name

# Delete remote feature branch (optional)
git push origin --delete feature/feature-name
```

---

## Database Schema Changes

### Workflow

1. **Edit schema:** `packages/shared/prisma/schema.prisma`
2. **Push changes:** `pnpm --filter @isekai/shared prisma:push`
3. **Generate client:** `pnpm --filter @isekai/shared prisma:generate`
4. **Rebuild shared:** `pnpm --filter @isekai/shared build`
5. **Test:** Verify application works
6. **Commit:** Include schema file in commit

**Example:**
```bash
# Add field to model
# Edit schema.prisma

DATABASE_URL="postgresql://isekai:isekai@localhost:5434/isekai_run" \
  pnpm --filter @isekai/shared prisma:push

pnpm --filter @isekai/shared prisma:generate
pnpm --filter @isekai/shared build

git add packages/shared/prisma/schema.prisma
git commit -m "feat(db): add executionLock fields to Deviation"
```

---

## Debugging

### Backend Debugging

**VS Code `launch.json`:**
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["--filter", "isekai-backend", "dev"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

**Logs:**
```bash
# Follow backend logs
docker-compose logs -f backend

# Check publisher logs
docker-compose logs -f publisher
```

### Database Debugging

**Prisma Studio:**
```bash
DATABASE_URL="postgresql://isekai:isekai@localhost:5434/isekai_run" \
  pnpm --filter @isekai/shared prisma:studio
```

**Direct SQL:**
```bash
psql "postgresql://isekai:isekai@localhost:5434/isekai_run"
```

**Check execution locks:**
```sql
SELECT id, title, status, "executionLockId", "executionLockedAt"
FROM deviations
WHERE "executionLockId" IS NOT NULL;
```

### Redis Debugging

```bash
# Connect to Redis
docker exec -it isekai-redis redis-cli

# List keys
KEYS *

# Get value
GET key_name

# Check queue
LRANGE bull:deviation-publisher:wait 0 -1
```

---

## Common Tasks

### Add New API Endpoint

1. Create route handler: `apps/isekai-backend/src/routes/my-route.ts`
2. Add Zod validation schema
3. Register in `apps/isekai-backend/src/index.ts`
4. Create test: `apps/isekai-backend/src/routes/my-route.test.ts`
5. Document in `.context/api/endpoints.md`

### Add Database Model

1. Edit `packages/shared/prisma/schema.prisma`
2. Run `prisma:push` and `prisma:generate`
3. Rebuild shared package
4. Document in `.context/database/models.md`
5. Update `.context/database/schema.md`

### Add Background Job

1. Create job file: `apps/isekai-publisher/src/jobs/my-job.ts`
2. Register in `apps/isekai-publisher/src/index.ts`
3. Add cron schedule or queue
4. Document in `.context/workers/background-jobs.md`

### Add Frontend Page

1. Create page: `apps/isekai-frontend/src/pages/MyPage.tsx`
2. Add route in `App.tsx`
3. Create API hooks with TanStack Query
4. Update navigation

---

## Troubleshooting

### "Cannot find @isekai/shared"

**Solution:**
```bash
pnpm --filter @isekai/shared build
```

### "Prisma Client not generated"

**Solution:**
```bash
pnpm --filter @isekai/shared prisma:generate
```

### "Port already in use"

**Solution:**
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Or change port in .env
PORT=4001
```

### "Database connection failed"

**Check:**
```bash
docker ps  # Is postgres running?
psql "postgresql://isekai:isekai@localhost:5434/isekai_run"
```

---

## Related Documentation

- `.context/testing.md` - Test strategy
- `.context/guidelines.md` - PR process
- `.context/database/migrations.md` - Schema changes
- `.context/ai-rules.md` - Code style
