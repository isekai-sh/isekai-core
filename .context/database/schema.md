# Database Schema Reference

**Purpose:** Complete Prisma schema documentation with all models and relationships
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)
**Schema File:** `packages/shared/prisma/schema.prisma` (541 lines)

---

## Overview

**Database:** PostgreSQL 16
**ORM:** Prisma 7.4.1
**Total Models:** 20
**Total Enums:** 7

### Model Categories

| Category       | Models                                                                             | Purpose                                |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| **Core**       | User, Deviation, DeviationFile                                                     | User accounts and content              |
| **Automation** | Automation, AutomationScheduleRule, AutomationDefaultValue, AutomationExecutionLog | Workflow scheduling                    |
| **Sales**      | PricePreset, SaleQueue                                                             | Exclusive content pricing              |
| **Caching**    | GalleryCache, BrowseCache                                                          | API response caching                   |
| **Notes**      | NoteFolder, NoteLabel, NoteFolderLabel, NoteTemplate                               | DeviantArt notes management            |
| **Templates**  | Template                                                                           | Reusable metadata templates            |
| **Auth**       | ApiKey, AdminRole                                                                  | Authentication & authorization         |
| **SaaS**       | InstanceUser, InstanceSettings                                                     | Multi-tenant support (v0.1.0-alpha.3+) |

---

## Enums

### DeviationStatus

**Usage:** Tracks deviation lifecycle through publishing process

```prisma
enum DeviationStatus {
  review      // Newly uploaded, awaiting user review
  draft       // Work in progress, not scheduled
  scheduled   // Queued for future publishing
  uploading   // Files being uploaded to DeviantArt
  publishing  // Metadata being submitted
  published   // Successfully posted
  failed      // Publishing encountered error
}
```

**Transitions:**

```
review → draft → scheduled → uploading → publishing → published
                                           ↓
                                        failed (retry)
```

### UploadMode

```prisma
enum UploadMode {
  single    // One file per deviation (default)
  multiple  // Multiple files combined (e.g., comic pages)
}
```

### MatureLevel

```prisma
enum MatureLevel {
  moderate  // Mild mature content (artistic nudity, violence)
  strict    // Explicit content (strong sexual themes, graphic violence)
}
```

### TemplateType

```prisma
enum TemplateType {
  tag          // Tag lists
  description  // Description templates
  comment      // Comment templates
}
```

### NoteFolderType

```prisma
enum NoteFolderType {
  inbox
  unread
  starred
  spam
  sent
  drafts
}
```

### SaleQueueStatus

```prisma
enum SaleQueueStatus {
  pending     // Awaiting processing
  processing  // Currently being priced
  completed   // Successfully priced
  failed      // Error during processing
  skipped     // Intentionally skipped
}
```

### InstanceUserRole (v0.1.0-alpha.3+)

```prisma
enum InstanceUserRole {
  admin   // Full instance access
  member  // Standard user access
}
```

---

## Core Models

### User

**Purpose:** DeviantArt user account and OAuth tokens

```prisma
model User {
  id                           String    @id @default(uuid())
  deviantartId                 String    @unique
  username                     String
  avatarUrl                    String?
  email                        String?

  // OAuth tokens (encrypted at rest)
  accessToken                  String
  refreshToken                 String
  tokenExpiresAt               DateTime
  refreshTokenExpiresAt        DateTime

  // Token maintenance tracking
  refreshTokenWarningEmailSent Boolean   @default(false)
  refreshTokenExpiredEmailSent Boolean   @default(false)
  lastRefreshTokenRefresh      DateTime?

  // User preferences
  timezone                     String    @default("UTC")

  createdAt                    DateTime  @default(now())
  updatedAt                    DateTime  @updatedAt

  // Relations
  deviations     Deviation[]
  noteFolders    NoteFolder[]
  noteLabels     NoteLabel[]
  noteTemplates  NoteTemplate[]
  templates      Template[]
  apiKeys        ApiKey[]
  galleriesCache GalleryCache[]
  browseCache    BrowseCache[]
  adminRoles     AdminRole[]
  pricePresets   PricePreset[]
  saleQueues     SaleQueue[]
  automations    Automation[]
}
```

**Indexes:**

- Primary: `id`
- Unique: `deviantartId`

**Security Notes:**

