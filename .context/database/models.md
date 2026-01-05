# Database Models - Detailed Explanations

**Purpose:** In-depth explanation of each database model and its purpose
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## User Model

**Purpose:** DeviantArt user authentication and profile data

**Key Concepts:**
- One user per DeviantArt account
- OAuth tokens encrypted at rest (AES-256-GCM)
- Timezone-aware scheduling

**Token Lifecycle:**
- **Access Token:** 1 hour expiry, used for API requests
- **Refresh Token:** 90 days expiry, used to get new access tokens
- **Proactive Refresh:** Token maintenance job refreshes 7 days before expiry

**Email Warnings (v0.1.0-alpha.1+):**
```typescript
if (daysUntilExpiry <= 7 && !user.refreshTokenWarningEmailSent) {
  await sendEmail('Token expiring in 7 days');
  await updateUser({ refreshTokenWarningEmailSent: true });
}

if (daysUntilExpiry <= 1 && !user.refreshTokenExpiredEmailSent) {
  await sendEmail('URGENT: Token expiring in 1 day');
  await updateUser({ refreshTokenExpiredEmailSent: true });
}
```

**Timezone Field:**
Used for automation scheduling - converts user's local time to UTC for `actualPublishAt`.

---

## Deviation Model

**Purpose:** Artwork/content to be published to DeviantArt

**Lifecycle Stages:**

1. **review** → User uploads files, system creates deviation
2. **draft** → User marks as ready but not scheduled
3. **scheduled** → Automation or user sets publish time
4. **uploading** → Publisher worker uploads files to DeviantArt
5. **publishing** → Publisher submits metadata to DeviantArt API
6. **published** → Successfully posted (stores `deviationId`, `deviationUrl`)
7. **failed** → Error occurred (stores `errorMessage`, can retry)

**Execution Lock Pattern (CRITICAL):**

```typescript
// Prevents duplicate processing by multiple workers or automation runs
executionLockId: UUID       // Unique lock identifier
executionLockedAt: DateTime // When lock was acquired
executionVersion: Int       // Optimistic locking counter
```

**Why Multiple Lock Fields:**
- `executionLockId`: Primary lock (null = unlocked)
- `executionLockedAt`: Detect stale locks (>1 hour old)
- `executionVersion`: Prevent race conditions with optimistic locking

**Post Count Guard:**
```typescript
postCountIncremented: Boolean
```
Prevents double-incrementing user's post count on job retry.

**Jitter System:**
```typescript
scheduledAt: DateTime     // User-visible schedule time
jitterSeconds: Int        // Random offset in seconds (±300)
actualPublishAt: DateTime // scheduledAt + jitterSeconds (actual queue time)
```

**Display Resolution Values:**
- 0 = Original (no resize)
- 1 = 400px max
- 2 = 600px
- 3 = 800px
- 4 = 900px
- 5 = 1024px
- 6 = 1280px
- 7 = 1600px
- 8 = 1920px

**Tags Array:**
PostgreSQL native array type (`String[]`), max 30 tags.

---

## DeviationFile Model

**Purpose:** Individual files attached to deviation

**Storage Integration (v0.1.0-alpha.3+):**
```typescript
// Storage key with multi-tenant prefix
const storageKey = `${S3_PATH_PREFIX || ''}deviations/${deviationId}/${filename}`;

// Generated presigned URL for upload
const storageUrl = await storage.getPresignedUrl(storageKey, 'putObject', 3600);
```

**MIME Type Support:**
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Videos: `video/mp4`, `video/quicktime`

**Metadata Extraction:**
- Images: `width`, `height` via Sharp
- Videos: `width`, `height`, `duration` via ffprobe (planned)

**Sort Order:**
For multiple files, determines display order (0-indexed).

**Cascade Deletion:**
`onDelete: Cascade` ensures files deleted when deviation is deleted.

---

## Automation Model

**Purpose:** Workflow that automatically schedules drafts based on rules

