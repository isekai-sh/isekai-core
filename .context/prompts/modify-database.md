# Prompt: Modify Database Schema

**Purpose:** Guide for adding/modifying Prisma schema and database tables

---

## Prerequisites

- [ ] DATABASE_URL configured
- [ ] Prisma CLI installed
- [ ] Local database running

---

## Step 1: Update Prisma Schema

**File:** `packages/shared/prisma/schema.prisma`

### Adding a New Model

```prisma
model MyModel {
  id        String   @id @default(cuid())
  name      String
  userId    String
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([createdAt])
}
```

### Adding a Field to Existing Model

```prisma
model Deviation {
  // ... existing fields ...
  newField  String?  // Optional field
  newField2 String   @default("value") // Required with default
}
```

### Adding an Enum

```prisma
enum MyStatus {
  pending
  processing
  completed
  failed
}

model MyModel {
  status MyStatus @default(pending)
}
```

---

## Step 2: Push Schema Changes

```bash
# Push to database (development only)
DATABASE_URL="postgresql://isekai:isekai@localhost:5434/isekai_run" \
  pnpm --filter @isekai/shared prisma:push

# Format schema
pnpm --filter @isekai/shared prisma:format

# Validate schema
pnpm --filter @isekai/shared prisma:validate
```

---

## Step 3: Generate Prisma Client

```bash
# Generate TypeScript types
pnpm --filter @isekai/shared prisma:generate

# Rebuild shared package
pnpm --filter @isekai/shared build
```

---

## Step 4: Update TypeScript Types

**File:** `packages/shared/src/index.ts`

```typescript
// Export new model type
export type { MyModel } from "@prisma/client";

// Export create/update types
export interface CreateMyModelRequest {
  name: string;
  enabled?: boolean;
}

export interface UpdateMyModelRequest {
  name?: string;
  enabled?: boolean;
}
```

---

## Step 5: Update Documentation

**File:** `.context/database/models.md`

Add model documentation:

```markdown
### MyModel

**Purpose:** Description of what this model represents.

**Fields:**
- `id` (String) - Unique identifier (CUID)
- `name` (String) - Display name
- `userId` (String) - Owner of the item
- `enabled` (Boolean) - Whether item is active
- `createdAt` (DateTime) - Creation timestamp
- `updatedAt` (DateTime) - Last update timestamp

**Relations:**
- `user` - Belongs to User (cascade delete)

**Indexes:**
- `userId` - Query items by user
- `createdAt` - Sort by creation date
```

---

## Checklist

- [ ] Schema updated in schema.prisma
- [ ] Indexes added for query performance
- [ ] Relations defined with cascade rules
- [ ] Schema pushed to database
- [ ] Prisma client generated
- [ ] Shared package rebuilt
- [ ] TypeScript types exported
- [ ] Documentation updated
- [ ] API routes updated (if needed)

---

## Common Pitfalls

1. **Missing Indexes**
   - ❌ Query by field without index (slow)
   - ✅ Add `@@index([fieldName])`

2. **No Cascade Delete**
   - ❌ Orphaned records when user deleted
   - ✅ `onDelete: Cascade` in relation

3. **Forgot to Rebuild Shared**
   - ❌ TypeScript errors in backend/frontend
   - ✅ `pnpm --filter @isekai/shared build`

4. **Default Values**
   - ❌ Required field without default (breaks existing rows)
   - ✅ Add `@default()` or make optional (`?`)

---

## Related Documentation

- `.context/database/schema.md`
- `.context/database/models.md`
- `.context/database/migrations.md`