- `accessToken` and `refreshToken` stored encrypted (AES-256-GCM)
- `refreshTokenExpiresAt` tracked for proactive renewal (90-day expiry)

### Deviation

**Purpose:** Artwork to be uploaded to DeviantArt

```prisma
model Deviation {
  id     String          @id @default(uuid())
  userId String
  status DeviationStatus @default(draft)

  // Metadata
  title            String
  description      String?
  tags             String[]        // PostgreSQL array
  categoryPath     String?         // e.g., "digitalart/paintings/fantasy"
  galleryIds       String[]        // Gallery folder IDs
  automationId     String?         // Which automation scheduled this

  // Settings
  isMature          Boolean      @default(false)
  matureLevel       MatureLevel?
  allowComments     Boolean      @default(true)
  allowFreeDownload Boolean      @default(false)
  isAiGenerated     Boolean      @default(false)
  noAi              Boolean      @default(false)
  stashOnly         Boolean      @default(false)
  addWatermark      Boolean      @default(false)
  displayResolution Int          @default(0)  // 0=original, 1-8=sized

  // Upload configuration
  uploadMode UploadMode @default(single)

  // Scheduling with jitter
  scheduledAt     DateTime?
  jitterSeconds   Int       @default(0)
  actualPublishAt DateTime?  // scheduledAt + jitter
  publishedAt     DateTime?  // Actual publish completion time

  // DeviantArt results
  stashItemId  String?
  deviationId  String?  // DeviantArt's deviation ID
  deviationUrl String?
  errorMessage String?

  // Retry tracking
  retryCount  Int       @default(0)
  lastRetryAt DateTime?

  // Execution lock (CRITICAL - see .context/boundaries.md)
  executionLockId   String?
  executionLockedAt DateTime?
  executionVersion  Int       @default(0)

  // Post count guard (prevents double increment)
  postCountIncremented Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  user       User            @relation(fields: [userId], references: [id])
  automation Automation?     @relation(fields: [automationId], references: [id], onDelete: SetNull)
  files      DeviationFile[]
  saleQueue  SaleQueue?
}
```

**Indexes (Performance-Critical):**

```prisma
@@index([userId, status])                // User's drafts/scheduled
@@index([status, actualPublishAt])       // Past-due recovery
@@index([executionLockId, status])       // Lock cleanup
@@index([automationId])                  // Automation queries
@@unique([deviationId], name: "unique_published_deviation")  // No duplicates
```

**Execution Lock Pattern:**
See `.context/architecture/patterns.md` - execution locks

### DeviationFile

**Purpose:** Uploaded files for deviation (images, videos)

```prisma
model DeviationFile {
  id               String   @id @default(uuid())
  deviationId      String
  originalFilename String
  storageKey       String   // S3 key: {prefix}/deviations/{id}/{filename}
  storageUrl       String   // Presigned or public URL
  mimeType         String   // image/jpeg, video/mp4, etc.
  fileSize         Int      // Bytes
  width            Int?
  height           Int?
  duration         Int?     // For videos (seconds)
  sortOrder        Int      @default(0)
  createdAt        DateTime @default(now())

  deviation Deviation @relation(fields: [deviationId], references: [id], onDelete: Cascade)
}
```

**Storage Key Format (v0.1.0-alpha.3+):**

```
{S3_PATH_PREFIX}/deviations/{deviationId}/{filename}
```

Multi-tenant prefix isolates files per instance.

---

## Automation Models (v0.1.0-alpha.1+)

### Automation

**Purpose:** Workflow that automatically schedules drafts

```prisma
model Automation {
  id     String  @id @default(uuid())
  userId String

  // Workflow identification
  name        String   // "Exclusive Posts", "Free Artwork"
  description String?
  color       String   @default("#6366f1")
  icon        String?
  sortOrder   Int      @default(0)

  enabled Boolean @default(false)

  // Strategy configuration
  draftSelectionMethod String  // "random", "fifo", "lifo"
  stashOnlyByDefault   Boolean @default(false)

  // Jitter (randomization)
  jitterMinSeconds Int @default(0)
  jitterMaxSeconds Int @default(300)  // ±5 minutes default

  // Execution lock (prevents concurrent runs)
  lastExecutionLock DateTime?
  isExecuting       Boolean   @default(false)

  // Sale queue integration
  autoAddToSaleQueue Boolean @default(false)
  saleQueuePresetId  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user                User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduleRules       AutomationScheduleRule[]
  defaultValues       AutomationDefaultValue[]
  executionLogs       AutomationExecutionLog[]
  saleQueuePreset     PricePreset?             @relation(fields: [saleQueuePresetId], references: [id], onDelete: SetNull)
  scheduledDeviations Deviation[]              // Track which deviations came from this automation
}
```