**Draft Selection Methods:**
- **random**: Random selection from available drafts
- **fifo**: First In First Out (oldest drafts first)
- **lifo**: Last In First Out (newest drafts first)

**Execution Lock (Different from Deviation):**
```typescript
lastExecutionLock: DateTime?
isExecuting: Boolean
```
Simpler lock - just prevents concurrent automation runs. Not as critical as deviation execution locks.

**Jitter Configuration:**
```typescript
jitterMinSeconds: Int @default(0)        // Minimum random offset
jitterMaxSeconds: Int @default(300)      // Maximum random offset (±5 min default)
```

Applied to each scheduled deviation individually.

**Sale Queue Integration:**
```typescript
autoAddToSaleQueue: Boolean
saleQueuePresetId: String?
```
If enabled, automatically adds scheduled deviations to sale queue with specified price preset.

**Color & Icon:**
UI customization for visual distinction between workflows (e.g., "Exclusive Posts" in red, "Free Art" in blue).

---

## AutomationScheduleRule Model

**Purpose:** Defines WHEN automation should execute

**Rule Types:**

### 1. Fixed Time
Schedule at specific time(s) each day.

```json
{
  "type": "fixed_time",
  "timeOfDay": "14:00",
  "daysOfWeek": ["monday", "wednesday", "friday"]
}
```

Interprets `timeOfDay` in user's timezone (from `User.timezone`).

### 2. Fixed Interval
Schedule every N minutes.

```json
{
  "type": "fixed_interval",
  "intervalMinutes": 240,
  "deviationsPerInterval": 2
}
```

Example: Every 4 hours, schedule 2 deviations.

### 3. Daily Quota
Maximum posts per day (enforced by auto-scheduler).

```json
{
  "type": "daily_quota",
  "dailyQuota": 5
}
```

Auto-scheduler checks how many deviations scheduled today before adding more.

**Priority Field:**
When multiple rules could trigger simultaneously, higher priority executes first.

**Days of Week Format:**
JSON array of lowercase day names:
```json
["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
```

---

## AutomationDefaultValue Model

**Purpose:** Default metadata applied to scheduled deviations

**Supported Fields:**
- `description`: String
- `tags`: Array of strings
- `isMature`: Boolean
- `matureLevel`: "moderate" | "strict"
- `categoryPath`: String (e.g., "digitalart/paintings/fantasy")
- `galleryIds`: Array of strings
- `isAiGenerated`: Boolean
- `noAi`: Boolean
- `allowComments`: Boolean
- `allowFreeDownload`: Boolean
- `stashOnly`: Boolean

**Apply Logic:**
```typescript
if (applyIfEmpty && deviation[fieldName] != null) {
  // Field already has value, skip
  return;
}

// Apply default value
deviation[fieldName] = defaultValue.value;
```

**JSON Storage:**
Flexible storage allows any type (string, number, boolean, array, object).

---

## AutomationExecutionLog Model

**Purpose:** Audit trail of automation runs

**Tracked Information:**
- When automation executed
- How many deviations scheduled
- Errors encountered
- Which rule type triggered

**Use Cases:**
- Debugging automation issues
- Analytics (posts per day, success rate)
- User visibility into automation activity

---

## PricePreset Model

**Purpose:** Reusable pricing templates for exclusive content

**Pricing Logic:**

### Fixed Price
```json
{
  "name": "Standard",
  "price": 5000,  // $50.00
  "minPrice": null,
  "maxPrice": null
}
```

### Random Range
```json
{
  "name": "Variable",
  "price": 5000,      // Fallback if random fails
  "minPrice": 3000,   // $30.00
  "maxPrice": 10000   // $100.00
}
```

Random value calculated when deviation added to sale queue.

**Default Preset:**
`isDefault: true` - auto-selected when creating new sale queue items.

**Currency Support:**
Currently USD only, but designed for future expansion (EUR, GBP, etc.).

**Price in Cents:**
Avoids floating-point precision issues. Display: `price / 100`.

