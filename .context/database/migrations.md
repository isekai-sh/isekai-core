# Database Migrations Workflow

**Purpose:** Guide for creating, applying, and managing Prisma migrations
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

**ORM:** Prisma 7.4.1
**Migration Tool:** Prisma Migrate
**Schema Location:** `packages/shared/prisma/schema.prisma`
**Migrations Directory:** `packages/shared/prisma/migrations/`

---

## Development Workflow

### 1. Edit Schema

**Location:** `packages/shared/prisma/schema.prisma`

**Example Change:**

```prisma
model Deviation {
  id     String @id @default(uuid())
  userId String
  title  String

  // NEW: Add tags field
  tags   String[] @default([])

  // ... rest of model
}
```

### 2. Generate Migration

```bash
cd packages/shared

# Generate migration (prompts for name)
pnpm prisma migrate dev

# Or with name
pnpm prisma migrate dev --name add_tags_to_deviation
```

**What Happens:**

1. Prisma analyzes schema changes
2. Generates SQL migration file in `prisma/migrations/`
3. Applies migration to development database
4. Regenerates Prisma Client

**Generated File:**

```
prisma/migrations/
└── 20250105123456_add_tags_to_deviation/
    └── migration.sql
```

**Example SQL:**

```sql
-- AlterTable
ALTER TABLE "deviations" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
```

### 3. Review Generated SQL

**CRITICAL:** Always review the migration SQL before committing!

**Check For:**

- ✅ Correct column types
- ✅ Default values provided for NOT NULL columns
- ✅ Indexes added for frequently queried columns
- ⚠️ Data loss (column drops, type changes)
- ⚠️ Breaking changes affecting existing code

### 4. Test Migration

```bash
# Apply to clean database copy
DATABASE_URL="postgresql://localhost/test_db" pnpm prisma migrate dev

# Test rollback capability
DATABASE_URL="postgresql://localhost/test_db" pnpm prisma migrate reset
```

### 5. Regenerate Prisma Client

```bash
# In packages/shared
pnpm prisma generate

# Rebuild shared package (REQUIRED!)
cd ../..
pnpm --filter @isekai/shared build
```

**Why Rebuild:**
All apps import `@isekai/shared`, which contains generated Prisma Client types. Must rebuild after schema changes.

### 6. Update Application Code

**TypeScript will catch breaking changes:**

```typescript
// If you added non-nullable field without default
const deviation = await prisma.deviation.create({
  data: {
    title: 'My Art',
    // ERROR: tags is required!
  },
});
```

**Fix:**

```typescript
const deviation = await prisma.deviation.create({
  data: {
    title: 'My Art',
    tags: [], // Provide default
  },
});
```

### 7. Commit Migration

```bash
git add packages/shared/prisma/migrations/
git add packages/shared/prisma/schema.prisma
git commit -m "feat(db): add tags array to Deviation model"
```

**Always commit:**

- Schema file
- Migration SQL files
- Updated lockfile (if Prisma version changed)

---

## Production Deployment

### Automatic Migration (Recommended)

**Docker Compose:**

```yaml
services:
  backend:
    build: ./apps/isekai-backend
    command: sh -c "npx prisma migrate deploy && node dist/index.js"
    environment:
      DATABASE_URL: postgresql://...
```

**What `migrate deploy` does:**

1. Checks which migrations are applied (in `_prisma_migrations` table)
2. Applies any pending migrations
3. Does NOT prompt for input (non-interactive)

### Manual Migration

```bash
# SSH into production server
ssh production-server

# Apply pending migrations
cd /app/packages/shared
DATABASE_URL="postgresql://..." pnpm prisma migrate deploy
```

### Rollback Strategy

**Prisma Migrate does NOT support rollback!**

**Workaround:**

1. **Create reversal migration:**

   ```bash
   pnpm prisma migrate dev --name revert_add_tags
   ```

2. **Write reverse SQL manually:**

   ```sql
   -- Migration: revert_add_tags
   ALTER TABLE "deviations" DROP COLUMN "tags";
   ```

3. **Apply reversal:**
   ```bash
   pnpm prisma migrate deploy
   ```

**Better Approach:**

- Test thoroughly before deploying
- Use feature flags for schema-dependent features
- Deploy migrations separately from code

---

## Common Migration Patterns

### Adding Nullable Column (Safe)

```prisma
model Deviation {
  // Safe - no default needed
  newField String?
}
```

**Generated SQL:**

```sql
ALTER TABLE "deviations" ADD COLUMN "new_field" TEXT;
```