**Indexes:**

```prisma
@@index([userId, enabled])      // Find active automations
@@index([userId, sortOrder])    // User-ordered display
@@index([saleQueuePresetId])    // Sale integration
```

### AutomationScheduleRule

**Purpose:** Defines WHEN automation should run

```prisma
model AutomationScheduleRule {
  id           String @id @default(uuid())
  automationId String

  type String  // "fixed_time", "fixed_interval", "daily_quota"

  // Fixed time (e.g., "14:00", "09:30" in user's timezone)
  timeOfDay String?

  // Fixed interval (e.g., every 4 hours)
  intervalMinutes       Int?
  deviationsPerInterval Int?  // How many to schedule per interval

  // Daily quota (e.g., 5 posts per day)
  dailyQuota Int?

  // Day filter (JSON: ["monday", "friday"])
  daysOfWeek Json?

  priority Int     @default(0)
  enabled  Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
}
```

**Example Rules:**

```json
// Post Mon-Fri at 2pm
{ "type": "fixed_time", "timeOfDay": "14:00", "daysOfWeek": ["monday", "tuesday", "wednesday", "thursday", "friday"] }

// Post every 4 hours, 2 deviations per interval
{ "type": "fixed_interval", "intervalMinutes": 240, "deviationsPerInterval": 2 }

// Maximum 5 posts per day
{ "type": "daily_quota", "dailyQuota": 5 }
```

### AutomationDefaultValue

**Purpose:** Default metadata applied to scheduled deviations

```prisma
model AutomationDefaultValue {
  id           String @id @default(uuid())
  automationId String

  fieldName String  // "description", "tags", "isMature", "categoryPath", etc.
  value     Json    // Flexible storage for any type

  applyIfEmpty Boolean @default(true)  // Only set if field is null/empty

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
}
```

**Example Values:**

```json
// Tags
{ "fieldName": "tags", "value": ["digital art", "exclusive", "premium"] }

// Description template
{ "fieldName": "description", "value": "Check out my latest work!" }

// Category
{ "fieldName": "categoryPath", "value": "digitalart/paintings/fantasy" }

// Mature content
{ "fieldName": "isMature", "value": true }
{ "fieldName": "matureLevel", "value": "moderate" }
```

### AutomationExecutionLog

**Purpose:** Track automation execution history

```prisma
model AutomationExecutionLog {
  id           String @id @default(uuid())
  automationId String

  executedAt     DateTime @default(now())
  scheduledCount Int      @default(0)  // How many deviations scheduled
  errorMessage   String?

  triggeredByRuleType String?  // Which rule type triggered (optional)

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
}
```

---

## Sales Models

### PricePreset

**Purpose:** Reusable pricing templates for exclusive content

```prisma
model PricePreset {
  id          String   @id @default(uuid())
  userId      String
  name        String   // "Standard", "Premium", "Sale Price"
  price       Int      // Price in cents (5000 = $50.00)
  minPrice    Int?     // For random pricing
  maxPrice    Int?     // For random pricing
  currency    String   @default("USD")
  description String?
  isDefault   Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  saleQueues  SaleQueue[]
  automations Automation[]
}
```

**Price Logic:**

- If `minPrice` and `maxPrice` set: Random between range
- Otherwise: Use fixed `price`

### SaleQueue

**Purpose:** Queue for batch-processing exclusive content pricing

```prisma
model SaleQueue {
  id            String          @id @default(uuid())
  userId        String
  deviationId   String          @unique
  pricePresetId String
  price         Int             // Calculated price (from preset)
  status        SaleQueueStatus @default(pending)

  // Execution tracking
  attempts      Int       @default(0)
  lastAttemptAt DateTime?
  processingBy  String?
  lockedAt      DateTime?

  // Results
  completedAt   DateTime?
  errorMessage  String?
  errorDetails  Json?
  screenshotKey String?  // S3 key for screenshot (proof)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviation   Deviation   @relation(fields: [deviationId], references: [id], onDelete: Cascade)
  pricePreset PricePreset @relation(fields: [pricePresetId], references: [id])
}
```