---

## SaleQueue Model

**Purpose:** Queue for batch-processing exclusive content pricing

**Workflow:**

1. **pending**: User adds deviation to queue with price preset
2. **processing**: Browser automation (planned) applies price on DeviantArt
3. **completed**: Successfully priced (screenshot stored as proof)
4. **failed**: Error occurred (e.g., DeviantArt issue)
5. **skipped**: User intentionally skipped

**Processing Lock:**
```typescript
processingBy: String?  // Worker ID processing this item
lockedAt: DateTime?    // When lock acquired
```

Simpler than deviation execution locks (no optimistic locking needed).

**Retry Logic:**
```typescript
attempts: Int
lastAttemptAt: DateTime?
```

Max 3 attempts before marking as failed.

**Screenshot Proof:**
```typescript
screenshotKey: String?  // S3 key to screenshot
```

Stores proof that price was set correctly (for audit/dispute resolution).

**Error Details:**
```typescript
errorMessage: String?   // Human-readable error
errorDetails: Json?     // Stack trace, context
```

---

## GalleryCache Model

**Purpose:** Cache DeviantArt gallery/folder structure

**Why Cache:**
DeviantArt API is slow (2-3 seconds per request) and has rate limits. Caching gallery structure improves UX.

**Cache Invalidation:**
- **Fresh**: < 5 minutes
- **Stale**: 5 minutes to 2 hours (return but revalidate in background)
- **Expired**: > 2 hours (force refresh)

**Folder Hierarchy:**
```typescript
parentId: String?  // null = root gallery
```

Allows building tree structure in frontend.

---

## BrowseCache Model

**Purpose:** Cache DeviantArt browse results (popular, newest, daily-deviations)

**Cache Key Format:**
```typescript
`${mode}:${category}:${date}:${offset}`
// Example: "popular:digitalart:2025-01-05:0"
```

**Why Date in Key:**
Browse results change daily (especially "daily-deviations" mode).

**Response Data:**
Serialized JSON string (PostgreSQL TEXT column). Could be optimized to JSONB for queries.

---

## NoteFolder, NoteLabel, NoteFolderLabel Models

**Purpose:** DeviantArt notes management (future feature)

**Current Status:** Database models exist, API routes incomplete.

**Planned Features:**
- Inbox/Sent/Drafts folders
- Label system (like Gmail labels)
- Note templates for quick replies
- Search and filtering

**Note Folder Types:**
- inbox
- unread
- starred
- spam
- sent
- drafts

---

## Template Model

**Purpose:** Reusable metadata templates

**Template Types:**
- **tag**: Pre-defined tag lists
- **description**: Description templates with variables
- **comment**: Quick reply templates

**Content Structure (JSON):**
```json
// Tag template
{
  "tags": ["digital art", "fantasy", "character design"]
}

// Description template with variables
{
  "template": "Check out my latest {{artType}}! Created using {{software}}.",
  "variables": ["artType", "software"]
}
```

**Use Case:**
User creates template "Fantasy Art Tags", applies to multiple deviations quickly.

---

## ApiKey Model

**Purpose:** API keys for external integrations

**Format:**
```
isk_live_abc123def456ghi789...    (production)
isk_test_abc123def456ghi789...    (testing)
```

**Security:**
- Only bcrypt hash stored in database
- Plain key shown once on creation
- `keyPrefix` stored for identification (first 8 chars)

**Use Cases:**
- ComfyUI integration (automated workflow triggers)
- Mobile apps (future)
- Third-party tools

**Hybrid Auth:**
Routes can accept both session cookies AND API keys via `hybridAuth` middleware.

---

## AdminRole Model

**Purpose:** Admin permissions (legacy - use InstanceUser for SaaS)

**Roles:**
- `super_admin`: Full system access
- `admin`: Instance management
- `support`: Read-only support access

**Revocation:**
```typescript
revokedAt: DateTime?
revokedBy: String?
```

Tracks when and who revoked the role (audit trail).