### Adding Non-Nullable Column with Default (Safe)

```prisma
model Deviation {
  // Safe - has default
  newField String @default("default value")
}
```

**Generated SQL:**

```sql
ALTER TABLE "deviations" ADD COLUMN "new_field" TEXT NOT NULL DEFAULT 'default value';
```

### Adding Non-Nullable Column without Default (UNSAFE!)

```prisma
model Deviation {
  // UNSAFE - will fail if existing rows!
  newField String
}
```

**Fix:**
Two-phase migration:

**Phase 1:** Add nullable

```prisma
newField String?
```

**Phase 2:** Backfill data

```sql
UPDATE "deviations" SET "new_field" = 'computed value' WHERE "new_field" IS NULL;
```

**Phase 3:** Make non-nullable

```prisma
newField String
```

### Renaming Column (Data Preserved)

```prisma
model Deviation {
  // Old
  oldName String

  // New (rename via migration)
  newName String @map("old_name")
}
```

**Then create migration:**

```bash
pnpm prisma migrate dev --name rename_old_name_to_new_name
```

**Prisma will generate:**

```sql
-- No SQL needed! Just mapping changes
```

**Manual rename (if needed):**

```sql
ALTER TABLE "deviations" RENAME COLUMN "old_name" TO "new_name";
```

### Removing Column (Data Loss!)

```prisma
model Deviation {
  // Remove field from schema
  // oldField String  <- Delete this line
}
```

**Generated SQL:**

```sql
ALTER TABLE "deviations" DROP COLUMN "old_field";
```

**⚠️ WARNING:** Data lost permanently!

### Adding Index

```prisma
model Deviation {
  userId String
  status DeviationStatus

  @@index([userId, status])
}
```

**Generated SQL:**

```sql
CREATE INDEX "deviations_user_id_status_idx" ON "deviations"("user_id", "status");
```

**Best Practice:**
Add indexes BEFORE deploying code that queries by those columns.

### Adding Unique Constraint

```prisma
model Deviation {
  deviationId String? @unique
}
```

**Generated SQL:**

```sql
CREATE UNIQUE INDEX "deviations_deviation_id_key" ON "deviations"("deviation_id");
```

**⚠️ WARNING:** Will fail if duplicate values exist!

**Safe Approach:**

```sql
-- Check for duplicates first
SELECT "deviation_id", COUNT(*) FROM "deviations"
WHERE "deviation_id" IS NOT NULL
GROUP BY "deviation_id"
HAVING COUNT(*) > 1;

-- Clean up duplicates before adding constraint
```

### Adding Relation

```prisma
model Deviation {
  automationId String?
  automation   Automation? @relation(fields: [automationId], references: [id], onDelete: SetNull)
}

model Automation {
  id                  String      @id
  scheduledDeviations Deviation[]
}
```

**Generated SQL:**

```sql
ALTER TABLE "deviations" ADD COLUMN "automation_id" TEXT;

CREATE INDEX "deviations_automation_id_idx" ON "deviations"("automation_id");

ALTER TABLE "deviations"
ADD CONSTRAINT "deviations_automation_id_fkey"
FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE SET NULL;
```

**Cascade Behaviors:**

- `onDelete: Cascade`: Delete child when parent deleted
- `onDelete: SetNull`: Set FK to null when parent deleted
- `onDelete: Restrict`: Prevent parent deletion if children exist
- No `onDelete`: Default (Restrict)

---

## Migration Commands

### Development

```bash
# Create and apply migration
pnpm prisma migrate dev

# Create migration without applying
pnpm prisma migrate dev --create-only

# Apply pending migrations
pnpm prisma migrate dev

# Reset database (drops all data!)
pnpm prisma migrate reset

# Check migration status
pnpm prisma migrate status
```

### Production

```bash
# Apply pending migrations (non-interactive)
pnpm prisma migrate deploy

# Check what will be applied
pnpm prisma migrate status
```

### Other

```bash
# Generate Prisma Client from schema
pnpm prisma generate

# Open Prisma Studio (GUI)
DATABASE_URL="..." pnpm prisma studio

# Format schema file
pnpm prisma format

# Validate schema
pnpm prisma validate
```

---

## Environment Variables

**Required for Migrations:**

```bash
DATABASE_URL="postgresql://user:password@host:port/database"
```

**Optional:**

```bash
# Custom migrations directory
PRISMA_MIGRATION_DIR="./custom_migrations"

# Skip migration prompts
PRISMA_MIGRATE_SKIP_SEED=true
```