**Indexes:**

```prisma
@@index([userId, status])
@@index([status, createdAt])
```

---

## Caching Models

### GalleryCache

**Purpose:** Cache DeviantArt gallery structure

```prisma
model GalleryCache {
  id       String   @id @default(uuid())
  userId   String
  folderId String   // DeviantArt folder ID
  name     String
  parentId String?
  cachedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

**TTL:** 5 minutes fresh, 2 hours stale

### BrowseCache

**Purpose:** Cache DeviantArt browse results (popular, newest, daily-deviations)

```prisma
model BrowseCache {
  id           String   @id @default(uuid())
  cacheKey     String   @unique  // e.g., "popular:digitalart:2025-01-05:0"
  userId       String?
  responseData String   // JSON-serialized response
  cachedAt     DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])
}
```

**Cache Key Format:** `{mode}:{category}:{date}:{offset}`

---

## Authentication Models

### ApiKey

**Purpose:** API keys for external integrations (e.g., ComfyUI)

```prisma
model ApiKey {
  id         String    @id @default(uuid())
  userId     String
  name       String    // "ComfyUI Integration", "Mobile App"
  keyHash    String    @unique  // bcrypt hash
  keyPrefix  String    // First 8 chars for identification (isk_live_abc12345)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Format:** `isk_live_{random}` or `isk_test_{random}`
**Security:** Only hash stored, never plain text

### AdminRole (deprecated - use InstanceUser for SaaS)

```prisma
model AdminRole {
  id        String    @id @default(uuid())
  userId    String
  role      String    // 'super_admin', 'admin', 'support'
  grantedBy String
  grantedAt DateTime  @default(now())
  revokedAt DateTime?
  revokedBy String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## SaaS Models (v0.1.0-alpha.3+)

### InstanceUser

**Purpose:** Track which DeviantArt users can access this instance

```prisma
model InstanceUser {
  id String @id @default(cuid())

  // DeviantArt identity
  daUserId   String @unique       // Links to User.deviantartId
  daUsername String
  daAvatar   String?

  role InstanceUserRole @default(member)

  createdAt   DateTime  @default(now())
  lastLoginAt DateTime?
}
```

**Use Case:** Multi-tenant SaaS deployments where multiple DA users share an instance

### InstanceSettings

**Purpose:** Runtime-configurable instance settings (overrides env vars)

```prisma
model InstanceSettings {
  id String @id @default("singleton")  // Only one row ever exists

  teamInvitesEnabled Boolean?

  updatedAt DateTime @updatedAt
}
```

**Singleton Pattern:** Only one row (id="singleton")

---

## Relationships Diagram

```
User (1)
  ├─(many) Deviation
  │    ├─(many) DeviationFile
  │    └─(one) SaleQueue
  ├─(many) Automation
  │    ├─(many) AutomationScheduleRule
  │    ├─(many) AutomationDefaultValue
  │    └─(many) AutomationExecutionLog
  ├─(many) PricePreset
  │    └─(many) SaleQueue
  ├─(many) ApiKey
  ├─(many) GalleryCache
  ├─(many) BrowseCache
  ├─(many) NoteFolder
  │    └─(many) NoteFolderLabel
  ├─(many) NoteLabel
  │    └─(many) NoteFolderLabel
  ├─(many) NoteTemplate
  └─(many) Template
```

---

## Migration Workflow

**Location:** `packages/shared/prisma/schema.prisma`

**Commands:**

```bash
# Generate migration
pnpm --filter @isekai/shared db:generate

# Apply migration
DATABASE_URL="postgresql://..." pnpm --filter @isekai/shared prisma migrate dev

# Rebuild shared package (REQUIRED after schema changes)
pnpm --filter @isekai/shared build
```

**Best Practices:**

- Never edit existing migrations
- Always review generated SQL
- Test on database copy first
- Consider backward compatibility

---

## Related Files

- `.context/database/models.md` - Detailed model explanations
- `.context/database/migrations.md` - Migration workflow guide
- `.context/architecture/patterns.md` - Execution lock pattern
- `packages/shared/prisma/schema.prisma` - Source of truth