---

## InstanceUser Model (v0.1.0-alpha.3+)

**Purpose:** Multi-tenant SaaS - which DeviantArt users can access this instance

**Relationship to User:**
```typescript
InstanceUser.daUserId == User.deviantartId
```

Links to existing User records.

**Roles:**
- **admin**: Can manage instance settings, invite users
- **member**: Standard user access

**Use Case:**
```
Instance: isekai-tenant-abc123
├── User: Alice (admin)
├── User: Bob (member)
└── User: Carol (member)
```

All three users share same database, automations, storage (with S3_PATH_PREFIX).

**First User = Admin:**
When instance first deployed, first user to log in becomes admin automatically.

---

## InstanceSettings Model (v0.1.0-alpha.3+)

**Purpose:** Runtime-configurable instance settings

**Singleton Pattern:**
```typescript
id: "singleton"  // Only one row ever exists
```

Always use:
```typescript
const settings = await prisma.instanceSettings.findUnique({
  where: { id: 'singleton' }
});
```

**Settings:**
- `teamInvitesEnabled`: Allow admin to invite additional users

**Planned Settings:**
- `customDomain`: Custom domain for this instance
- `brandingLogo`: Custom logo URL
- `maxUsers`: User limit
- `storageQuota`: Storage quota in GB

**Override Pattern:**
Environment variables provide defaults, InstanceSettings override at runtime.

---

## Indexing Strategy

**Performance-Critical Indexes:**

```sql
-- User lookups
CREATE UNIQUE INDEX ON users(deviantart_id);

-- Deviation queries (most frequent)
CREATE INDEX ON deviations(user_id, status);
CREATE INDEX ON deviations(status, actual_publish_at);  -- Past-due recovery
CREATE INDEX ON deviations(execution_lock_id, status);  -- Lock cleanup

-- Automation queries
CREATE INDEX ON automations(user_id, enabled);
CREATE INDEX ON deviations(automation_id);

-- Sale queue queries
CREATE INDEX ON sale_queue(user_id, status);
CREATE INDEX ON sale_queue(status, created_at);
```

**Why These Indexes:**
- `(user_id, status)`: "Show me my drafts" query
- `(status, actual_publish_at)`: Past-due recovery job scans all scheduled deviations past their time
- `(execution_lock_id, status)`: Lock cleanup finds all locked deviations

---

## Data Retention

**Cache Models:**
- GalleryCache: Auto-purge after 7 days (planned)
- BrowseCache: Auto-purge after 7 days (planned)

**Logs:**
- AutomationExecutionLog: Keep 90 days (planned)

**Soft Deletes:**
No soft deletes currently. All deletes are hard deletes with cascades.

---

## Cascade Deletion Strategy

**Cascade on User Delete:**
- ✅ Deviations (and files via cascade)
- ✅ Automations (and rules/defaults/logs)
- ✅ PricePresets
- ✅ SaleQueue
- ✅ ApiKeys
- ✅ Templates
- ❌ GalleryCache (orphaned - cleanup job needed)
- ❌ BrowseCache (orphaned - cleanup job needed)

**SetNull on Soft References:**
```prisma
Deviation.automationId → Automation (onDelete: SetNull)
```

If automation deleted, deviations keep their data but lose automation link.

---

## JSON Fields

**Models Using JSON:**
- AutomationScheduleRule.daysOfWeek: `["monday", "friday"]`
- AutomationDefaultValue.value: Flexible storage for any type
- Template.content: Template structure
- SaleQueue.errorDetails: Error context

**Why JSON:**
Flexible schema without migrations. Trade-off: Can't query JSON fields efficiently.

**Future Consideration:**
Migrate to JSONB (PostgreSQL) for better query performance and indexing.

---

## Related Files

- `.context/database/schema.md` - Schema reference
- `.context/database/migrations.md` - Migration workflow
- `.context/architecture/patterns.md` - Execution lock pattern
- `.context/features/automation.md` - Automation workflow details