---

## Troubleshooting

### Migration Failed Mid-Execution

**Problem:** Migration partially applied, now stuck.

**Solution:**

```bash
# Mark as rolled back
pnpm prisma migrate resolve --rolled-back <migration_name>

# Or mark as applied (if you manually fixed)
pnpm prisma migrate resolve --applied <migration_name>
```

### Schema Drift Detected

**Problem:** Database schema doesn't match Prisma schema.

**Solution:**

```bash
# Generate migration to sync
pnpm prisma migrate dev

# Or reset database (DESTRUCTIVE!)
pnpm prisma migrate reset
```

### Migration Conflicts (Multiple Devs)

**Problem:** Two developers created migrations with same timestamp.

**Solution:**

1. Pull latest migrations
2. Delete your local migration
3. Regenerate: `pnpm prisma migrate dev`
4. Prisma creates new timestamp

### Cannot Find Prisma Client

**Problem:** TypeScript can't find `@prisma/client` types.

**Solution:**

```bash
# Regenerate client
cd packages/shared
pnpm prisma generate

# Rebuild shared package
cd ../..
pnpm --filter @isekai/shared build
```

### Migration Takes Too Long

**Problem:** Adding index on large table blocks for minutes.

**Solution - Concurrent Index:**

```sql
-- Instead of
CREATE INDEX "idx_name" ON "table"("column");

-- Use
CREATE INDEX CONCURRENTLY "idx_name" ON "table"("column");
```

**Note:** Cannot be in transaction. Edit migration SQL manually.

---

## Best Practices

### 1. Small, Incremental Migrations

✅ Good: One logical change per migration
❌ Bad: 10 unrelated changes in one migration

### 2. Descriptive Names

✅ Good: `add_execution_lock_to_deviation`
❌ Bad: `update_schema`, `fix`

### 3. Test on Staging First

```bash
# Staging database
DATABASE_URL="postgresql://staging..." pnpm prisma migrate deploy

# Verify application works
# ...

# Then production
DATABASE_URL="postgresql://prod..." pnpm prisma migrate deploy
```

### 4. Never Edit Applied Migrations

Once committed and applied, migrations are immutable. Create new migration to change.

### 5. Backup Before Major Changes

```bash
# PostgreSQL backup
pg_dump database_name > backup_2025-01-05.sql

# Apply migration
pnpm prisma migrate deploy

# If disaster, restore
psql database_name < backup_2025-01-05.sql
```

### 6. Use Transactions (Default)

Prisma wraps migrations in transactions automatically. If migration fails, everything rolls back.

**Exception:** Cannot use transactions for:

- `CREATE INDEX CONCURRENTLY`
- Some ALTER TYPE operations

Mark as non-transactional:

```sql
-- Migration: add_concurrent_index
-- PRISMA_MIGRATE: non-transactional

CREATE INDEX CONCURRENTLY ...
```

### 7. Document Complex Migrations

```sql
-- Migration: refactor_automation_rules
--
-- This migration splits AutomationRule into two models:
-- - AutomationScheduleRule (when to run)
-- - AutomationDefaultValue (what to apply)
--
-- Data is preserved by...

ALTER TABLE ...
```

---

## CI/CD Integration

**GitHub Actions Example:**

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - name: Setup PostgreSQL
        run: docker run -d -p 5432:5432 postgres:16

      - name: Apply Migrations
        run: |
          cd packages/shared
          DATABASE_URL="postgresql://localhost/test" pnpm prisma migrate deploy

      - name: Run Tests
        run: pnpm test
```

---

## Prisma Studio

**GUI for browsing database:**

```bash
DATABASE_URL="postgresql://..." pnpm --filter @isekai/shared prisma:studio
```

Opens on http://localhost:5555

**Features:**

- Browse all tables
- Edit records (with validation)
- Run queries
- View relations

**Use Cases:**

- Debug data issues
- Test queries
- Quick data edits

---

## Seeding

**Seed File:** `packages/shared/prisma/seed.ts` (if exists)

**Run Seed:**

```bash
DATABASE_URL="..." pnpm --filter @isekai/shared prisma:seed your@email.com
```

**Current Seed:**
Creates test PRO account with sample data.

---

## Related Files

- `.context/database/schema.md` - Schema reference
- `.context/database/models.md` - Model explanations
- `packages/shared/prisma/schema.prisma` - Schema source
- `packages/shared/prisma/migrations/` - Migration history
